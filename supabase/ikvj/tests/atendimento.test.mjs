// Teste do Atendimento ONLINE (Fase 1) num Postgres local (PGlite). Não toca no ikvj.
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

const painel = async () => (await um("select public.com_atend_painel() r")).r;
const fila = async () => (await um("select public.com_atend_fila() r")).r;
const linha = async (id) => (await fila()).linhas.find((l) => l.negocio_id === id);
const lead = async (dados) => (await um("select comercial.receber_lead('site', $1::jsonb, null, null) r", [JSON.stringify(dados)])).r;
const temp = (id, t) => db.query("update comercial.negocios set temperatura = $2 where id = $1", [id, t]);

console.log("\nPré-preenchido");
const p = await painel();
check("atendente Sophia · WSA Sistemas IA", p.config.agente_nome === "Sophia" && p.config.empresa_nome === "WSA Sistemas IA");
check("roteiro com 5 passos (4 obrigatórios)", p.config.roteiro.length === 5 && p.config.roteiro.filter((r) => r.obrigatorio).length === 4);
check("boas-vindas só Morno e Quente", JSON.stringify(p.config.bv_temperaturas) === '["morno","quente"]');
check("texto de boas-vindas do ecossistema", p.config.bv_texto.includes("Ecossistema WSA Sistemas IA"));
check("robô nasce desligado", p.config.ligado === false);
check("7 sistemas do site, sem o ImobSystem", p.sistemas.length === 7 && !p.sistemas.some((s) => s.app === "imobsystem"), p.sistemas.map((s) => s.app).join());
check("páginas do site em /produtos/", p.sistemas.every((s) => s.pagina_url.startsWith("https://www.imobsystems.com.br/produtos/")));
check("funcionalidades em validação marcadas", p.sistemas.find((s) => s.app === "imobpesagens").funcionalidades.filter((f) => f.status === "em_validacao").length === 4);
check("6 respostas prontas", p.respostas.length === 6);

console.log("\nQuem recebe a boas-vindas");
const q1 = await lead({ nome: "Quente Um", telefone: "21999990001", email: "q1@x.com" }); await temp(q1.negocio_id, "quente");
const m1 = await lead({ nome: "Morno Um", telefone: "21999990002", email: "m1@x.com" }); await temp(m1.negocio_id, "morno");
const f1 = await lead({ nome: "Frio Um", telefone: "21999990003", email: "f1@x.com" }); await temp(f1.negocio_id, "frio");
const s1 = await lead({ nome: "Sem Fone", email: "s1@x.com" }); await temp(s1.negocio_id, "quente");
const c1 = await lead({ nome: "Com Consultor", telefone: "21999990005", email: "c1@x.com" }); await temp(c1.negocio_id, "quente");
await db.query("update comercial.negocios set etapa_id = (select id from comercial.etapas where chave = 'proposta') where id = $1", [c1.negocio_id]);
const g1 = await lead({ nome: "Ganhou", telefone: "21999990006", email: "g1@x.com" }); await temp(g1.negocio_id, "quente");
await db.query("update comercial.negocios set etapa_id = (select id from comercial.etapas where chave = 'ganho') where id = $1", [g1.negocio_id]);
const x1 = await lead({ nome: "Saiu", telefone: "21999990007", email: "x1@x.com" }); await temp(x1.negocio_id, "morno");
await db.query("update comercial.contatos set nao_whatsapp = true where id = (select contato_id from comercial.negocios where id = $1)", [x1.negocio_id]);
check("quente com telefone → na fila", (await linha(q1.negocio_id)).grupo === "na_fila");
check("morno com telefone → na fila", (await linha(m1.negocio_id)).grupo === "na_fila");
check("frio → fora", (await linha(f1.negocio_id)).motivo === "Lead frio", (await linha(f1.negocio_id)).motivo);
check("sem telefone → fora", (await linha(s1.negocio_id)).motivo === "Sem telefone");
check("proposta → consultor já conduz", /Consultor já conduz/.test((await linha(c1.negocio_id)).motivo));
check("ganho → fora", (await linha(g1.negocio_id)).motivo === "Etapa Ganho");
check("pediu para sair → fora", /não receber/.test((await linha(x1.negocio_id)).motivo));
const r = (await fila()).resumo;
check("resumo: 2 na fila, 1 sem telefone", Number(r.na_fila) === 2 && Number(r.sem_telefone) === 1, JSON.stringify(r));
check("na fila vem primeiro", (await fila()).linhas[0].grupo === "na_fila");
await db.query("insert into comercial.atend_conversas (negocio_id, situacao, bv_enviada_em) values ($1, 'aguardando', now())", [q1.negocio_id]);
check("quem já recebeu sai da fila", (await linha(q1.negocio_id)).grupo === "conversa");

