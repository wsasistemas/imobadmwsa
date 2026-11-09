// Teste da Fase 7 (agenda) num Postgres local (PGlite). Não toca no ikvj nem no Google.
// Rodar (numa pasta com `npm i @electric-sql/pglite@0.3.14`, copiando este arquivo para lá):
//   node fase7.test.mjs <repo>/supabase/ikvj/migrations <repo>/supabase/ikvj/functions/_shared/agenda-slots.ts
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
const { gerarHorarios } = await import(pathToFileURL(process.argv[3]).href);
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
  create schema vault;
  create schema extensions; create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat('ab', n), 'hex') $$;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, segredo text);
  create view vault.decrypted_secrets as select id, name, segredo as decrypted_secret from vault.secrets;
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets (name, segredo) values (n, s) returning id $$;
  create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set segredo = s where id = i $$;
  create schema acessos;
  create table acessos.aplicativos (schema_name text primary key, nome text not null, url text, oculto boolean not null default false,
    controle_ativo boolean not null default false, ultima_verificacao_em timestamptz, schema_dados text);
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces;
  create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select false $$;
  insert into acessos.aplicativos (schema_name, nome) values ('imobdoces', 'ImobDoces'), ('imobsystem', 'ImobSystem');
  create table public.leads (id uuid primary key default gen_random_uuid(), nome text not null, email text not null,
    created_at timestamptz not null default now(), telefone text, interesse text, origem text, status text not null default 'novo',
    empresa text, produto text, mensagem text, consentimento_em timestamptz);
  create table public.saas_leads (id uuid primary key default gen_random_uuid(), nome text, email text, telefone text, empresa text,
    origem text, interesse jsonb, status text not null default 'novo', criado_em timestamptz not null default now(), produto_interesse text);
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(`${dir}/${f}`, "utf8"));

const lead = async (nome, tel) => {
  const r = (await um("select comercial.receber_lead('site', $1::jsonb) r", [JSON.stringify({ nome, telefone: tel, email: `${tel}@x.com` })])).r;
  const n = await um("select token_agenda from comercial.negocios where id = $1", [r.negocio_id]);
  return { id: r.negocio_id, token: n.token_agenda };
};
const etapa = async (id) => (await um("select e.chave from comercial.negocios n join comercial.etapas e on e.id = n.etapa_id where n.id = $1", [id])).chave;
const reservar = async (token, ini, ags, sub = null) => (await um("select public.com_srv_agenda_reservar($1, $2::timestamptz, $3::uuid[], $4::uuid) r", [token, ini, ags, sub])).r;
const confirmar = async (id, ev, sub = null) => (await um("select public.com_srv_agenda_confirmar($1, $2, 'https://meet/x', $3::uuid) r", [id, ev, sub])).r;

const ag1 = (await um("select public.com_srv_google_gravar('ana@wsa.com', 'refresh-ana', null) r")).r;
const ag2 = (await um("select public.com_srv_google_gravar('bia@wsa.com', 'refresh-bia', null) r")).r;
await db.exec("update comercial.agendas_google set criado_em = now() - interval '1 day' where email = 'ana@wsa.com'");
const daqui = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

console.log("\nConexão");
check("refresh token não fica em coluna aberta", !JSON.stringify(await q("select * from comercial.agendas_google")).includes("refresh-ana"));
check("vendedor criado pelo e-mail", (await um("select count(*)::int c from comercial.vendedores where email = 'ana@wsa.com'")).c === 1);
check("reconectar não duplica", (await um("select public.com_srv_google_gravar('ANA@wsa.com', 'refresh-ana2', null) r")).r === ag1);

console.log("\nToken");
const a = await lead("Ana Lead", "11988880001"), b = await lead("Beto Lead", "11988880002"), c0 = await lead("Caio Lead", "11988880003");
check("token inválido não abre", (await um("select public.com_srv_agenda_contexto('nada') r")).r === null);
const ctx = (await um("select public.com_srv_agenda_contexto($1) r", [a.token])).r;
check("token válido abre com as 2 agendas", ctx.agendas.length === 2 && ctx.minha === null);
await db.query("update comercial.negocios set token_expira_em = now() - interval '1 minute' where id = $1", [c0.id]);
check("token vencido não abre", (await um("select public.com_srv_agenda_contexto($1) r", [c0.token])).r === null);
check("token vencido não reserva", (await reservar(c0.token, daqui(48), [ag1])).motivo === "token");

