// Teste da Fase 8 parte 2 (Ganho → cliente, relatório, CSV e follow-up) num Postgres local (PGlite). Não toca no ikvj.
// Rodar (numa pasta com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase8b.test.mjs <repo>/supabase/ikvj/migrations
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
const etapa = async (id) => (await um("select e.chave from comercial.negocios n join comercial.etapas e on e.id = n.etapa_id where n.id = $1", [id])).chave;
console.log("sistemas:", JSON.stringify(await q("select app, tipo_ref from adm.sistemas order by app")));

console.log("\nGanho → cliente");
const l1 = await lead("instagram", { nome: "Carla", telefone: "11988887777", email: "carla@horizonte.com.br", empresa: "Imobiliária Horizonte" }, "lg:1");
let erro = null;
try { await q("select public.com_ganhar($1, '{\"cnpj\":\"123\"}'::jsonb)", [l1.negocio_id]); } catch (e) { erro = e.message; }
check("CNPJ inválido → erro e nada muda", /CNPJ/.test(erro ?? "") && (await etapa(l1.negocio_id)) !== "ganho", erro);
const g = (await um("select public.com_ganhar($1, $2::jsonb) r", [l1.negocio_id, JSON.stringify({
  razao_social: "Horizonte Imóveis Ltda", cnpj: "23.456.789/0001-01", dia_vencimento: "10",
  sistemas: [{ app: "imobsystem", ref: "8f2c1a91", plano: "Profissional", valor_mensal: "490" }, { app: "imobdoces", ref: "", valor_mensal: "200" }],
})])).r;
check("negócio em Ganho", (await etapa(l1.negocio_id)) === "ganho");
check("empresa criada com CNPJ e vencimento", (await um("select cnpj, dia_vencimento, razao_social from adm.empresas where id = $1", [g.empresa_id])).cnpj === "23456789000101", JSON.stringify(g));
check("1 vínculo criado (o sem referência fica pendente)", g.vinculos === 1 && JSON.stringify(g.pendentes) === '["imobdoces"]', JSON.stringify(g));
check("mensalidade = soma dos vínculos", Number(g.mensalidade) === 490);
check("valor previsto do negócio = 690", Number((await um("select valor_mensal_previsto v from comercial.negocios where id = $1", [l1.negocio_id])).v) === 690);
const g2 = (await um("select public.com_ganhar($1, '{\"sistemas\":[{\"app\":\"imobsystem\",\"ref\":\"8f2c1a91\",\"valor_mensal\":\"490\"}]}'::jsonb) r", [l1.negocio_id])).r;
check("repetir o Ganho não duplica empresa nem vínculo", g2.empresa_id === g.empresa_id && g2.vinculos === 0 && (await um("select count(*)::int c from adm.vinculos where empresa_id = $1", [g.empresa_id])).c === 1);
erro = null;
try { await q("select public.com_ganhar($1, '{\"sistemas\":[{\"app\":\"naoexiste\",\"ref\":\"x\"}]}'::jsonb)", [l1.negocio_id]); } catch (e) { erro = e.message; }
check("sistema desconhecido → erro", /não cadastrado/.test(erro ?? ""), erro);

console.log("\nImportação de CSV");
const imp = (await um("select public.com_importar($1::jsonb) r", [JSON.stringify([
  { nome: "Ana CSV", telefone: "21977776666", empresa: "Doceria Ana", mensagem: "doceria" },
  { nome: "Carla de novo", email: "carla@horizonte.com.br" },
  { nome: "Sem contato" },
])])).r;
check("2 novos (cliente que já fechou abre negócio novo) e 1 erro", imp.novos === 2 && imp.repetidos === 0, JSON.stringify(imp));
check("erro aponta a linha 3", imp.erros.length === 1 && imp.erros[0].linha === 3, JSON.stringify(imp));
check("importado não manda boas-vindas", (await um("select n.boas_vindas from comercial.negocios n join comercial.contatos c on c.id = n.contato_id where c.nome = 'Ana CSV'")).boas_vindas === "nao_enviar");
check("importado é classificado e fica em Novo lead", (await um("select n.temperatura, e.chave from comercial.negocios n join comercial.contatos c on c.id = n.contato_id join comercial.etapas e on e.id = n.etapa_id where c.nome = 'Ana CSV'")).chave === "novo_lead");

console.log("\nFollow-up de 24 h");
const l2 = await lead("facebook", { nome: "Atrasado", telefone: "31966665555" }, "lg:2");
await q("update comercial.negocios set criado_em = now() - interval '30 hours' where id = $1", [l2.negocio_id]);
const f1 = (await um("select comercial.gerar_follow_ups() n")).n;
const f2 = (await um("select comercial.gerar_follow_ups() n")).n;
check("gera 1 follow-up para quem está há 24 h sem reunião", f1 >= 1 && (await um("select count(*)::int c from comercial.atividades where negocio_id = $1 and detalhe->>'follow_up' = 'true'", [l2.negocio_id])).c === 1);
check("não repete o follow-up", f2 === 0);
check("negócio novo (menos de 24 h) não recebe", (await um("select count(*)::int c from comercial.atividades a join comercial.negocios n on n.id = a.negocio_id where a.detalhe->>'follow_up' = 'true' and n.criado_em > now() - interval '1 hour'")).c === 0);

console.log("\nRelatório");
await q("select public.com_mover_etapa($1, 'perdido', 'Preço')", [l2.negocio_id]);
await q("update comercial.negocios set criado_em = now() where id = $1", [l2.negocio_id]);
const rel = (await um("select public.com_relatorio(null, null) r")).r;
check("totais contam ganhos, perdidos e receita (valor do último Ganho)", rel.totais.ganhos === 1 && rel.totais.perdidos === 1 && Number(rel.totais.receita) === 490, JSON.stringify(rel.totais));
const ig = rel.por_fonte.find((x) => x.origem === "instagram");
check("Instagram: 1 lead, qualificado e ganho", ig && ig.leads === 1 && ig.ganhos === 1 && ig.qualificados === 1, JSON.stringify(rel.por_fonte));
check("motivo de perda Preço", rel.motivos_perda.some((m) => m.motivo === "Preço" && m.total === 1));
check("funil por etapa tem as 8 etapas", rel.por_etapa.length === 8);
check("linhas para exportar", rel.linhas.length === rel.totais.leads && rel.linhas[0].nome !== undefined);

console.log("\nSegurança");
await q("select set_config('test.super', '0', false)");
erro = null;
try { await q("select public.com_relatorio(null, null)"); } catch (e) { erro = e.message; }
check("não super admin não vê relatório", erro !== null);
check("anon não executa com_ganhar", (await um("select has_function_privilege('anon', 'public.com_ganhar(uuid, jsonb)', 'execute') p")).p === false);
check("authenticated não chama gerar_follow_ups", (await um("select has_function_privilege('authenticated', 'comercial.gerar_follow_ups()', 'execute') p")).p === false);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
