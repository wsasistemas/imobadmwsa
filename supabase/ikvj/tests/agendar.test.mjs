// Teste do agendamento da Sophia (Atendimento ONLINE): escolha dos horários, leitura da resposta do lead,
// fluxo completo (marcar, conflito, nenhum serve, consultor, mais horários) e JSON cortado da IA.
// Rodar (Node 22+, com type stripping):  node supabase/ikvj/tests/agendar.test.mjs
import { escolherOpcoes, interpretarHorario, interpretarRecusa, rotulo, textoOpcoes } from "../functions/_shared/agendar.ts";
import { ofertarHorarios, tratarOferta } from "../functions/_shared/atend-fluxo.ts";
import { lerJsonDaIA } from "../functions/_shared/atendimento.ts";

let ok = 0, falhas = 0;
const check = (n, c, x = "") => { if (c) { ok++; console.log("  ok   ", n); } else { falhas++; console.log("  FALHA", n, x); } };

// Horários em São Paulo (UTC-3): ter 17/11 09:00, 09:30, 14:00; qua 18/11 10:00; qui 19/11 15:00
const H = (dia, hora) => new Date(`2026-11-${dia}T${hora}:00-03:00`).toISOString();
const livres = [H(17, "09:00"), H(17, "09:30"), H(17, "14:00"), H(18, "10:00"), H(19, "15:00")].map((inicio) => ({ inicio }));

console.log("\nEscolha dos horários");
const op = escolherOpcoes(livres);
check("3 opções: o mais próximo e o primeiro de cada dia seguinte", JSON.stringify(op) === JSON.stringify([H(17, "09:00"), H(18, "10:00"), H(19, "15:00")]), JSON.stringify(op));
const op2 = escolherOpcoes(livres.slice(0, 3));
check("um dia só: completa com 2 h de distância", JSON.stringify(op2) === JSON.stringify([H(17, "09:00"), H(17, "14:00")]), JSON.stringify(op2));
check("mais horários: só depois do último oferecido", escolherOpcoes(livres, H(17, "09:30")).every((s) => new Date(s) > new Date(H(17, "09:30"))));
check("rótulo em português", rotulo(H(17, "09:00")) === "ter, 17/11 às 09:00", rotulo(H(17, "09:00")));
check("texto com 4 opções numeradas", textoOpcoes(op, 30).includes("4️⃣ Nenhum desses serve") && textoOpcoes(op, 30).includes("30 min"));

console.log("\nResposta do lead");
const s = op;
check("'2' → segundo horário", interpretarHorario("2", s)?.slot === s[1]);
check("'2️⃣' → segundo horário", interpretarHorario("2️⃣", s)?.slot === s[1]);
check("'a primeira' → primeiro", interpretarHorario("a primeira", s)?.slot === s[0]);
check("'pode ser às 15h' → o das 15:00", interpretarHorario("pode ser às 15h", s)?.slot === s[2]);
check("'4' → nenhum", interpretarHorario("4", s)?.nenhum === true);
check("'nenhum desses' → nenhum", interpretarHorario("nenhum desses", s)?.nenhum === true);
check("'não posso nesses dias' → nenhum", interpretarHorario("não posso nesses dias", s)?.nenhum === true);
check("pergunta → não é escolha (IA responde)", interpretarHorario("quanto custa o sistema?", s) === null);
check("'10 usuários' não vira horário", interpretarHorario("somos 10 usuários", s) === null);
check("recusa '1' → consultor", interpretarRecusa("1") === "consultor");
check("recusa 'quero falar com um consultor' → consultor", interpretarRecusa("quero falar com um consultor") === "consultor");
check("recusa '2' → mais horários", interpretarRecusa("2") === "mais");

