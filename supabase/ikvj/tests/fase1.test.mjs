// Teste da Fase 1 (schema adm) num Postgres local descartável (PGlite). Não toca no ikvj.
// Stubs mínimos do que existe no ikvj: roles, auth.uid(), acessos.* e imobdoces.membro_da_loja.
// Rodar (numa pasta temporária com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase1.test.mjs <repo>/supabase/ikvj/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const dir = process.argv[2];
const db = new PGlite();
let ok = 0, falhas = 0;
const check = (nome, cond, extra = "") => {
  if (cond) { ok++; console.log("  ok   ", nome); } else { falhas++; console.log("  FALHA", nome, extra); }
};
const q = async (sql, p) => (await db.query(sql, p)).rows;
const um = async (sql, p) => (await q(sql, p))[0];
const como = async (uid, super_) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ""}', false), set_config('test.super', '${super_ ? 1 : 0}', false)`);
};

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema acessos;
  create table acessos.aplicativos (schema_name text primary key, nome text not null, url text, oculto boolean not null default false,
    controle_ativo boolean not null default false, ultima_verificacao_em timestamptz);
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces;
  create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select current_setting('test.loja', true) = p $$;
  insert into acessos.aplicativos (schema_name, nome) values ('imobdoces', 'ImobDoces'), ('imobsystem', 'ImobSystem');
`);

for (const f of ["20261106120000_adm_01_schema_tabelas.sql", "20261106120100_adm_02_funcoes.sql"]) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migration aplicada:", f);
}

const ADMIN = "11111111-1111-1111-1111-111111111111";
const LOJISTA = "22222222-2222-2222-2222-222222222222";

console.log("\nSistemas semeados");
check("imobdoces e imobsystem em adm.sistemas", (await q("select app from adm.sistemas order by app")).map((r) => r.app).join() === "imobdoces,imobsystem");

console.log("\nSegurança");
await como(LOJISTA, false);
let erro = null;
try { await q("select public.adm_painel()"); } catch (e) { erro = e.message; }
check("adm_painel nega quem não é super admin", erro?.includes("super admin"), erro);
await como(null, false);
erro = null;
try { await q("select public.empresa_liberada('imobdoces','loja_x')"); } catch (e) { erro = e.message; }
check("empresa_liberada exige login", erro?.includes("logado"), erro);
const privs = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
  has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'public' and (p.proname like 'adm\\_%' or p.proname = 'empresa_liberada')) or n.nspname = 'adm'`);
check("anon não executa nenhuma função nova", privs.every((r) => !r.anon), JSON.stringify(privs.filter((r) => r.anon)));
check("authenticated não executa funções do schema adm direto",
  (await q(`select count(*)::int c from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'adm' and has_function_privilege('authenticated', p.oid, 'execute')`))[0].c === 0);
check("authenticated sem acesso às tabelas adm",
  (await q(`select count(*)::int c from pg_tables where schemaname = 'adm' and has_table_privilege('authenticated', schemaname||'.'||tablename, 'select')`))[0].c === 0);

console.log("\nCenários de cobrança");
await como(ADMIN, true);
let seq = 10;
const nova = async (nome, extra = {}) =>
  (await um("select public.adm_salvar_empresa($1::jsonb) id", [JSON.stringify({ razao_social: nome, cnpj: "12.345.678/0001-" + String(seq++), ...extra })])).id;
const vincula = async (empresa, schema_ref) =>
  (await um("select public.adm_salvar_vinculo($1::jsonb) id", [JSON.stringify({ empresa_id: empresa, app: "imobdoces", schema_ref, valor_mensal: 280 })])).id;
const fatura = async (empresa, diasAtras) =>
  (await um(`select public.adm_criar_fatura($1, date_trunc('month', current_date)::date, (current_date - $2::int), 280) id`, [empresa, diasAtras])).id;
const sit = async (empresa) => (await um("select * from adm.situacao_calculada($1)", [empresa]));
const lib = async (ref) => (await um("select adm.empresa_liberada_ref('imobdoces', $1) l", [ref])).l;

const e10 = await nova("Atraso 10 dias"); await vincula(e10, "loja_dez"); const f10 = await fatura(e10, 10);
const s10 = await sit(e10);
check("10 dias de atraso → atraso (ainda liberada)", s10.situacao === "atraso" && (await lib("loja_dez")) === true, JSON.stringify(s10));
check("suspende_em = vencimento + 11", s10.suspende_em && s10.dias_atraso === 10);

const e11 = await nova("Atraso 11 dias"); await vincula(e11, "loja_onze"); const f11 = await fatura(e11, 11);
check("11 dias de atraso → suspensa (bloqueada)", (await sit(e11)).situacao === "suspensa" && (await lib("loja_onze")) === false);
check("situação gravada na tabela pelo gatilho", (await um("select situacao from adm.empresas where id=$1", [e11])).situacao === "suspensa");
check("evento de mudança de situação gravado",
  (await um("select count(*)::int c from adm.eventos where empresa_id=$1 and tipo='situacao' and detalhe->>'para'='suspensa'", [e11])).c === 1);