console.log("\nTrava de horário");
const t = daqui(72);
const [r1, r2] = await Promise.all([reservar(a.token, t, [ag1]), reservar(b.token, t, [ag1])]);
check("dois leads ao mesmo tempo: só um marca", [r1, r2].filter((r) => r.ok).length === 1, JSON.stringify([r1, r2]));
check("o outro recebe ocupado", [r1, r2].some((r) => !r.ok && r.motivo === "ocupado"));
const quem = r1.ok ? a : b, outro = r1.ok ? b : a, res = r1.ok ? r1 : r2;
check("com outra agenda livre, o outro marca", (await reservar(outro.token, t, [ag1, ag2])).agenda_id === ag2);
await db.exec("delete from comercial.reunioes where agenda_id = '" + ag2 + "'");
check("não marca colado na outra (intervalo de 15 min)", (await reservar(outro.token, new Date(new Date(t).getTime() + 35 * 60000).toISOString(), [ag1])).ok === false);
check("respeita a antecedência", (await reservar(outro.token, daqui(1), [ag1])).ok === false);
check("mesmo lead não marca duas", (await reservar(quem.token, daqui(96), [ag1])).motivo === "ja_marcada");

console.log("\nGoogle falhou");
const sol = await reservar(outro.token, daqui(120), [ag2]);
await db.query("select public.com_srv_agenda_soltar($1)", [sol.reuniao_id]);
check("reserva é solta", (await um("select count(*)::int c from comercial.reunioes where id = $1", [sol.reuniao_id])).c === 0);

console.log("\nConfirmar, remarcar e cancelar");
await confirmar(res.reuniao_id, "ev1");
check("card vai para Reunião agendada", (await etapa(quem.id)) === "reuniao_agendada");
check("reunião aparece na página", (await um("select public.com_srv_agenda_contexto($1) r", [quem.token])).r.minha.id === res.reuniao_id);
const nova = await reservar(quem.token, daqui(100), [ag1], res.reuniao_id);
check("remarcar reserva o novo horário", nova.ok);
const conf = await confirmar(nova.reuniao_id, "ev2", res.reuniao_id);
check("remarcar devolve o evento antigo para apagar", conf.antiga_evento === "ev1" && !!conf.antiga_refresh);
check("antiga fica cancelada", (await um("select situacao from comercial.reunioes where id = $1", [res.reuniao_id])).situacao === "cancelada");
check("token de outro lead não remarca", (await reservar(outro.token, daqui(130), [ag1], nova.reuniao_id)).motivo === "token");
check("token de outro lead não cancela", (await um("select public.com_srv_agenda_cancelar($1, $2) r", [outro.token, nova.reuniao_id])).r.ok === false);
const can = (await um("select public.com_srv_agenda_cancelar($1, $2) r", [quem.token, nova.reuniao_id])).r;
check("cancelar devolve o evento", can.ok && can.evento === "ev2");
check("card volta para Qualificação", (await etapa(quem.id)) === "qualificacao");

console.log("\nLembretes");
const l = await lead("Duda Lead", "11988880004");
const rl = await reservar(l.token, daqui(50), [ag1]);
await confirmar(rl.reuniao_id, "ev3");
await db.query("update comercial.reunioes set inicio = now() + interval '23 hours', fim = now() + interval '23 hours 30 minutes', criado_em = now() - interval '3 days' where id = $1", [rl.reuniao_id]);
let p = (await um("select public.com_srv_lembretes_pegar() r")).r;
check("lembrete de 24 h sai", p.length === 1 && p[0].tipo === "h24", JSON.stringify(p));
check("não repete", (await um("select public.com_srv_lembretes_pegar() r")).r.length === 0);
await db.query("update comercial.reunioes set inicio = now() + interval '50 minutes', fim = now() + interval '80 minutes' where id = $1", [rl.reuniao_id]);
p = (await um("select public.com_srv_lembretes_pegar() r")).r;
check("lembrete de 1 h sai", p.length === 1 && p[0].tipo === "h1");
check("1 h não repete", (await um("select public.com_srv_lembretes_pegar() r")).r.length === 0);

console.log("\nDistribuição");
await db.exec("delete from comercial.reunioes");
const d1 = await lead("Eva Lead", "11988880005"), d2 = await lead("Fabi Lead", "11988880006");
const x1 = await reservar(d1.token, daqui(60), [ag1, ag2]);
const x2 = await reservar(d2.token, daqui(80), [ag1, ag2]);
check("rodízio alterna as agendas", x1.agenda_id !== x2.agenda_id, JSON.stringify([x1.agenda_id, x2.agenda_id]));
await db.exec("delete from comercial.reunioes; update comercial.config_agenda set distribuicao = 'primeiro_livre'");
const y1 = await reservar(d1.token, daqui(60), [ag1, ag2]);
const y2 = await reservar(d2.token, daqui(80), [ag1, ag2]);
check("primeiro livre usa sempre a primeira", y1.agenda_id === ag1 && y2.agenda_id === ag1);

