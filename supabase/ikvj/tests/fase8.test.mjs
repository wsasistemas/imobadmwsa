// Teste da Fase 8 (classificação do lead e RPCs do funil) num Postgres local (PGlite). Não toca no ikvj.
// Rodar (numa pasta com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase8.test.mjs <repo>/supabase/ikvj/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const dir = process.argv[2];
const db = new PGlite();
let ok = 0, falhas = 0;
const check = (nome, cond, extra = "") => {
  if (cond) { ok++; console.log("  ok   ", nome); } else { falhas++; console.log("  FALHA", nome, extra); }
};
const q = async (sql, p) => (await db.query(sql, p)).rows;
const um = async (sql, p) => (await q(sql, p))[0];

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema acessos;
  create table acessos.aplicativos (schema_name text primary key, nome text not null, url text, oculto boolean not null default false,
    controle_ativo boolean not null default false, ultima_verificacao_em timestamptz, schema_dados text);
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces;
  create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select false $$;
  insert into acessos.aplicativos (schema_name, nome) values ('imobdoces', 'ImobDoces'), ('imobsystem', 'ImobSystem');
  -- tabelas do site que já existem no ikvj, com 2 leads antigos
  create table public.leads (id uuid primary key default gen_random_uuid(), nome text not null, email text not null,
    created_at timestamptz not null default now(), telefone text, interesse text, origem text, status text not null default 'novo',
    empresa text, produto text, mensagem text, consentimento_em timestamptz);
  create table public.saas_leads (id uuid primary key default gen_random_uuid(), nome text, email text, telefone text, empresa text,
    origem text, interesse jsonb, status text not null default 'novo', criado_em timestamptz not null default now(), produto_interesse text);
  insert into public.leads (nome, email, telefone, origem) values ('Antigo Um', 'antigo1@x.com', '5521999990001', 'landing-page');
  insert into public.saas_leads (nome, email, telefone, origem) values ('Antigo Dois', 'antigo2@x.com', '21999990002', 'landing-doceria'),
    ('Antigo Um de novo', 'ANTIGO1@x.com', null, 'whatsapp-ia');
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migration aplicada:", f);
}

const lead = async (origem, dados, ext = null) => (await um("select comercial.receber_lead($1, $2::jsonb, null, $3) r", [origem, JSON.stringify(dados), ext])).r;
const neg = async (id) => um("select n.temperatura, n.pontuacao, n.sistemas, n.classificacao, e.chave etapa from comercial.negocios n join comercial.etapas e on e.id = n.etapa_id where n.id = $1", [id]);

console.log("\nCarga: o que já existia foi classificado sem mudar de etapa");
check("todos os negócios têm temperatura", (await um("select count(*)::int c from comercial.negocios where temperatura is null")).c === 0);
check("nenhum importado saiu de Novo lead", (await um("select count(*)::int c from comercial.negocios n join comercial.etapas e on e.id = n.etapa_id where e.chave <> 'novo_lead'")).c === 0);

console.log("\nLead quente do Instagram (Lead Ads)");
const quente = await lead("instagram", {
  nome: "Marina Costa", email: "marina@larfeliz.com.br", telefone: "(21) 99812-3344", empresa: "Imobiliária Lar Feliz", cargo: "Sócia",
  mensagem: "qual_o_seu_prazo?: Imediatamente\nqual_sistema?: CRM para imobiliária",
}, "leadgen:q1");
const nq = await neg(quente.negocio_id);
check("classificado como quente", nq.temperatura === "quente", JSON.stringify(nq));
check("pontuação ≥ 60", nq.pontuacao >= 60, String(nq.pontuacao));
check("foi sozinho para Qualificação", nq.etapa === "qualificacao", nq.etapa);
check("sistema de interesse = imobimoveis (ImobVendas)", nq.sistemas.includes("imobimoveis"), JSON.stringify(nq.sistemas));
check("motivos guardados (cargo, pressa, e-mail da empresa)", ["Quem decide", "Tem pressa", "E-mail da empresa"].every((m) => nq.classificacao.motivos.some((x) => x.motivo.startsWith(m))), JSON.stringify(nq.classificacao.motivos));
check("próxima ação de lead quente", nq.classificacao.proxima_acao.includes("1 hora"));
check("atividade de classificação + mudança de etapa automática",
  (await um("select count(*)::int c from comercial.atividades where negocio_id = $1 and (tipo = 'classificacao' or (tipo = 'etapa' and autor = 'classificação automática'))", [quente.negocio_id])).c === 2);

