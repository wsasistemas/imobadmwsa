// Teste da Fase 2 (webhook Asaas → adm.faturas → situação) num Postgres local (PGlite). Não toca no ikvj.
// Rodar (numa pasta temporária com `npm i @electric-sql/pglite@0.3.14`):
//   node <repo>/supabase/ikvj/tests/fase2.test.mjs <repo>/supabase/ikvj/migrations
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
    controle_ativo boolean not null default false, ultima_verificacao_em timestamptz);
  create function acessos.sou_super_admin() returns boolean language sql stable as $$ select current_setting('test.super', true) = '1' $$;
  create schema imobdoces;
  create function imobdoces.membro_da_loja(p text) returns boolean language sql stable as $$ select false $$;
  insert into acessos.aplicativos (schema_name, nome) values ('imobdoces', 'ImobDoces'), ('imobsystem', 'ImobSystem');
  select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.super', '1', false);
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migration aplicada:", f);
}

const emp = (await um(`select public.adm_salvar_empresa('{"razao_social":"Doces da Vila","cnpj":"12345678000190","dia_vencimento":10,"email_financeiro":"Fin@Vila.com"}'::jsonb) id`)).id;
await q(`select public.adm_salvar_vinculo($1::jsonb)`, [JSON.stringify({ empresa_id: emp, app: "imobdoces", schema_ref: "loja_vila", valor_mensal: 200 })]);
await q(`select public.adm_salvar_vinculo($1::jsonb)`, [JSON.stringify({ empresa_id: emp, app: "imobsystem", tenant_ref: "t-1", valor_mensal: 80 })]);

console.log("\nDados para o Asaas");
const cob = (await um("select public.adm_srv_empresa_cobranca($1) c", [emp])).c;
check("valor = soma dos vínculos ativos (280)", Number(cob.valor) === 280, JSON.stringify(cob));
check("próximo vencimento no dia 10 e no futuro", cob.proximo_vencimento.endsWith("-10") && new Date(cob.proximo_vencimento) > new Date(), cob.proximo_vencimento);
check("e-mail normalizado em minúsculas", cob.email === "fin@vila.com");
await q("select public.adm_srv_gravar_asaas($1, 'cus_1', 'sub_1')", [emp]);
check("ids do Asaas gravados", (await um("select asaas_subscription_id s from adm.empresas where id=$1", [emp])).s === "sub_1");

console.log("\nWebhook");
const evento = async (id, ev, payment) =>
  (await um("select public.adm_srv_asaas_evento($1, $2, $3::jsonb) r", [id, ev, JSON.stringify({ id, event: ev, payment })])).r;
const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
const pay = { id: "pay_1", customer: "cus_1", subscription: "sub_1", value: 280, billingType: "UNDEFINED", status: "PENDING", dueDate: d(12), invoiceUrl: "https://asaas/i/pay_1" };

let r = await evento("evt_1", "PAYMENT_CREATED", pay);
check("PAYMENT_CREATED cria a fatura e acha a empresa pela assinatura", r.fatura && r.empresa === emp, JSON.stringify(r));
check("fatura vencida há 12 dias → empresa suspensa", r.situacao_empresa === "suspensa", JSON.stringify(r));
check("invoice_url guardado", (await um("select invoice_url u from adm.faturas where asaas_payment_id='pay_1'")).u === "https://asaas/i/pay_1");

r = await evento("evt_1", "PAYMENT_CREATED", pay);
check("mesmo evento de novo → ignorado (idempotente)", r.repetido === true);
check("não duplicou a fatura", (await um("select count(*)::int c from adm.faturas")).c === 1);

r = await evento("evt_2", "PAYMENT_RECEIVED", { ...pay, status: "RECEIVED", billingType: "PIX", paymentDate: d(0) });
check("PAYMENT_RECEIVED → fatura paga e empresa reativada na hora", r.situacao_empresa === "em_dia", JSON.stringify(r));
check("forma de pagamento gravada (pix)", (await um("select forma from adm.faturas where asaas_payment_id='pay_1'")).forma === "pix");

r = await evento("evt_3", "PAYMENT_REFUNDED", { ...pay, status: "REFUNDED" });
check("estorno reabre a dívida → suspensa de novo", r.situacao_empresa === "suspensa", JSON.stringify(r));

r = await evento("evt_4", "PAYMENT_CONFIRMED", { ...pay, status: "CONFIRMED", billingType: "CREDIT_CARD", confirmedDate: d(0) });
check("PAYMENT_CONFIRMED (cartão) → em dia", r.situacao_empresa === "em_dia");

r = await evento("evt_5", "PAYMENT_CREATED", { ...pay, id: "pay_2", dueDate: d(-20) });
check("fatura futura → continua em dia", r.situacao_empresa === "em_dia");
r = await evento("evt_6", "PAYMENT_UPDATED", { ...pay, id: "pay_2", dueDate: d(-25), value: 300 });
check("PAYMENT_UPDATED atualiza valor e vencimento", Number((await um("select valor from adm.faturas where asaas_payment_id='pay_2'")).valor) === 300);
r = await evento("evt_7", "PAYMENT_DELETED", { ...pay, id: "pay_2" });
check("PAYMENT_DELETED → fatura cancelada", (await um("select situacao from adm.faturas where asaas_payment_id='pay_2'")).situacao === "cancelada");

r = await evento("evt_8", "PAYMENT_CREATED", { ...pay, id: "pay_x", subscription: "sub_outra", customer: "cus_outro", externalReference: null });
check("payment de empresa desconhecida → ignorado e registrado", r.ignorado === "empresa não encontrada" &&
  (await um("select erro from adm.asaas_eventos where id='evt_8'")).erro === "empresa não encontrada");
r = await evento("evt_9", "PAYMENT_CREATED", { ...pay, id: "pay_3", subscription: null, customer: null, externalReference: emp, dueDate: d(-5) });
check("acha a empresa pelo externalReference", r.empresa === emp);

check("histórico com os eventos do Asaas", (await um("select count(*)::int c from adm.eventos where tipo='asaas' and empresa_id=$1", [emp])).c === 8);

console.log("\nSegurança");
const priv = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'adm\\_srv\\_%'`);
check("funções adm_srv_* da Fase 2 existem", ["adm_srv_asaas_evento", "adm_srv_empresa_cobranca", "adm_srv_gravar_asaas"].every((n) => priv.some((x) => x.proname === n)), JSON.stringify(priv));
check("nem anon nem authenticated executam adm_srv_*", priv.every((x) => !x.a && !x.n), JSON.stringify(priv));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