console.log("\nHorários livres");
const cfg = { duracao_min: 30, intervalo_min: 15, antecedencia_min: 120, horario: { dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00" } };
const agora = new Date("2026-11-09T12:00:00.000Z"); // segunda, 09:00 em Brasília
const livres = gerarHorarios(cfg, [{ id: "a", ocupado: [] }], [], agora, 2);
check("primeiro horário respeita a antecedência", livres[0].inicio === "2026-11-09T14:15:00.000Z", livres[0]?.inicio);
const antes = livres.some((h) => h.inicio === "2026-11-10T13:30:00.000Z");
const ocupado = gerarHorarios(cfg, [{ id: "a", ocupado: [{ inicio: "2026-11-10T13:30:00Z", fim: "2026-11-10T14:00:00Z" }] }], [], agora, 2);
check("horário ocupado direto no Google some", antes && !ocupado.some((h) => h.inicio === "2026-11-10T13:30:00.000Z"));
check("agenda ocupada não tira o horário de outra livre", gerarHorarios(cfg, [{ id: "a", ocupado: [{ inicio: "2026-11-10T13:30:00Z", fim: "2026-11-10T14:00:00Z" }] }, { id: "b", ocupado: [] }], [], agora, 2).find((h) => h.inicio === "2026-11-10T13:30:00.000Z")?.agendas.join() === "b");
check("reunião marcada some", !gerarHorarios(cfg, [{ id: "a", ocupado: [] }], [{ agenda_id: "a", inicio: "2026-11-10T13:30:00Z", fim: "2026-11-10T14:00:00Z" }], agora, 2).some((h) => h.inicio === "2026-11-10T13:30:00.000Z"));
check("sem horário no fim de semana", gerarHorarios(cfg, [{ id: "a", ocupado: [] }], [], new Date("2026-11-07T12:00:00.000Z"), 2).length === 0);

console.log("\nEtapas do funil");
const etapasL = async () => (await um("select public.com_etapas() r")).r;
const nv = (await um("select public.com_etapa_salvar('{\"nome\":\"Teste técnico\"}'::jsonb) r")).r;
let et = await etapasL();
const pos = (ch) => et.findIndex((e) => e.id === ch);
check("nova etapa entra antes de Ganho e Perdido", pos(nv) === et.length - 3, JSON.stringify(et.map((e) => e.chave)));
const ordensUnicas = new Set(et.map((e) => e.ordem)).size === et.length;
check("ordens continuam sem repetir", ordensUnicas);
await db.query("select public.com_etapa_mover($1, -1)", [nv]);
const antesPos = pos(nv); et = await etapasL();
check("subir troca de posição", pos(nv) === antesPos - 1);
const ganho = et.find((e) => e.chave === "ganho").id;
let negGanho = false; try { await db.query("select public.com_etapa_mover($1, -1)", [ganho]); } catch { negGanho = true; }
check("Ganho não muda de posição", negGanho);
const fab = et.find((e) => e.chave === "qualificacao").id;
await db.query("select public.com_etapa_salvar($1::jsonb)", [JSON.stringify({ id: fab, nome: "Qualificar", cor: "info" })]);
et = await etapasL();
check("renomeia etapa de fábrica sem mudar a chave", et.find((e) => e.id === fab).nome === "Qualificar" && et.find((e) => e.id === fab).chave === "qualificacao");
let negFab = false; try { await db.query("select public.com_etapa_excluir($1)", [fab]); } catch { negFab = true; }
check("etapa de fábrica não exclui", negFab);
let negDup = false; try { await db.query("select public.com_etapa_salvar('{\"nome\":\"qualificar\"}'::jsonb)"); } catch { negDup = true; }
check("nome repetido é recusado", negDup);
await db.query("update comercial.negocios set etapa_id = $1 where id = $2", [nv, d1.id]);
let negUso = false; try { await db.query("select public.com_etapa_excluir($1)", [nv]); } catch { negUso = true; }
check("etapa com negócio não exclui", negUso);
await db.query("update comercial.negocios set etapa_id = $1 where id = $2", [fab, d1.id]);
await db.query("select public.com_etapa_excluir($1)", [nv]);
check("etapa vazia exclui", !(await etapasL()).some((e) => e.id === nv));

console.log("\nPermissões");
const priv = async (role, fn) => (await um("select has_function_privilege($1, $2, 'execute') p", [role, fn])).p;
check("anon não reserva", !(await priv("anon", "public.com_srv_agenda_reservar(text,timestamptz,uuid[],uuid)")));
check("authenticated não lê token", !(await priv("authenticated", "public.com_srv_agenda_contexto(text)")));
check("authenticated não lê agendas", !(await priv("authenticated", "public.com_srv_google_agendas()")));
check("anon não vê o painel", !(await priv("anon", "public.com_agenda_painel()")));
await db.exec("select set_config('test.super', '0', false)");
let negado = false;
try { await q("select public.com_agenda_painel()"); } catch { negado = true; }
check("painel exige super admin", negado);

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
