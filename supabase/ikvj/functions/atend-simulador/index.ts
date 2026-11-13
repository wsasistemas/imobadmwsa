// atend-simulador — testa a Sophia (Atendimento ONLINE) sem enviar nada a ninguém e sem gravar no Funil de Vendas.
// Usa os horários livres de verdade do Google Agenda, mas não marca: a escolha só mostra o que aconteceria.
// A oferta de horários vai e volta com a tela (o simulador não guarda estado). Depois de uma conversa com pelo menos
// 2 mensagens do lead, marca o robô como testado. Só o super admin. Secrets: LOVABLE_API_KEY; opcional ADM_IA_MODELO.
import { type Oferta, ofertaValida } from "../_shared/agendar.ts";
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";
import { ofertarHorarios, type PortaAgenda, tratarOferta } from "../_shared/atend-fluxo.ts";
import { aplicarRegras, chamarIA, type Contexto, type Lead, montarPrompt } from "../_shared/atendimento.ts";
import { appGoogle, type Contexto as ContextoAgenda, horariosLivres } from "../_shared/google.ts";
import { comOpcoes } from "../_shared/opewa.ts";

const TEMPERATURAS = new Set(["quente", "morno", "frio"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;

  const corpo = await req.json().catch(() => ({}));
  const mensagens = (Array.isArray(corpo.mensagens) ? corpo.mensagens : [])
    .slice(-40)
    .map((m: { autor?: string; texto?: unknown }) => ({ autor: m.autor === "robo" ? "robo" as const : "lead" as const, texto: String(m.texto ?? "").slice(0, 1500) }))
    .filter((m: { texto: string }) => m.texto.trim());
  if (mensagens.length === 0 || mensagens[mensagens.length - 1].autor !== "lead") return json({ ok: false, erro: "Escreva a mensagem do lead." }, 400);

  const l = corpo.lead ?? {};
  const lead: Lead = {
    nome: String(l.nome ?? "Lead de teste").slice(0, 80),
    empresa: l.empresa ? String(l.empresa).slice(0, 80) : undefined,
    temperatura: TEMPERATURAS.has(l.temperatura) ? l.temperatura : "morno",
    pontuacao: Math.max(0, Math.min(100, Number(l.pontuacao) || 50)),
    sistemas: (Array.isArray(l.sistemas) ? l.sistemas : []).map(String).slice(0, 10),
  };
  const oferta: Oferta | null = corpo.oferta && typeof corpo.oferta === "object" ? corpo.oferta as Oferta : null;

  const db = admin();
  const { data, error } = await db.rpc("com_srv_atend_contexto");
  if (error) return json({ ok: false, erro: "Não foi possível ler a configuração do robô." }, 500);
  const ctx = data as Contexto;

  // Agenda de verdade só para ler os horários livres; "marcar" é simulado.
  const app = appGoogle();
  const { data: ag } = await db.rpc("com_srv_atend_agenda_geral");
  const agenda = ag as ContextoAgenda | null;
  const porta: PortaAgenda = {
    duracaoMin: agenda?.config?.duracao_min ?? 30,
    livres: async () => (app && agenda ? await horariosLivres(db, app, agenda) : []),
    marcar: async (inicio) => ({ ok: true, inicio, meet_url: null, reuniao_id: null, simulado: true }),
  };
  const ultimo = mensagens[mensagens.length - 1].texto;

  try {
    const passo = await tratarOferta(porta, oferta, ultimo, { nome: lead.nome, email: null });
    let resposta: string, botoes: string[] = [], novaOferta: Oferta | null = oferta, acoes;
    if (passo) {
      resposta = passo.agendou ? `${passo.texto}\n\n(Simulação: nada foi marcado na agenda.)` : passo.texto;
      novaOferta = passo.oferta;
      acoes = {
        regra: passo.agendou ? "Demonstração marcada na agenda" : "Agendamento", resposta_pronta: null, sistema_indicado: null, enviar_pagina: false,
        oferecer_agenda: false, passar_consultor: !!passo.passarConsultor, motivo_consultor: passo.passarConsultor ?? null,
        temperatura: passo.agendou ? Math.max(lead.pontuacao, 75) : lead.pontuacao, etapa: passo.agendou ? "reuniao_agendada" : null, passo_roteiro: null,
      };
    } else {
      const situacao = ofertaValida(oferta) && oferta.tipo === "horarios"
        ? "há horários oferecidos esperando a escolha do lead; responda a dúvida dele e lembre que é só responder com o número." : "";
      const bruto = await chamarIA(montarPrompt(ctx, lead, corpo.fora_do_horario === true, situacao), mensagens);
      const d = aplicarRegras(ctx, lead, bruto, "");
      acoes = d.acoes;
      if (d.acoes.oferecer_agenda) {
        const p = await ofertarHorarios(porta);
        resposta = `${d.resposta}\n\n${p.texto}`;
        novaOferta = p.oferta;
        if (p.passarConsultor) acoes = { ...acoes, passar_consultor: true, motivo_consultor: p.passarConsultor };
      } else {
        resposta = d.resposta;
        botoes = d.botoes;
      }
    }

    let simulado = false;
    if (mensagens.filter((m: { autor: string }) => m.autor === "lead").length >= 2) {
      await db.rpc("com_srv_atend_simulado");
      simulado = true;
    }
    return json({ ok: true, resposta, botoes, acoes, simulado, oferta: novaOferta, agendamento: passo?.agendou ? { inicio: passo.agendou.inicio } : null, texto_whatsapp: comOpcoes(resposta, botoes) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[atend-simulador]", msg.slice(0, 300));
    return json({ ok: false, erro: msg.slice(0, 300) }, 502);
  }
});
