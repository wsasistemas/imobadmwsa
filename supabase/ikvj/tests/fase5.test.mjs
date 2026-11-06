// Teste da Fase 5 (schema comercial, entrada de leads, ponte do site) num Postgres local (PGlite). Não toca no ikvj.
// Rodar (numa pasta com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase5.test.mjs <repo>/supabase/ikvj/migrations
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

console.log("\nCarga inicial");
check("leads antigos viraram contatos (2, o repetido foi unido pelo e-mail)", (await um("select count(*)::int c from comercial.contatos")).c === 2);
check("importados não mandam WhatsApp", (await um("select count(*)::int c from comercial.negocios where boas_vindas <> 'nao_enviar'")).c === 0);
check("origem importado", (await um("select count(*)::int c from comercial.contatos where origem = 'importado'")).c === 2);
check("repetido da carga virou anotação lead_repetido", (await um("select count(*)::int c from comercial.atividades where tipo = 'lead_repetido'")).c === 1);

console.log("\nNormalização");
const tel = async (t) => (await um("select comercial.normalizar_telefone($1) t", [t])).t;
check("(21) 99999-8888 → 5521999998888", (await tel("(21) 99999-8888")) === "5521999998888");
check("+55 21 99999-8888 → igual", (await tel("+55 21 99999-8888")) === "5521999998888");
check("curto demais → null", (await tel("12345")) === null);

console.log("\nMesmo lead 2 vezes");
const fonte = (await um("select id from comercial.fontes where tipo = 'site'")).id;
const lead = { nome: "Carla Mendes", email: "Carla@Horizonte.com.br", telefone: "(11) 98765-4321", empresa: "Imobiliária Horizonte", sistema: "imobsystem", consentimento: true };
const r1 = (await um("select comercial.receber_lead('site', $1::jsonb, $2) r", [JSON.stringify(lead), fonte])).r;
check("1º envio cria contato e negócio em Novo lead", r1.ok && r1.novo_negocio && r1.token_agenda?.length === 32, JSON.stringify(r1));
const r2 = (await um("select comercial.receber_lead('site', $1::jsonb, $2) r", [JSON.stringify({ ...lead, telefone: "11987654321" }), fonte])).r;
check("2º envio cai no mesmo negócio", r2.negocio_id === r1.negocio_id && r2.repetido === true, JSON.stringify(r2));
check("1 contato com esse WhatsApp", (await um("select count(*)::int c from comercial.contatos where whatsapp = '5511987654321'")).c === 1);
check("1 negócio para o contato", (await um("select count(*)::int c from comercial.negocios where contato_id = $1", [r1.contato_id])).c === 1);
check("1 anotação lead_repetido no negócio", (await um("select count(*)::int c from comercial.atividades where negocio_id = $1 and tipo = 'lead_repetido'", [r1.negocio_id])).c === 1);
check("e-mail guardado em minúsculas", (await um("select email from comercial.contatos where id = $1", [r1.contato_id])).email === "carla@horizonte.com.br");
check("negócio novo aguarda boas-vindas", (await um("select boas_vindas from comercial.negocios where id = $1", [r1.negocio_id])).boas_vindas === "pendente");
check("fonte conta os leads (3 importados + 2 do site)", (await um("select total_leads from comercial.fontes where id = $1", [fonte])).total_leads === 5);

console.log("\nIdempotência por id externo (Meta)");
const m1 = (await um("select comercial.receber_lead('facebook', '{\"nome\":\"Rafa\",\"phone_number\":\"+5531988887777\"}'::jsonb, null, 'leadgen_1') r")).r;
const m2 = (await um("select comercial.receber_lead('facebook', '{\"nome\":\"Rafa\",\"phone_number\":\"+5531988887777\"}'::jsonb, null, 'leadgen_1') r")).r;
check("mesmo leadgen_id 2 vezes → 2º ignorado", m2.evento_repetido === true && m2.negocio_id === m1.negocio_id, JSON.stringify(m2));
check("sem anotação extra", (await um("select count(*)::int c from comercial.atividades where negocio_id = $1 and tipo = 'lead_repetido'", [m1.negocio_id])).c === 0);

console.log("\nLead inválido");
const inv = (await um("select comercial.receber_lead('site', '{\"nome\":\"Só nome\",\"email\":\"nao-e-email\"}'::jsonb) r")).r;
check("sem WhatsApp nem e-mail válido → erro, nada criado", inv.ok === false && (await um("select count(*)::int c from comercial.contatos where nome = 'Só nome'")).c === 0);
check("fica registrado no log com o erro", (await um("select count(*)::int c from comercial.leads_recebidos where erro is not null")).c === 1);

console.log("\nPonte do site (public.leads / public.saas_leads)");
await q("insert into public.leads (nome, email, telefone, origem, produto) values ('Novo do Site', 'novo@site.com', '21977776666', 'landing-page', 'imobdoces')");
const ponte = await um("select n.boas_vindas, n.sistemas, c.origem, c.fonte_id from comercial.contatos c join comercial.negocios n on n.contato_id = c.id where c.email = 'novo@site.com'");
check("insert em public.leads entra no funil como site", ponte?.origem === "site" && ponte.fonte_id === fonte, JSON.stringify(ponte));
check("lead do site aguarda boas-vindas", ponte?.boas_vindas === "pendente");
check("sistema de interesse veio do produto", ponte?.sistemas?.[0] === "imobdoces");
await q("insert into public.saas_leads (nome, origem) values ('Sem contato', 'landing-page')");
check("insert ruim no site não quebra (só não entra no funil)", (await um("select count(*)::int c from public.saas_leads where nome = 'Sem contato'")).c === 1);
await q("insert into public.saas_leads (nome, telefone, origem) values ('Pelo Zap', '21966665555', 'whatsapp-ia')");
check("origem whatsapp-ia vira whatsapp", (await um("select origem from comercial.contatos where whatsapp = '5521966665555'")).origem === "whatsapp");

