// Teste do Atendimento ONLINE (Fase 3: WhatsApp) num Postgres local (PGlite). Não toca no ikvj.
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
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets (name, segredo) values (n, s) returning id $$; create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set segredo = s where id = i $$;
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


const um1 = async (s, p) => (await um(s, p));
const r = async (s, p) => (await um(s, p)).r;
const lead = async (d) => (await um("select comercial.receber_lead('site', $1::jsonb, null, null) r", [JSON.stringify(d)])).r;
const temp = (id, t, p) => db.query("update comercial.negocios set temperatura = $2, pontuacao = $3 where id = $1", [id, t, p]);
const pegar = () => r("select public.com_srv_atend_bv_pegar() r");
const entrada = (fone, txt, id) => r("select public.com_srv_atend_entrada($1, $2, $3, $4) r", [fone, txt, id, fone + "@c.us"]);
const livre = () => db.exec("update comercial.atend_config set proximo_envio_em = null");

await db.exec(`update comercial.atend_config set bv_janela = '{"seg_sex":["00:00","24:00"],"sab":["00:00","24:00"],"dom":["00:00","24:00"]}',
  horario_consultores = '{"seg_sex":["00:00","24:00"],"sab":["00:00","24:00"],"dom":["00:00","24:00"]}'`);
const q1 = await lead({ nome: "Quente Um", telefone: "21999990001", email: "q1@x.com" }); await temp(q1.negocio_id, "quente", 70);
const m1 = await lead({ nome: "Morno Um", telefone: "21999990002", email: "m1@x.com" }); await temp(m1.negocio_id, "morno", 45);
const f1 = await lead({ nome: "Frio Um", telefone: "21999990003", email: "f1@x.com" }); await temp(f1.negocio_id, "frio", 20);
const m2 = await lead({ nome: "Morno Dois", telefone: "21999990004", email: "m2@x.com" }); await temp(m2.negocio_id, "morno", 40);

console.log("\nEnvio da boas-vindas");
check("robô desligado não envia", (await pegar()).motivo === "desligado");
await db.exec("update comercial.atend_config set ligado = true");
const p1 = await pegar();
check("primeiro: o mais quente", p1.ok && p1.negocio_id === q1.negocio_id && p1.chat_id === "5521999990001@c.us", JSON.stringify(p1));
check("intervalo segura o próximo", (await pegar()).motivo === "intervalo");
const prox = (await um("select extract(epoch from proximo_envio_em - now()) s from comercial.atend_config")).s;
check("intervalo entre 40 e 90 s", prox >= 38 && prox <= 91, prox);
await livre();
const p2 = await pegar();
check("depois: o morno de maior nota", p2.negocio_id === m1.negocio_id);
await db.exec("update comercial.atend_config set bv_limite_dia = 2"); await livre();
check("limite do dia", (await pegar()).motivo === "limite_do_dia");
await db.exec("update comercial.atend_config set bv_limite_dia = 80"); await livre();
await db.exec("update comercial.atend_config set bv_janela = '{\"seg_sex\":null,\"sab\":null,\"dom\":null}'");
check("fora da janela", (await pegar()).motivo === "fora_da_janela");
await db.exec(`update comercial.atend_config set bv_janela = '{"seg_sex":["00:00","24:00"],"sab":["00:00","24:00"],"dom":["00:00","24:00"]}'`);
await db.query("select public.com_srv_atend_bv_resultado($1, true, 'Olá, Quente!', 'wa-bv-1', null)", [p1.conversa_id]);
await db.query("select public.com_srv_atend_bv_resultado($1, false, null, null, 'número não existe')", [p2.conversa_id]);
check("enviada grava mensagem e data", (await um("select bv_enviada_em is not null e from comercial.atend_conversas where id = $1", [p1.conversa_id])).e
  && (await um("select count(*)::int n from comercial.atend_mensagens where conversa_id = $1", [p1.conversa_id])).n === 1);
check("falha fica marcada", (await um("select situacao, bv_erro from comercial.atend_conversas where id = $1", [p2.conversa_id])).situacao === "falhou");
check("atividade na linha do tempo", (await um("select count(*)::int n from comercial.atividades where negocio_id = $1 and texto like 'Boas-vindas%'", [q1.negocio_id])).n === 1);