console.log("\nSalvar configuração");
await db.query(`select public.com_atend_config_salvar('{"agente_nome":" Sophia IA ","bv_temperaturas":["quente"],"ligado":true,"bv_botoes":["A","B"]}'::jsonb)`);
const c2 = (await painel()).config;
check("nome salvo sem espaços", c2.agente_nome === "Sophia IA");
check("ligar não passa pelo salvar", c2.ligado === false);
check("botões salvos", c2.bv_botoes.length === 2);
check("roteiro mantido", c2.roteiro.length === 5);
check("só quente → morno sai da fila", (await linha(m1.negocio_id)).motivo === "Lead morno");
check("temperatura vazia recusada", /temperatura/.test(await falha(`select public.com_atend_config_salvar('{"bv_temperaturas":[]}'::jsonb)`)));
check("etapa inválida recusada", /Etapa/.test(await falha(`select public.com_atend_config_salvar('{"bv_etapas":["ganho"]}'::jsonb)`)));
check("limite por dia fora da faixa recusado", !!(await falha(`select public.com_atend_config_salvar('{"bv_limite_dia":0}'::jsonb)`)));
check("4 botões recusados", !!(await falha(`select public.com_atend_config_salvar('{"bv_botoes":["a","b","c","d"]}'::jsonb)`)));

console.log("\nLigar o robô");
check("sem simulação não liga", /simulação/.test(await falha("select public.com_atend_ligar(true)")));
await db.exec("select public.com_srv_atend_simulado()");
await db.exec("select public.com_atend_ligar(true)");
check("depois da simulação liga", (await painel()).config.ligado === true);

console.log("\nBase de conhecimento");
const novo = (await um(`select public.com_atend_sistema_salvar('{"nome":"Teste","menu_nome":"teste x","pagina_url":"https://www.imobsystems.com.br/x"}'::jsonb) r`)).r;
const sn = (await painel()).sistemas.find((s) => s.id === novo);
check("sistema novo no fim, menu em maiúsculas", sn.menu_nome === "TESTE X" && sn.ordem === 8 && sn.ativo === true);
await db.query(`select public.com_atend_sistema_salvar($1::jsonb)`, [JSON.stringify({ id: novo, ativo: false, apresentacao: "Olá" })]);
const sn2 = (await painel()).sistemas.find((s) => s.id === novo);
check("editar mantém o resto", sn2.ativo === false && sn2.apresentacao === "Olá" && sn2.nome === "Teste");
check("app repetido recusado", /outro item/.test(await falha(`select public.com_atend_sistema_salvar('{"id":"${novo}","app":"imobimoveis"}'::jsonb)`)));
check("app inexistente recusado", /inválido/.test(await falha(`select public.com_atend_sistema_salvar('{"id":"${novo}","app":"naoexiste"}'::jsonb)`)));
check("url sem https recusada", !!(await falha(`select public.com_atend_sistema_salvar('{"id":"${novo}","pagina_url":"http://x"}'::jsonb)`)));
await db.query("select public.com_atend_sistema_excluir($1)", [novo]);
check("excluir", (await painel()).sistemas.length === 7);
const rid = (await um(`select public.com_atend_resposta_salvar('{"pergunta":"Tem app?","resposta":"Sim.","categoria":"geral"}'::jsonb) r`)).r;
await db.query(`select public.com_atend_resposta_salvar($1::jsonb)`, [JSON.stringify({ id: rid, ativo: false })]);
check("resposta nova e desativada", (await painel()).respostas.find((x) => x.id === rid).ativo === false);
await db.query("select public.com_atend_resposta_excluir($1)", [rid]);
check("resposta excluída", (await painel()).respostas.length === 6);
const ctx = (await um("select public.com_srv_atend_contexto() r")).r;
check("contexto do robô só com ativos", ctx.sistemas.length === 7 && ctx.respostas.length === 6 && ctx.config.agente_nome === "Sophia IA");

console.log("\nConsultores");
const v1 = (await um("insert into comercial.vendedores (nome) values ('Ana') returning id")).id;
const v2 = (await um("insert into comercial.vendedores (nome) values ('Beto') returning id")).id;
await db.query("select public.com_atend_consultores_salvar($1::jsonb)", [JSON.stringify([{ vendedor_id: v2, apps: ["suprimentos"], apto: false }, { vendedor_id: v1 }])]);
const cs = (await painel()).consultores.filter((c) => c.na_fila);
check("ordem do rodízio", cs[0].nome === "Beto" && cs[1].nome === "Ana" && cs[0].apto === false && cs[0].apps[0] === "suprimentos", JSON.stringify(cs));

console.log("\nSegurança");
await db.exec("select set_config('test.super', '0', false)");
check("não super admin: painel bloqueado", /super admin/.test(await falha("select public.com_atend_painel()")));
check("não super admin: fila bloqueada", /super admin/.test(await falha("select public.com_atend_fila()")));
check("não super admin: salvar bloqueado", /super admin/.test(await falha(`select public.com_atend_config_salvar('{}'::jsonb)`)));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