console.log("\nLead frio (só pesquisando, e-mail pessoal, sem empresa)");
const frio = await lead("facebook", { nome: "Zé", email: "ze@gmail.com", mensagem: "momento: só pesquisando" }, "leadgen:f1");
const nf = await neg(frio.negocio_id);
check("classificado como frio", nf.temperatura === "frio", JSON.stringify(nf));
check("ficou em Novo lead", nf.etapa === "novo_lead");
check("e-mail gmail não conta como da empresa", !nf.classificacao.motivos.some((x) => x.motivo.startsWith("E-mail da empresa")));

console.log("\nLead morno");
const morno = await lead("site", { nome: "Ana", telefone: "11988887777", empresa: "Doceria da Ana", produto: "imobdoceria" }, "s:m1");
const nm = await neg(morno.negocio_id);
check("WhatsApp + empresa + sistema = morno", nm.temperatura === "morno", JSON.stringify(nm));
check("imobdoceria virou o código imobdoces", JSON.stringify(nm.sistemas) === '["imobdoces"]', JSON.stringify(nm.sistemas));
check("morno não muda de etapa", nm.etapa === "novo_lead");

console.log("\nPalavras no meio de outras não contam");
const ab = (await um("select comercial.classificar('{\"mensagem\":\"abandono do projeto\"}'::jsonb) c")).c;
check("\"abandono\" não vira cargo \"dono\"", !ab.motivos.some((x) => x.motivo.startsWith("Quem decide")), JSON.stringify(ab.motivos));

console.log("\nLead repetido não rebaixa");
const rep = await lead("facebook", { nome: "Marina Costa", telefone: "21998123344", mensagem: "momento: só pesquisando" }, "leadgen:q2");
const nr = await neg(rep.negocio_id);
check("mesmo negócio", rep.negocio_id === quente.negocio_id);
check("continua quente com a maior pontuação", nr.temperatura === "quente" && nr.pontuacao === nq.pontuacao, JSON.stringify(nr));

console.log("\nTemperatura definida à mão");
await q("select public.com_negocio_salvar($1, '{\"temperatura\":\"quente\",\"valor\":\"490\"}'::jsonb)", [frio.negocio_id]);
let nf2 = await neg(frio.negocio_id);
check("trocou para quente e travou (manual)", nf2.temperatura === "quente" && nf2.classificacao.manual === true);
await lead("facebook", { nome: "Zé", email: "ze@gmail.com", mensagem: "só pesquisando" }, "leadgen:f2");
nf2 = await neg(frio.negocio_id);
check("lead novo não sobrescreve a escolha manual", nf2.temperatura === "quente");
await q("select public.com_negocio_salvar($1, '{\"temperatura\":null}'::jsonb)", [frio.negocio_id]);
nf2 = await neg(frio.negocio_id);
check("destravar volta para a classificação automática (frio)", nf2.temperatura === "frio" && !nf2.classificacao.manual, JSON.stringify(nf2));