console.log("\nFluxo de agendamento");
const marcados = [];
const porta = (opts = {}) => ({
  duracaoMin: 30,
  livres: async () => opts.livres ?? livres,
  marcar: async (inicio) => {
    if (opts.conflito) { opts.conflito = false; return { ok: false, erro: "ocupado", conflito: true }; }
    if (opts.falha) return { ok: false, erro: "Google fora" };
    marcados.push(inicio);
    return { ok: true, inicio, meet_url: "https://meet.google.com/abc-defg-hij", reuniao_id: "r1" };
  },
});
const o1 = await ofertarHorarios(porta());
check("oferece 3 horários e guarda a oferta", o1.oferta?.tipo === "horarios" && o1.oferta.slots.length === 3);
const sem = await ofertarHorarios(porta({ livres: [] }));
check("sem horário livre → passa para consultor", !!sem.passarConsultor && sem.oferta === null);
const m1 = await tratarOferta(porta(), o1.oferta, "2", { nome: "Iris Chacon", email: "iris@x.com" });
check("escolhe '2' → marca o segundo", m1?.agendou?.inicio === o1.oferta.slots[1] && marcados.at(-1) === o1.oferta.slots[1]);
check("confirmação com nome, Meet e convite", /Pronto, Iris!/.test(m1.texto) && m1.texto.includes("meet.google.com") && /e-mail/.test(m1.texto));
check("depois de marcar, sem oferta pendente", m1.oferta === null);
const c1 = await tratarOferta(porta({ conflito: true }), o1.oferta, "1", { nome: "Iris" });
check("horário ocupado na hora → oferece de novo", c1?.oferta?.tipo === "horarios" && /acabou de ser ocupado/.test(c1.texto));
const f1 = await tratarOferta(porta({ falha: true }), o1.oferta, "1", { nome: "Iris" });
check("Google fora → consultor confirma", !!f1?.passarConsultor && f1.oferta === null);
const n1 = await tratarOferta(porta(), o1.oferta, "nenhum serve", { nome: "Iris" });
check("nenhum serve → pergunta consultor ou mais horários", n1?.oferta?.tipo === "recusou" && /consultor/.test(n1.texto));
const k1 = await tratarOferta(porta(), n1.oferta, "1", { nome: "Iris" });
check("depois do nenhum, '1' → consultor", !!k1?.passarConsultor && k1.oferta === null);
const mais = await tratarOferta(porta(), n1.oferta, "2", { nome: "Iris" });
check("depois do nenhum, '2' → mais horários, depois dos já oferecidos", mais?.oferta?.tipo === "horarios"
  && mais.oferta.slots.every((x) => new Date(x) > new Date(o1.oferta.slots[2])) || mais?.passarConsultor);
check("pergunta no meio → segue para a IA", (await tratarOferta(porta(), o1.oferta, "tem integração com o RM?", { nome: "Iris" })) === null);
check("oferta vencida é ignorada", (await tratarOferta(porta(), { ...o1.oferta, expira: "2020-01-01T00:00:00Z" }, "1", { nome: "Iris" })) === null);

console.log("\nResposta cortada da IA");
const cortada = '{\n  "resposta": "Excelente! Você pode escolher o melhor dia e horário de 30 minutos por aqui: https://www.imobsystems';
const j = lerJsonDaIA(cortada);
check("nunca devolve JSON cru", !String(j.resposta ?? "").includes('"resposta"') && !String(j.resposta ?? "").startsWith("{"), j.resposta);
check("aproveita o texto que chegou", String(j.resposta).startsWith("Excelente!"));
const meio = lerJsonDaIA('{"resposta": "Ótimo! Vou te mostrar os horários.", "oferecer_agenda": true, "regra": "Oferecer demo", "temper');
check("JSON cortado com campos inteiros: lê a resposta e o oferecer_agenda", meio.resposta === "Ótimo! Vou te mostrar os horários." && meio.oferecer_agenda === true);
check("JSON inteiro continua igual", lerJsonDaIA('{"resposta":"Oi","temperatura":60}').temperatura === 60);
check("texto sem JSON vira a resposta", lerJsonDaIA("Olá, tudo bem?").resposta === "Olá, tudo bem?");

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
