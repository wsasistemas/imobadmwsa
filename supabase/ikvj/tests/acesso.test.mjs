// Teste do acesso do comprador num Postgres local (PGlite). Não toca no ikvj.
// Rodar numa pasta com `npm i @electric-sql/pglite@0.3.14`, copiando este arquivo para lá:
//   node acesso.test.mjs <repo>/supabase/ikvj/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const dir = process.argv[2];
const db = new PGlite();
let ok = 0, falhas = 0;
const check = (n, c, x = "") => { if (c) { ok++; console.log("  ok   ", n); } else { falhas++; console.log("  FALHA", n, x); } };
const q = async (s, p) => (await db.query(s, p)).rows;
const um = async (s, p) => (await q(s, p))[0];
const falha = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema extensions; create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat('ab', n), 'hex') $$;
  create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, segredo text);
  create view vault.decrypted_secrets as select id, name, segredo as decrypted_secret from vault.secrets;
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets (name, segredo) values (n, s) returning id $$;
  create schema acessos;
  create table acessos.aplicativos (schema_name text primary key, nome text not null, url text, oculto boolean not null default false,
    controle_ativo boolean not null default false, ultima_verificacao_em timestamptz, schema_dados text);
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces; create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select false $$;
  create schema suprimentos;
  create table suprimentos.usuarios (id uuid primary key, imobiliaria_id uuid not null, email text not null, nome text, perfil text not null default 'operador', ativo boolean not null default true);
  create table suprimentos.imobiliarias (id uuid primary key default gen_random_uuid(), nome text not null);
  create schema imobimoveis;
  create table imobimoveis.tenants (id uuid primary key default gen_random_uuid(), nome text not null, slug text not null unique, status text);
  create table imobimoveis.tenant_users (tenant_id uuid not null references imobimoveis.tenants(id), user_id uuid not null, role text, perfil text, ativo boolean default true, primary key (tenant_id, user_id));
  create table imobimoveis.user_roles (user_id uuid not null, role text not null, unique (user_id, role));
  create table imobimoveis.profiles (user_id uuid primary key, full_name text);
  insert into imobimoveis.tenants (nome, slug, status) values ('Tenant Padrão', 'default', 'ativo');
  insert into acessos.aplicativos (schema_name, nome, url) values ('imobdoces', 'ImobDoces', 'https://d.x'), ('imobsystem', 'ImobSystem', null), ('suprimentos', 'Suprimentos', 'https://s.x'), ('imobimoveis', 'Imobimoveis', 'https://i.x');
  create table public.leads (id uuid primary key default gen_random_uuid(), nome text not null, email text not null, created_at timestamptz not null default now(), telefone text, interesse text, origem text, status text not null default 'novo', empresa text, produto text, mensagem text, consentimento_em timestamptz);
  create table public.saas_leads (id uuid primary key default gen_random_uuid(), nome text, email text, telefone text, empresa text, origem text, interesse jsonb, status text not null default 'novo', criado_em timestamptz not null default now(), produto_interesse text);
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(`${dir}/${f}`, "utf8"));

if (!(await um("select 1 x from adm.sistemas where app = 'imobimoveis'"))) {
  await db.exec("insert into adm.sistemas (app, tipo_ref) values ('imobimoveis', 'tenant')");
  await db.exec(readFileSync(`${dir}/20261110140000_adm_09_empresas_na_plataforma.sql`, "utf8").split("-- Painel ---")[0].split("UPDATE adm.sistemas SET funcao_provisionar")[1] ? "UPDATE adm.sistemas SET funcao_provisionar" + readFileSync(`${dir}/20261110140000_adm_09_empresas_na_plataforma.sql`, "utf8").split("UPDATE adm.sistemas SET funcao_provisionar")[1].split("-- Painel ---")[0] : "");
}
const tem = await um("select funcao_provisionar f from adm.sistemas where app = 'suprimentos'");
if (!tem) await db.exec("insert into adm.sistemas (app, tipo_ref, funcao_provisionar) values ('suprimentos', 'tenant', 'adm.provisionar_suprimentos')");
const t1 = "aaaaaaaa-0000-4000-8000-000000000001", t2 = "aaaaaaaa-0000-4000-8000-000000000002";
const emp = (await um("select public.adm_salvar_empresa('{\"razao_social\":\"Horizonte\"}'::jsonb) r")).r;
const vin = (await um("insert into adm.vinculos (empresa_id, app, tenant_ref, valor_mensal) values ($1, 'suprimentos', $2, 190) returning id", [emp, t1])).id;
const prep = async (sem = false) => (await um("select public.adm_srv_acesso_preparar($1, $2) r", [vin, sem])).r;
const lista = async () => (await um("select public.adm_acessos_comprador($1) r", [emp])).r[0];