console.log("\nMensagens que chegam");
check("número desconhecido é ignorado", (await entrada("5511988887777", "oi", "w1")).acao === "ignorar");
const e1 = await entrada("552199990001", "Sou de uma construtora", "w2");
check("acha o lead mesmo sem o 9", e1.acao === "responder" && e1.lead.nome === "Quente Um", JSON.stringify(e1));
check("histórico com boas-vindas e a resposta", e1.historico.length === 2 && e1.historico[0].autor === "robo" && e1.historico[1].texto === "Sou de uma construtora");
check("token de agenda e horário vêm junto", !!e1.token_agenda && e1.fora_do_horario === false);
check("mensagem repetida é ignorada", (await entrada("5521999990001", "Sou de uma construtora", "w2")).acao === "duplicada");
check("conversa vira robô", (await um("select situacao from comercial.atend_conversas where id = $1", [p1.conversa_id])).situacao === "robo");

console.log("\nResposta da Sophia");
const v1 = (await um("insert into comercial.vendedores (nome, whatsapp) values ('Ana', '5521988880000') returning id")).id;
const v2 = (await um("insert into comercial.vendedores (nome) values ('Beto') returning id")).id;
await db.query("select public.com_atend_consultores_salvar($1::jsonb)", [JSON.stringify([{ vendedor_id: v2, apps: ["imobdoces"] }, { vendedor_id: v1 }])]);
await db.query("select public.com_srv_atend_resposta($1, 'Que bom! Qual a maior dor hoje?', 'wa-r1', $2::jsonb)", [p1.conversa_id, JSON.stringify({ temperatura: 55, etapa: "qualificacao" })]);
const n1 = await um("select n.pontuacao, n.temperatura, e.chave from comercial.negocios n join comercial.etapas e on e.id = n.etapa_id where n.id = $1", [q1.negocio_id]);
check("nota 55 → morno pelos limites", n1.pontuacao === 55 && n1.temperatura === "morno", JSON.stringify(n1));
check("Novo lead → Qualificação", n1.chave === "qualificacao");
await db.exec(`update comercial.negocios set sistemas = '{suprimentos}' where id = '${q1.negocio_id}'`);
const rc = await r("select public.com_srv_atend_resposta($1, 'Vou chamar um consultor.', 'wa-r2', $2::jsonb) r", [p1.conversa_id, JSON.stringify({ temperatura: 82, passar_consultor: true, motivo_consultor: "Pediu preço" })]);
check("passa para o consultor que atende o sistema (Ana)", rc.consultor?.nome === "Ana" && rc.consultor.whatsapp === "5521988880000", JSON.stringify(rc));
check("conversa com consultor e vendedor no negócio", (await um("select situacao from comercial.atend_conversas where id = $1", [p1.conversa_id])).situacao === "consultor"
  && (await um("select vendedor_id from comercial.negocios where id = $1", [q1.negocio_id])).vendedor_id === v1);
check("com consultor, a Sophia só registra", (await entrada("5521999990001", "Ok, aguardo", "w3")).acao === "registrar");
await db.query("select public.com_atend_assumir($1, false)", [p1.conversa_id]);
check("devolver para a Sophia", (await entrada("5521999990001", "Voltei", "w4")).acao === "responder");

console.log("\nLead que escreve primeiro e PARAR");
const e2 = await entrada("5521999990004", "Oi, quero saber mais", "w5");
check("morno apto que escreve primeiro é atendido", e2.acao === "responder");
check("conversa nasce com origem lead", (await um("select origem from comercial.atend_conversas where id = $1", [e2.conversa_id])).origem === "lead");
check("frio que escreve primeiro é ignorado", (await entrada("5521999990003", "oi", "w6")).acao === "ignorar");
const s1 = await entrada("5521999990004", "parar!", "w7");
check("PARAR tira da lista", s1.acao === "sair" && (await um("select nao_whatsapp from comercial.contatos where whatsapp = '5521999990004'")).nao_whatsapp === true);
check("depois do PARAR só registra", (await entrada("5521999990004", "oi de novo", "w8")).acao === "registrar");

console.log("\nLembrete sem resposta");
await db.query("select public.com_srv_atend_registrar($1, 'robo', 'Qual o tamanho da equipe?', 'wa-r3')", [p1.conversa_id]);
check("antes das 4 h, nada", (await r("select public.com_srv_atend_lembretes_pegar() r")).length === 0);
await db.query("update comercial.atend_conversas set ultima_msg_em = now() - interval '5 hours' where id = $1", [p1.conversa_id]);
const lb = await r("select public.com_srv_atend_lembretes_pegar() r");
check("depois de 4 h, 1 lembrete", lb.length === 1 && lb[0].conversa_id === p1.conversa_id);
await db.query("update comercial.atend_conversas set ultima_msg_em = now() - interval '9 hours' where id = $1", [p1.conversa_id]);
check("só 1 lembrete por conversa", (await r("select public.com_srv_atend_lembretes_pegar() r")).length === 0);