console.log("\nRPCs das telas");
const lista = (await um("select public.com_leads(null, null, null, 300) r")).r;
check("com_leads devolve os negócios", lista.length >= 4 && !!lista[0].nome);
check("filtro por temperatura", (await um("select jsonb_array_length(public.com_leads(null, 'quente', null, 300)) c")).c >= 1);
check("busca sem acento acha \"Imobiliária\"", (await um("select jsonb_array_length(public.com_leads(null, null, 'imobiliaria lar', 300)) c")).c === 1);
const res = (await um("select public.com_leads_resumo() r")).r;
check("resumo conta quentes abertos e Instagram", res.quentes_abertos >= 1 && res.instagram_30d === 1, JSON.stringify(res));
const funil = (await um("select public.com_funil(null) r")).r;
check("funil tem as 8 etapas", funil.length === 8);
check("Qualificação mostra o lead quente", funil.find((e) => e.chave === "qualificacao").negocios.some((n) => n.negocio_id === quente.negocio_id));
check("filtro por sistema", (await um("select public.com_funil('imobdoces') r")).r.flatMap((e) => e.negocios).every((n) => n.sistemas.includes("imobdoces")));
const ficha = (await um("select public.com_negocio($1) r", [quente.negocio_id])).r;
check("ficha traz respostas recebidas e atividades", ficha.recebidos.length === 2 && ficha.atividades.length >= 3 && !!ficha.recebidos[0].respostas.nome, JSON.stringify(ficha).slice(0, 300));

console.log("\nMover etapa e perder");
let erro = null;
try { await q("select public.com_mover_etapa($1, 'perdido', '  ')", [morno.negocio_id]); } catch (e) { erro = e.message; }
check("Perdido sem motivo → erro", /motivo/i.test(erro ?? ""), erro);
await q("select public.com_mover_etapa($1, 'perdido', 'preço')", [morno.negocio_id]);
check("Perdido com motivo", (await neg(morno.negocio_id)).etapa === "perdido");
await q("select public.com_anotar($1, 'Liguei, retorna amanhã')", [quente.negocio_id]);
check("anotação gravada", (await um("select count(*)::int c from comercial.atividades where negocio_id = $1 and tipo = 'nota'", [quente.negocio_id])).c === 1);
const nc = (await um("select public.com_novo_contato('{\"nome\":\"Cadastro Manual\",\"telefone\":\"31977776666\",\"empresa\":\"X Imóveis\"}'::jsonb) r")).r;
check("novo contato manual entra e é classificado", nc.ok && (await neg(nc.negocio_id)).temperatura !== null, JSON.stringify(nc));

console.log("\nRegras editáveis");
const regras = (await um("select public.com_config_qualificacao() r")).r;
erro = null;
try { await q("select public.com_config_qualificacao_salvar($1::jsonb)", [JSON.stringify({ ...regras, limites: { quente: 30, morno: 40 } })]); } catch (e) { erro = e.message; }
check("limite morno ≥ quente → erro", /Limites/.test(erro ?? ""), erro);
const reclass = (await um("select public.com_config_qualificacao_salvar($1::jsonb) n", [JSON.stringify({ ...regras, limites: { quente: 20, morno: 10 } })])).n;
check("salvar reclassifica os abertos", reclass >= 1);
check("com limite 20 há mais quentes", (await um("select count(*)::int c from comercial.negocios where temperatura = 'quente'")).c >= 2);
const previa = (await um("select public.com_classificar_previa('{\"cargo\":\"Diretor\",\"telefone\":\"11999998888\"}'::jsonb) r")).r;
check("prévia classifica sem gravar", previa.pontos === 40 && previa.temperatura === "quente", JSON.stringify(previa));

console.log("\nSegurança");
await q("select set_config('test.super', '0', false)");
erro = null;
try { await q("select public.com_leads(null, null, null, 10)"); } catch (e) { erro = e.message; }
check("quem não é super admin não lista leads", erro !== null);
check("anon não executa com_funil", (await um("select has_function_privilege('anon', 'public.com_funil(text)', 'execute') p")).p === false);
check("authenticated não executa comercial.classificar direto", (await um("select has_function_privilege('authenticated', 'comercial.classificar(jsonb, text)', 'execute') p")).p === false);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