console.log("\nValidações antes de liberar");
check("sem comprador não libera", /comprador/.test((await prep()).erro));
await db.query(`select public.adm_salvar_comprador($1, '{"comprador_nome":"Carla Mendes","comprador_email":"Carla@H.com","comprador_whatsapp":"(11) 98888-7777"}'::jsonb)`, [emp]);
check("e-mail vai em minúsculas", (await lista()).comprador_email === "carla@h.com");
check("e-mail inválido é recusado", !!(await falha(`select public.adm_salvar_comprador($1, '{"comprador_nome":"X","comprador_email":"x"}'::jsonb)`, [emp])));
check("sem pagamento não libera", /pagamento/.test((await prep()).erro));
check("lista mostra pendente e ligada", (await lista()).pago === false && (await lista()).disponivel === true);
check("exceção manual libera", (await prep(true)).ok === true);
await db.exec(`insert into adm.faturas (empresa_id, competencia, vencimento, valor, situacao) values ('${emp}', date '2026-11-01', date '2026-11-10', 190, 'paga')`);
const p1 = await prep();
check("com fatura paga libera", p1.ok && p1.usuario_id === null && p1.url === "https://s.x");

console.log("\nLiberar");
const u1 = (await um("insert into auth.users (email, encrypted_password) values ('carla@h.com', 'hash-prov') returning id")).id;
await db.query("select public.adm_srv_acesso_gravar($1, $2, true, false, 'admin')", [vin, u1]);
check("vira dona no Suprimentos", (await um("select perfil from suprimentos.usuarios where id = $1", [u1])).perfil === "admin");
check("senha não fica salva, só o hash de conferência", !JSON.stringify(await q("select * from adm.senhas_provisorias")).includes("Kv7"));
await db.query("select public.adm_srv_acesso_resultado($1, true, null)", [vin]);
check("situação enviado", (await lista()).situacao === "enviado");
check("histórico registra", (await um("select count(*)::int c from adm.eventos where tipo = 'acesso_liberado' and empresa_id = $1", [emp])).c === 1);
check("reenvio detecta senha pendente", (await prep()).senha_pendente === true);

console.log("\nPrimeiro acesso");
await db.query("select set_config('test.uid', $1, false)", [u1]);
let s = (await um("select public.primeiro_acesso_situacao() r")).r;
check("identifica primeiro acesso", s.precisa === true && s.expirada === false);
check("não conclui sem trocar a senha", /nova senha/.test(await falha("select public.primeiro_acesso_concluir()")));
await db.query("update auth.users set encrypted_password = 'hash-nova' where id = $1", [u1]);
await db.query("select public.primeiro_acesso_concluir()");
s = (await um("select public.primeiro_acesso_situacao() r")).r;
check("depois de trocar não pede mais", s.precisa === false);
check("painel mostra 1º acesso feito", (await lista()).situacao === "primeiro_acesso");
check("reenvio não troca a senha de quem já criou a dele", (await prep()).senha_pendente === false);

console.log("\nCasos especiais");
const u2 = (await um("insert into auth.users (email, encrypted_password) values ('b@h.com', 'h2') returning id")).id;
await db.query("insert into adm.senhas_provisorias (usuario_id, hash_inicial, expira_em) values ($1, 'h2', now() - interval '1 day')", [u2]);
await db.query("select set_config('test.uid', $1, false)", [u2]);
check("senha vencida é identificada", (await um("select public.primeiro_acesso_situacao() r")).r.expirada === true);
const u3 = (await um("insert into auth.users (email, encrypted_password) values ('c@h.com', 'h3') returning id")).id;
await db.query("select set_config('test.uid', $1, false)", [u3]);
check("quem não veio da liberação não é afetado", (await um("select public.primeiro_acesso_situacao() r")).r.precisa === false);
await db.query("insert into suprimentos.usuarios (id, imobiliaria_id, email) values ($1, $2, 'c@h.com')", [u3, t2]);
check("não rouba usuário de outra empresa", /outra empresa/.test(await falha("select adm.provisionar_suprimentos($1, $2, 'c@h.com', 'C')", [u3, t1])));