console.log("\nConsultor respondendo pelo celular");
check("mensagem do próprio robô é ignorada", (await r("select public.com_srv_atend_saida_celular('5521999990001', 'x', 'wa-r1') r")).acao === "ja_registrada");
await db.query("update comercial.atend_conversas set situacao = 'robo' where id = $1", [p1.conversa_id]);
const sc = await r("select public.com_srv_atend_saida_celular('552199990001', 'Oi, aqui é o Wagner!', 'cel-1') r");
check("resposta do celular grava como consultor e pausa a Sophia", sc.acao === "consultor"
  && (await um("select situacao from comercial.atend_conversas where id = $1", [p1.conversa_id])).situacao === "consultor"
  && (await um("select autor from comercial.atend_mensagens where wa_id = 'cel-1'")).autor === "consultor");
await db.query("update comercial.atend_conversas set situacao = 'robo' where id = $1", [p1.conversa_id]);
await db.query("select public.com_srv_atend_registrar($1, 'robo', 'Texto do robô sem id', null)", [p1.conversa_id]);
check("eco do robô sem id não pausa", (await r("select public.com_srv_atend_saida_celular('5521999990001', 'Texto do robô sem id', 'eco-1') r")).acao === "ja_registrada"
  && (await um("select situacao from comercial.atend_conversas where id = $1", [p1.conversa_id])).situacao === "robo");
check("celular para quem não tem conversa é ignorado", (await r("select public.com_srv_atend_saida_celular('5511900001111', 'oi', 'cel-2') r")).acao === "ignorar");
console.log("\nOferta de horários e aviso");
await db.query("select public.com_srv_atend_oferta($1, $2::jsonb)", [p1.conversa_id, JSON.stringify({ tipo: "horarios", slots: ["2026-11-20T13:00:00Z"], expira: "2099-01-01T00:00:00Z" })]);
check("oferta guardada e lida", (await r("select public.com_srv_atend_oferta_ler($1) r", [p1.conversa_id])).slots[0] === "2026-11-20T13:00:00Z");
await db.query("select public.com_srv_atend_oferta($1, null)", [p1.conversa_id]);
check("oferta limpa", (await r("select public.com_srv_atend_oferta_ler($1) r", [p1.conversa_id])) === null);
const ag = await r("select public.com_srv_atend_agenda_geral() r");
check("agenda geral para o simulador", !!ag.config && Array.isArray(ag.agendas) && ag.minha === null);
const reu = (await um("insert into comercial.reunioes (negocio_id, vendedor_id, inicio, fim) values ($1, $2, now() + interval '1 day', now() + interval '1 day 30 min') returning id", [q1.negocio_id, v1])).id;
const av = await r("select public.com_srv_atend_reuniao_aviso($1) r", [reu]);
check("aviso da reunião traz consultor e lead", av.consultor.nome === "Ana" && av.lead.nome === "Quente Um", JSON.stringify(av));
check("roteiro passo 4 sem link", !(await um("select roteiro->3->>'descricao' d from comercial.atend_config")).d.includes("link"));

console.log("\nUsuários e consultores");
const sv = (p) => r("select public.com_usuario_salvar($1::jsonb) r", [JSON.stringify(p)]);
const u1 = await sv({ nome: "Carla Consultora", email: "Carla@WSA.com", whatsapp: "(21) 98765-4321", papel: "consultor", na_fila: true, apps: ["imobimoveis"] });
const uc = (await r("select public.com_usuarios() r")).find((u) => u.id === u1);
check("salva com WhatsApp normalizado e e-mail minúsculo", uc.whatsapp === "5521987654321" && uc.email === "carla@wsa.com", JSON.stringify(uc));
check("entra na fila com os sistemas", uc.na_fila && uc.apto && uc.apps[0] === "imobimoveis");
check("avisos padrão (remarcada desligado)", uc.avisos.reuniao_marcada === true && uc.avisos.remarcada === false);
check("fila sem WhatsApp é recusada", /WhatsApp/.test(await falha(`select public.com_usuario_salvar('{"nome":"Sem Fone","na_fila":true}'::jsonb)`)));
check("WhatsApp inválido é recusado", /inválido/.test(await falha(`select public.com_usuario_salvar('{"nome":"X","whatsapp":"123"}'::jsonb)`)));
check("WhatsApp repetido é recusado", /outro usuário/.test(await falha(`select public.com_usuario_salvar('{"nome":"Outra","whatsapp":"21987654321"}'::jsonb)`)));
check("nome obrigatório", /nome/.test(await falha(`select public.com_usuario_salvar('{"nome":" "}'::jsonb)`)));
await sv({ id: u1, nome: "Carla Consultora", whatsapp: "21987654321", papel: "administrador", na_fila: false, avisos: { lembrete_1h: false } });
const uc2 = (await r("select public.com_usuarios() r")).find((u) => u.id === u1);
check("editar: sai da fila, vira administrador e muda só o aviso pedido", !uc2.na_fila && uc2.papel === "administrador" && uc2.avisos.lembrete_1h === false && uc2.avisos.reuniao_marcada === true);
check("aviso permitido segue a escolha do usuário", (await r("select public.com_srv_aviso_permitido('+55 (21) 98765-4321', 'reuniao_marcada') r")) === true
  && (await r("select public.com_srv_aviso_permitido('5521987654321', 'lembrete_1h') r")) === false);