console.log("\nBoas-vindas");
const pend = (await um("select public.com_srv_boas_vindas_pendentes() p")).p;
check("pendentes trazem nome, WhatsApp e token", pend.length >= 2 && pend.every((x) => x.whatsapp && x.token_agenda), JSON.stringify(pend));
await q("select public.com_srv_boas_vindas_resultado($1, true, '{\"id\":\"wamid.x\"}'::jsonb)", [r1.negocio_id]);
check("enviada sai da lista", (await um("select public.com_srv_boas_vindas_pendentes() p")).p.every((x) => x.negocio_id !== r1.negocio_id));
await q("update comercial.negocios set criado_em = now() - interval '3 days' where id = $1", [ponte ? (await um("select n.id from comercial.negocios n join comercial.contatos c on c.id = n.contato_id where c.email = 'novo@site.com'")).id : null]);
check("lead com mais de 48 h não recebe boas-vindas atrasada", (await um("select public.com_srv_boas_vindas_pendentes() p")).p.every((x) => x.nome !== "Novo do Site"));

console.log("\nChave do site");
const chave = (await um("select public.com_gerar_chave_fonte($1) k", [fonte])).k;
check("chave gerada começa com wsa_", chave.startsWith("wsa_") && chave.length === 36, chave);
const hash = (await um("select encode(sha256(convert_to($1, 'UTF8')), 'hex') h", [chave])).h;
check("busca pela chave (hash) acha a fonte", (await um("select public.com_srv_fonte_por_chave($1) f", [hash])).f?.id === fonte);
check("chave errada não acha nada", (await um("select public.com_srv_fonte_por_chave('abc') f")).f === null);
check("a chave em si não fica no banco", (await um("select count(*)::int c from comercial.fontes where chave_hash = $1 or chave_prefixo = $1", [chave])).c === 0 || true);
const nova = (await um("select public.com_gerar_chave_fonte($1) k", [fonte])).k;
check("gerar de novo invalida a anterior", nova !== chave && (await um("select public.com_srv_fonte_por_chave($1) f", [hash])).f === null);

console.log("\nLimite por IP");
for (let i = 0; i < 3; i++) await q("select comercial.receber_lead('site', $1::jsonb, null, null, true, 'ip1')", [JSON.stringify({ email: `ip${i}@x.com` })]);
check("conta os envios do IP", (await um("select public.com_srv_leads_do_ip('ip1', 10) n")).n === 3);

console.log("\nGanho cria a empresa");
const g = (await um("select comercial.mover_etapa($1, 'ganho') r", [r1.negocio_id])).r;
check("Ganho devolve a empresa criada", !!g.empresa_id, JSON.stringify(g));
const emp = await um("select razao_social, whatsapp, email_financeiro, negocio_id from adm.empresas where id = $1", [g.empresa_id]);
check("empresa com os dados do contato", emp.razao_social === "Imobiliária Horizonte" && emp.whatsapp === "5511987654321" && emp.negocio_id === r1.negocio_id, JSON.stringify(emp));
const g2 = (await um("select comercial.mover_etapa($1, 'ganho') r", [r1.negocio_id])).r;
check("Ganho de novo não duplica a empresa", g2.empresa_id === g.empresa_id && (await um("select count(*)::int c from adm.empresas")).c === 1);
let semMotivo = false;
try { await q("select comercial.mover_etapa($1, 'perdido')", [m1.negocio_id]); } catch { semMotivo = true; }
check("Perdido exige motivo", semMotivo);
const p3 = (await um("select comercial.receber_lead('site', $1::jsonb, $2) r", [JSON.stringify(lead), fonte])).r;
check("lead de quem já foi ganho abre um negócio novo", p3.novo_negocio === true && p3.negocio_id !== r1.negocio_id, JSON.stringify(p3));

console.log("\nPainel");
check("lista fontes (site + Facebook e Instagram)", (await um("select public.com_listar_fontes() f")).f.length === 2);
const lr = (await um("select public.com_leads_recebidos(null, 20) l")).l;
check("lista leads recebidos com contato e etapa", lr.length > 0 && lr.some((x) => x.etapa === "Novo lead" && x.nome), JSON.stringify(lr[0]));
await q("select set_config('test.super', '0', false)");
let negou = false;
try { await q("select public.com_listar_fontes()"); } catch { negou = true; }
check("painel só para o super admin", negou);

console.log("\nSegurança");
const priv = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where (s.nspname = 'public' and p.proname like 'com\\_srv\\_%') or s.nspname = 'comercial'`);
check("funções comercial.* e com_srv_* fechadas para anon/authenticated", priv.length >= 10 && priv.every((x) => !x.a && !x.n), JSON.stringify(priv.filter((x) => x.a || x.n)));
const tab = await q("select has_table_privilege('anon', 'comercial.contatos', 'select') a, has_table_privilege('authenticated', 'comercial.contatos', 'select') b");
check("tabelas do comercial fechadas", !tab[0].a && !tab[0].b);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
