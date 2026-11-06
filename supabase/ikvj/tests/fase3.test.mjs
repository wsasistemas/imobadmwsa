// Teste da Fase 3 (régua de avisos) num Postgres local (PGlite). Não toca no ikvj.
// Rodar (numa pasta temporária com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase3.test.mjs <repo>/supabase/ikvj/migrations
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
  create schema imobpesagens;
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces;
  create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select false $$;
  insert into acessos.aplicativos (schema_name, nome) values ('imobdoces', 'ImobDoces'), ('imobsystem', 'ImobSystem');
  -- Vault e pgcrypto simulados
  create schema extensions;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
  create schema vault;
  create table vault.secrets (name text primary key, secret text not null, description text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets values (n, s, d); select gen_random_uuid() $$;
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migration aplicada:", f);
}

const hoje = (await um("select adm.hoje() d")).d;
const dia = (n) => { const x = new Date(hoje); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const novaEmpresa = async (nome, extra = {}) => {
  const id = (await um("select public.adm_salvar_empresa($1::jsonb) id", [JSON.stringify({ razao_social: nome, whatsapp: "5511999990000", email_financeiro: "fin@x.com", ...extra })])).id;
  await q("select public.adm_salvar_vinculo($1::jsonb)", [JSON.stringify({ empresa_id: id, app: "imobsystem", tenant_ref: `t-${nome}`, valor_mensal: 100 })]);
  return id;
};
const fatura = async (emp, venc) => (await um(
  "insert into adm.faturas (empresa_id, competencia, vencimento, valor, invoice_url) values ($1, date_trunc('month', $2::date)::date, $2::date, 100, 'https://asaas/i/x') returning id",
  [emp, venc])).id;
const pend = async (data) => q("select * from adm.avisos_pendentes($1::date)", [data ?? null]);

console.log("\nChave do cron");
check("chave criada no Vault", (await um("select count(*)::int c from vault.secrets where name='adm_regua_cron'")).c === 1);
const chave = (await um("select adm.cron_chave() k")).k;
check("chave com 64 caracteres", chave?.length === 64);
check("chave certa aceita", (await um("select public.adm_srv_cron_chave_ok($1) r", [chave])).r === true);
check("chave errada recusada", (await um("select public.adm_srv_cron_chave_ok('x') r")).r === false);
check("chave vazia recusada", (await um("select public.adm_srv_cron_chave_ok(null) r")).r === false);

console.log("\nPassos devidos");
const a = await novaEmpresa("Alfa");
const fA = await fatura(a, dia(3));      // vence daqui a 3 dias → d-3
let p = (await pend()).filter((x) => x.fatura_id === fA);
check("D-3: WhatsApp e e-mail", p.length === 2 && p.every((x) => x.passo === "d-3"), JSON.stringify(p));
check("traz nome, valor, link e destino", p[0].nome === "Alfa" && Number(p[0].valor) === 100 && p[0].invoice_url && p[0].destino);

const b = await novaEmpresa("Beta");
const fB = await fatura(b, dia(-1));     // venceu ontem → d+1
p = (await pend()).filter((x) => x.fatura_id === fB);
check("D+1: só WhatsApp", p.length === 1 && p[0].passo === "d+1" && p[0].canal === "whatsapp", JSON.stringify(p));

p = (await pend(dia(2))).filter((x) => x.fatura_id === fB);   // 3 dias de atraso: ainda na janela do d+1
check("cron falhou: D+1 sai até 2 dias depois", p.length === 1 && p[0].passo === "d+1");
p = (await pend(dia(4))).filter((x) => x.fatura_id === fB);   // 5 dias: já é d+5
check("passo seguinte substitui o anterior (5 dias → d+5)", p.length === 1 && p[0].passo === "d+5", JSON.stringify(p));
p = (await pend(dia(7))).filter((x) => x.fatura_id === fB);   // 8 dias
check("D+8: WhatsApp e e-mail, com data da suspensão", p.length === 2 && p[0].passo === "d+8" && new Date(p[0].suspende_em).toISOString().slice(0, 10) === dia(10), JSON.stringify(p[0]));
p = (await pend(dia(10))).filter((x) => x.fatura_id === fB);  // 11 dias: d+11 está desligado por padrão
check("D+11 desligado por padrão → nada", p.length === 0, JSON.stringify(p));
p = (await pend(dia(1))).filter((x) => x.fatura_id === fB);   // 2 dias de atraso
check("dia sem passo novo (2 dias) → ainda d+1, não outro", p.length === 1 && p[0].passo === "d+1");

console.log("\nSem duplicar");
check("reserva: 1ª vez consegue", (await um("select public.adm_srv_reservar_aviso($1,'d+1','whatsapp') r", [fB])).r === true);
check("reserva: 2ª vez (execução paralela) não consegue", (await um("select public.adm_srv_reservar_aviso($1,'d+1','whatsapp') r", [fB])).r === false);
check("reservado sai da lista", (await pend()).filter((x) => x.fatura_id === fB).length === 0);
await q("select public.adm_srv_resultado_aviso($1,'d+1','whatsapp',true,'{\"id\":\"wamid.1\"}'::jsonb)", [fB]);
check("rodar de novo no mesmo dia → nada", (await pend()).filter((x) => x.fatura_id === fB).length === 0);
const av = await um("select resultado from adm.avisos_enviados where fatura_id=$1", [fB]);
check("resultado gravado como enviado", av.resultado.estado === "enviado" && av.resultado.id === "wamid.1");
check("evento 'aviso' registrado", (await um("select count(*)::int c from adm.eventos where tipo='aviso' and fatura_id=$1", [fB])).c === 1);

await q("select public.adm_srv_reservar_aviso($1,'d-3','email')", [fA]);
await q("select public.adm_srv_resultado_aviso($1,'d-3','email',false,'{\"erro\":\"sem RESEND\"}'::jsonb)", [fA]);
p = (await pend()).filter((x) => x.fatura_id === fA);
check("falha libera para tentar de novo", p.some((x) => x.canal === "email"), JSON.stringify(p));
check("falha também vira evento com o erro", (await um("select detalhe from adm.eventos where tipo='aviso' and fatura_id=$1", [fA])).detalhe.erro === "sem RESEND");

console.log("\nQuem não recebe");
const c = await novaEmpresa("Gama", { modalidade: "cortesia" });
await fatura(c, dia(-1));
check("cortesia não recebe aviso", (await pend()).every((x) => x.empresa_id !== c));
const d0 = await novaEmpresa("Delta", { whatsapp: null });
await fatura(d0, dia(-1));
check("sem WhatsApp cadastrado → não entra na lista", (await pend()).every((x) => x.empresa_id !== d0));
const e = await novaEmpresa("Epsilon");
const fE = await fatura(e, dia(-1));
await q("update adm.faturas set situacao='paga', pago_em=now() where id=$1", [fE]);
check("fatura paga não recebe aviso", (await pend()).every((x) => x.fatura_id !== fE));
const g = await novaEmpresa("Zeta");
await fatura(g, dia(-5));
await q("select public.adm_conceder_prazo($1, $2::date, 'combinado')", [g, dia(5)]);
check("prazo extra vigente → sem cobrança de atraso", (await pend()).every((x) => x.empresa_id !== g));

console.log("\nSuspensão no 11º dia");
const s = await novaEmpresa("Suspensa");
await fatura(s, dia(-11));
const rr = (await um("select adm.processar_regua() r")).r;
check("processar_regua roda", rr.empresas >= 1, JSON.stringify(rr));
check("11 dias de atraso → suspensa", (await um("select situacao from adm.empresas where id=$1", [s])).situacao === "suspensa");
check("evento de situação gravado", (await um("select count(*)::int c from adm.eventos where empresa_id=$1 and tipo='situacao' and detalhe->>'para'='suspensa'", [s])).c === 1);
const s10 = await novaEmpresa("DezDias");
await fatura(s10, dia(-10));
await q("select adm.processar_regua()");
check("10 dias de atraso → ainda atraso (não suspende)", (await um("select situacao from adm.empresas where id=$1", [s10])).situacao === "atraso");

console.log("\nPainel");
const h = await um("select public.adm_avisos($1) h", [b]);
check("histórico de avisos da empresa", h.h.length === 1 && h.h[0].passo === "d+1");
await q("select set_config('test.super', '0', false)");
let negou = false;
try { await q("select public.adm_avisos($1)", [b]); } catch { negou = true; }
check("histórico só para o super admin", negou);

console.log("\nSistemas novos");
await q("select set_config('test.super', '1', false)");
const disp = await q("select * from public.adm_schemas_disponiveis()");
check("schema fora da Central aparece como disponível", disp.some((x) => x.schema_name === "imobpesagens"), JSON.stringify(disp));
check("sistema já cadastrado não aparece", disp.every((x) => x.schema_name !== "imobdoces"));
await q("select public.adm_adicionar_sistema('imobpesagens', 'ImobPesagens', null, 'schema', 'um cliente por schema')");
check("entra na Central com o controle desligado", (await um("select controle_ativo c from acessos.aplicativos where schema_name='imobpesagens'")).c === false);
check("entra em adm.sistemas", (await um("select count(*)::int c from adm.sistemas where app='imobpesagens'")).c === 1);
let semSchema = false;
try { await q("select public.adm_adicionar_sistema('nao_existe', 'X', null, 'schema', null)"); } catch { semSchema = true; }
check("schema inexistente é recusado", semSchema);

console.log("\nEmpresas do sistema");
const doSis = await q("select * from public.adm_empresas_do_sistema('imobsystem', null)");
check("lista as empresas vinculadas ao sistema", doSis.length >= 5 && doSis.every((x) => x.tenant_ref), String(doSis.length));
check("traz situação e acesso de cada uma", doSis.some((x) => x.situacao === "suspensa" && x.liberado === false));
check("busca pelo nome", (await q("select * from public.adm_empresas_do_sistema('imobsystem', 'Alfa')")).length === 1);

console.log("\nSegurança");
const priv = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where (s.nspname = 'public' and p.proname like 'adm\\_srv\\_%') or (s.nspname = 'adm' and p.proname in ('cron_chave', 'avisos_pendentes'))`);
check("chave do cron e funções de envio fechadas para anon e authenticated", priv.length >= 6 && priv.every((x) => !x.a && !x.n), JSON.stringify(priv));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