await q("select public.adm_registrar_pagamento($1, 'pix')", [f11]);
check("pagou → liberada na hora", (await sit(e11)).situacao === "em_dia" && (await lib("loja_onze")) === true);
check("evento de reativação gravado",
  (await um("select count(*)::int c from adm.eventos where empresa_id=$1 and tipo='situacao' and detalhe->>'para'='em_dia'", [e11])).c >= 1);

const ep = await nova("Prazo extra"); await vincula(ep, "loja_prazo"); await fatura(ep, 20);
check("20 dias sem prazo → suspensa", (await sit(ep)).situacao === "suspensa");
await q("select public.adm_conceder_prazo($1, current_date + 3, 'combinado por telefone')", [ep]);
const sp = await sit(ep);
check("prazo extra vigente → atraso e liberada", sp.situacao === "atraso" && (await lib("loja_prazo")) === true, JSON.stringify(sp));

check("sem vínculo cadastrado → liberada", (await lib("loja_que_nao_existe")) === true);

const ec = await nova("Cortesia", { modalidade: "cortesia" }); await vincula(ec, "loja_cortesia"); await fatura(ec, 40);
check("cortesia → liberada mesmo com fatura vencida", (await sit(ec)).situacao === "cortesia" && (await lib("loja_cortesia")) === true);

const ecan = await nova("Cancelada", { modalidade: "cancelada" }); await vincula(ecan, "loja_cancelada");
check("cancelada → bloqueada", (await lib("loja_cancelada")) === false);

const em = await nova("Suspensa manual"); const vm = await vincula(em, "loja_manual");
await q("select public.adm_suspender($1, true, 'teste')", [em]);
check("suspensão manual → bloqueada", (await lib("loja_manual")) === false);
await q("select public.adm_salvar_vinculo($1::jsonb)", [JSON.stringify({ id: vm, acesso_manual: "liberado" })]);
check("acesso_manual liberado vence a suspensão", (await lib("loja_manual")) === true);
await q("select public.adm_salvar_vinculo($1::jsonb)", [JSON.stringify({ id: vm, acesso_manual: "" })]);
await q("select public.adm_suspender($1, false)", [em]);
check("tirar suspensão manual → liberada", (await lib("loja_manual")) === true);

const t = await nova("Tolerância"); await vincula(t, "loja_tol"); await fatura(t, 5);
await q("select public.adm_salvar_regua(3, null, null)");
check("tolerância configurável (3 dias) → 5 dias suspende", (await sit(t)).situacao === "suspensa");
await q("select public.adm_salvar_regua(10, null, null)");

console.log("\nempresa_liberada (o que o site recebe)");
await como(LOJISTA, false);
await db.exec(`select set_config('test.loja', 'loja_dez', false)`);
const r1 = (await um("select public.empresa_liberada('imobdoces','loja_dez') r")).r;
check("membro da empresa vê detalhes (dias, suspende_em)", r1.liberada === true && r1.dias_atraso === 10 && r1.situacao === "atraso", JSON.stringify(r1));
const r2 = (await um("select public.empresa_liberada('imobdoces','loja_onze') r")).r;
check("quem não é da empresa só recebe liberada", JSON.stringify(Object.keys(r2)) === '["liberada"]', JSON.stringify(r2));

console.log("\nRotina e painel");
await como(ADMIN, true);
const pr = (await um("select adm.processar_regua() r")).r;
check("processar_regua percorre as empresas", pr.empresas === 7, JSON.stringify(pr));
const pr2 = (await um("select adm.processar_regua() r")).r;
check("2ª execução no mesmo dia não muda nada", pr2.mudaram === 0, JSON.stringify(pr2));
const painel = (await um("select public.adm_painel() p")).p;
check("adm_painel devolve KPIs e a lista de quem vai suspender", painel.mrr > 0 && Array.isArray(painel.vao_suspender) && painel.vao_suspender.length >= 1, JSON.stringify(painel).slice(0, 300));
await q("select public.adm_suspender($1, true, 'ordem')", [em]);
const lista = await q("select * from public.adm_listar_empresas(null, null)");
const ordem = lista.map((l) => l.situacao);
check("adm_listar_empresas: suspensas, depois em atraso, depois o resto",
  ordem[0] === "suspensa" && ordem.lastIndexOf("atraso") < ordem.findIndex((s) => !["suspensa", "atraso"].includes(s)), ordem.join());
check("busca por CNPJ com máscara", (await q("select * from public.adm_listar_empresas(null, '12.345.678')")).length === 7);
check("filtro por situação", (await q("select * from public.adm_listar_empresas('suspensa', null)")).length === 1);
const ficha = (await um("select public.adm_empresa($1) f", [e11])).f;
check("adm_empresa traz vínculos, faturas e eventos", ficha.vinculos.length === 1 && ficha.faturas.length === 1 && ficha.eventos.length >= 3);
check("adm_listar_faturas em_atraso", (await q("select * from public.adm_listar_faturas('em_atraso')")).length >= 4);
check("adm_listar_sistemas", (await q("select * from public.adm_listar_sistemas()")).length === 2);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