check("número que não é de usuário não recebe aviso", (await r("select public.com_srv_aviso_permitido('5511900000000', 'reuniao_marcada') r")) === false);
await db.query("insert into comercial.agendas_google (vendedor_id, email, calendar_id, ativo, token_valido) values ($1, 'carla@wsa.com', 'primary', true, true)", [u1]);
await db.query("select public.com_usuario_ativo($1, false)", [u1]);
check("desativar pausa a agenda e tira o aviso", (await um("select ativo, pausada_por_usuario from comercial.agendas_google where vendedor_id = $1", [u1])).pausada_por_usuario === true
  && (await r("select public.com_srv_aviso_permitido('5521987654321', 'reuniao_marcada') r")) === false);
await db.query("select public.com_usuario_ativo($1, true)", [u1]);
check("reativar devolve a agenda", (await um("select ativo from comercial.agendas_google where vendedor_id = $1", [u1])).ativo === true);
const reu2 = (await um("insert into comercial.reunioes (negocio_id, vendedor_id, inicio, fim, meet_url) values ($1, $2, now() + interval '40 min', now() + interval '70 min', 'https://meet/x') returning id", [m1.negocio_id, v1])).id;
await db.exec(`update comercial.vendedores set whatsapp = '5521988880000', avisos = avisos || '{"lembrete_1h": true}' where nome = 'Ana'`);
const lb1 = await r("select public.com_srv_usuario_lembretes_pegar() r");
check("lembrete 1 h antes para o consultor da reunião", lb1.some((x) => x.whatsapp === "5521988880000" && x.lead === "Morno Um" && x.meet_url === "https://meet/x"), JSON.stringify(lb1));
check("lembrete sai uma vez só", (await r("select public.com_srv_usuario_lembretes_pegar() r")).length === 0);
console.log("\nPainel e webhook");
const cs = await r("select public.com_atend_conversas() r");
check("lista de conversas", cs.length === 3 && cs.some((c) => c.situacao === "saiu"), cs.map((c) => c.situacao).join());
check("busca por telefone", (await r("select public.com_atend_conversas('99990001') r")).length === 1);
const ms = await r("select public.com_atend_mensagens($1) r", [p1.conversa_id]);
check("mensagens em ordem", ms[0].texto === "Olá, Quente!" && ms.length >= 6, ms.length);
const info = await r("select public.com_atend_whatsapp_info() r");
check("info do WhatsApp", Number(info.enviadas_hoje) === 2 && Number(info.falhas_hoje) === 1 && info.webhook_conectado === false, JSON.stringify(info));
await db.exec("select public.com_srv_atend_webhook_gravar('segredo-1234567890ab', 'wh-1')");
await db.exec("select public.com_srv_atend_webhook_gravar('segredo-novo-1234567890', 'wh-1')");
check("segredo do webhook no Vault", (await r("select public.com_srv_atend_webhook_segredo() r")) === "segredo-novo-1234567890");
check("webhook conectado", (await r("select public.com_atend_whatsapp_info() r")).webhook_conectado === true);
await db.query("update comercial.atend_conversas set situacao = 'robo' where id = $1", [p1.conversa_id]);
check("destino pausa o robô", (await r("select public.com_srv_atend_destino($1) r", [p1.conversa_id])) === "5521999990001@c.us"
  && (await um("select situacao from comercial.atend_conversas where id = $1", [p1.conversa_id])).situacao === "consultor");
check("destino de quem saiu é vazio", (await r("select public.com_srv_atend_destino($1) r", [e2.conversa_id])) === null);
await db.exec("select set_config('test.super', '0', false)");
check("não super admin: conversas bloqueadas", /super admin/.test(await falha("select public.com_atend_conversas()")));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