console.log("\nExcluir empresa");
const e2 = (await um("select public.adm_salvar_empresa('{\"razao_social\":\"Teste Apagar\"}'::jsonb) r")).r;
await db.query("insert into adm.vinculos (empresa_id, app, tenant_ref, valor_mensal) values ($1, 'suprimentos', $2, 10)", [e2, t2]);
check("nome errado não exclui", /Digite o nome/.test(await falha("select public.adm_excluir_empresa($1, 'outro')", [e2])));
await db.query("update adm.empresas set asaas_subscription_id = 'sub_x' where id = $1", [e2]);
check("com assinatura no Asaas não exclui", /Asaas/.test(await falha("select public.adm_excluir_empresa($1, 'teste apagar')", [e2])));
await db.query("update adm.empresas set asaas_subscription_id = null where id = $1", [e2]);
await db.query("select public.adm_excluir_empresa($1, ' Teste Apagar ')", [e2]);
check("exclui a empresa e os vínculos", (await um("select (select count(*) from adm.empresas where id = $1) + (select count(*) from adm.vinculos where empresa_id = $1) c", [e2])).c == 0);
check("anon não exclui", !(await (async () => (await um("select has_function_privilege('anon', 'public.adm_excluir_empresa(uuid,text)', 'execute') p")).p)()));

console.log("\nImobimoveis: criar, listar e liberar");
const emp3 = (await um("select public.adm_salvar_empresa('{\"razao_social\":\"Imobiliária São João Ltda\",\"nome_fantasia\":\"São João Imóveis\"}'::jsonb) r")).r;
let pl = (await um("select public.adm_plataforma_empresas('imobimoveis') r")).r;
check("plataforma oferece criar, listar e liberar", pl.pode_criar && pl.pode_listar && pl.pode_liberar);
check("lista mostra a empresa existente", pl.empresas.some((x) => x.nome === "Tenant Padrão"));
const v3 = (await um("select public.adm_vincular_criando($1::jsonb) r", [JSON.stringify({ empresa_id: emp3, app: "imobimoveis", plano: "Pro", valor_mensal: "390" })])).r;
const t3 = await um("select t.* from adm.vinculos v join imobimoveis.tenants t on t.id::text = v.ref where v.id = $1", [v3]);
check("cria a empresa na plataforma com o nome do cadastro", t3?.nome === "São João Imóveis" && /^sao-joao-imoveis-[0-9a-f]{5}$/.test(t3.slug), JSON.stringify(t3));
pl = (await um("select public.adm_plataforma_empresas('imobimoveis') r")).r;
check("empresa criada aparece como já vinculada", pl.empresas.find((x) => x.ref === t3.id).vinculada_a === "São João Imóveis");
const u4 = (await um("insert into auth.users (email, encrypted_password) values ('dono@saojoao.com', 'h4') returning id")).id;
await db.query("select adm.provisionar_imobimoveis($1, $2, 'dono@saojoao.com', 'Dono')", [u4, t3.id]);
check("comprador vira admin da empresa nova", (await um("select perfil from imobimoveis.tenant_users where user_id = $1 and tenant_id = $2", [u4, t3.id])).perfil === "admin");
await db.query("select adm.provisionar_imobimoveis($1, $2, 'dono@saojoao.com', 'Dono')", [u4, t3.id]);
check("liberar de novo não duplica", (await um("select count(*)::int c from imobimoveis.tenant_users where user_id = $1", [u4])).c === 1);
const padrao = (await um("select id from imobimoveis.tenants where slug = 'default'")).id;
check("não coloca o mesmo login em outra imobiliária", /outra imobiliária/.test(await falha("select adm.provisionar_imobimoveis($1, $2, 'x', 'x')", [u4, padrao])));
check("lista do Suprimentos funciona", Array.isArray((await um("select public.adm_plataforma_empresas('suprimentos') r")).r.empresas));
check("authenticated não cria empresa direto", !(await (async () => (await um("select has_function_privilege('authenticated', 'adm.criar_empresa_imobimoveis(text)', 'execute') p")).p)()));

console.log("\nPermissões");
const priv = async (r, f) => (await um("select has_function_privilege($1, $2, 'execute') p", [r, f])).p;
check("authenticated não prepara", !(await priv("authenticated", "public.adm_srv_acesso_preparar(uuid,boolean)")));
check("authenticated não grava", !(await priv("authenticated", "public.adm_srv_acesso_gravar(uuid,uuid,boolean,boolean,text)")));
check("authenticated não provisiona", !(await priv("authenticated", "adm.provisionar_suprimentos(uuid,text,text,text)")));
check("anon não consulta", !(await priv("anon", "public.primeiro_acesso_situacao()")));
check("login consulta a própria situação", await priv("authenticated", "public.primeiro_acesso_situacao()"));
await db.exec("select set_config('test.super', '0', false)");
check("lista exige super admin", !!(await falha("select public.adm_acessos_comprador()")));
check("excluir exige super admin", /super|admin|permiss/i.test(await falha("select public.adm_excluir_empresa($1, 'Horizonte')", [emp]) ?? ""));

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
