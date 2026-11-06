// Teste da Fase 6 (Meta Lead Ads: tokens no Vault, conexões, formulários) num Postgres local (PGlite).
// Rodar (numa pasta com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase6.test.mjs <repo>/supabase/ikvj/migrations
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
  create schema extensions;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
  create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text not null, description text);
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets (name, secret, description) values (n, s, d) returning id $$;
  create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migration aplicada:", f);
}
const U = "11111111-1111-1111-1111-111111111111";

console.log("\nSessão do login");
const s = (await um("select public.com_srv_meta_sessao_criar($1, 'TOKEN_USUARIO') id", [U])).id;
check("token do usuário vai para o Vault (não para a tabela)", (await um("select count(*)::int c from vault.secrets where secret = 'TOKEN_USUARIO'")).c === 1);
check("a própria pessoa lê o token da sessão", (await um("select public.com_srv_meta_sessao_token($1, $2) t", [s, U])).t === "TOKEN_USUARIO");
check("outra pessoa não lê", (await um("select public.com_srv_meta_sessao_token($1, gen_random_uuid()) t", [s])).t === null);
await q("update comercial.meta_sessoes set expira_em = now() - interval '1 minute' where id = $1", [s]);
check("sessão vencida não devolve token", (await um("select public.com_srv_meta_sessao_token($1, $2) t", [s, U])).t === null);
const s2 = (await um("select public.com_srv_meta_sessao_criar($1, 'TOKEN_2') id", [U])).id;
check("criar outra sessão limpa a vencida e o token dela", (await um("select count(*)::int c from vault.secrets where secret = 'TOKEN_USUARIO'")).c === 0);
await q("select public.com_srv_meta_sessao_apagar($1)", [s2]);
check("apagar a sessão apaga o token", (await um("select count(*)::int c from vault.secrets where secret = 'TOKEN_2'")).c === 0);

console.log("\nConexão da página");
const c1 = (await um(`select public.com_srv_meta_conexao_gravar('{"page_id":"P1","page_nome":"WSA Sistemas","ig_usuario":"@wsa","assinada":true}'::jsonb, 'TOKEN_PAGINA', $1) id`, [U])).id;
check("token da página no Vault", (await um("select count(*)::int c from vault.secrets where secret = 'TOKEN_PAGINA'")).c === 1);
check("nenhuma coluna guarda o token", (await um("select count(*)::int c from comercial.meta_conexoes where row_to_json(meta_conexoes)::text like '%TOKEN_PAGINA%'")).c === 0);
const c1b = (await um(`select public.com_srv_meta_conexao_gravar('{"page_id":"P1","page_nome":"WSA Sistemas","ig_usuario":"@wsa","assinada":true}'::jsonb, 'TOKEN_NOVO', $1) id`, [U])).id;
check("conectar de novo a mesma página atualiza (sem duplicar)", c1b === c1 && (await um("select count(*)::int c from comercial.meta_conexoes")).c === 1);
check("o token antigo foi trocado, não acumulado", (await um("select count(*)::int c from vault.secrets where secret like 'TOKEN_%'")).c === 1);
check("token pela conexão", (await um("select public.com_srv_meta_conexao_token($1) t", [c1])).t.token === "TOKEN_NOVO");

console.log("\nFormulários");
const n = (await um(`select public.com_srv_meta_formularios_sincronizar($1, '[{"id":"F1","nome":"Demonstração ImobSystem","situacao":"ACTIVE"},{"id":"F2","nome":"Doces","situacao":"ACTIVE"}]'::jsonb) n`, [c1])).n;
check("sincroniza 2 formulários", n === 2);
await q("select public.com_meta_formulario_salvar('F2', 'imobdoces', false)");
const p1 = (await um("select public.com_srv_meta_por_pagina('P1', 'F1') p")).p;
check("webhook acha o token e a fonte meta pela página", p1.token === "TOKEN_NOVO" && p1.form_ativo === true && !!p1.fonte_id, JSON.stringify(p1));
const p2 = (await um("select public.com_srv_meta_por_pagina('P1', 'F2') p")).p;
check("formulário desligado e com sistema", p2.form_ativo === false && p2.sistema === "imobdoces");
check("página desconhecida → nada", (await um("select public.com_srv_meta_por_pagina('PX', 'F1') p")).p === null);

console.log("\nLead do Instagram");
const lead = (await um(`select comercial.receber_lead('instagram', '{"full_name":"Bia Santos","phone_number":"+55 21 98888-7777","email":"bia@flor.com","sistema":"imobdoces"}'::jsonb, $1, 'leadgen_9') r`, [p1.fonte_id])).r;
check("lead entra no funil com origem instagram", lead.ok && lead.novo_negocio && (await um("select origem from comercial.contatos where id = $1", [lead.contato_id])).origem === "instagram");
const rep = (await um(`select comercial.receber_lead('instagram', '{"full_name":"Bia Santos"}'::jsonb, $1, 'leadgen_9') r`, [p1.fonte_id])).r;
check("Meta reenviou o mesmo leadgen → ignorado", rep.evento_repetido === true);
await q("select public.com_srv_meta_lead_recebido($1, 'F1')", [c1]);
check("conta o lead na página e no formulário", (await um("select total_leads t from comercial.meta_conexoes where id = $1", [c1])).t === 1
  && (await um("select total_leads t from comercial.meta_formularios where form_id = 'F1'")).t === 1);

console.log("\nPainel");
const lista = (await um("select public.com_meta_conexoes() l")).l;
check("lista a página com os formulários", lista.length === 1 && lista[0].formularios.length === 2 && lista[0].ig_usuario === "@wsa", JSON.stringify(lista[0]));
check("a lista do painel não traz token", !JSON.stringify(lista).includes("TOKEN"));
await q("select public.com_srv_meta_conexao_situacao($1, false, 'token vencido')", [c1]);
check("situação do token gravada", (await um("select token_valido v from comercial.meta_conexoes where id = $1", [c1])).v === false);
await q("select public.com_srv_meta_conexao_desligar($1)", [c1]);
check("desconectar apaga conexão, formulários e o token do Vault",
  (await um("select count(*)::int c from comercial.meta_conexoes")).c === 0 &&
  (await um("select count(*)::int c from comercial.meta_formularios")).c === 0 &&
  (await um("select count(*)::int c from vault.secrets where secret like 'TOKEN_%'")).c === 0);
await q("select set_config('test.super', '0', false)");
let negou = false;
try { await q("select public.com_meta_conexoes()"); } catch { negou = true; }
check("painel só para o super admin", negou);

console.log("\nSegurança");
const priv = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where (s.nspname = 'public' and p.proname like 'com\\_srv\\_meta%') or (s.nspname = 'comercial' and p.proname like 'vault%')`);
check("funções do Vault e com_srv_meta_* fechadas", priv.length === 13 && priv.every((x) => !x.a && !x.n), JSON.stringify(priv));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
