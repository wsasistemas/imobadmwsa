// adm-asaas-registrar-webhook — cadastra (ou atualiza) na conta Asaas da WSA o webhook que aponta
// para adm-asaas-webhook, com o authToken = secret ADM_ASAAS_WEBHOOK_TOKEN. Só o super admin.
import { asaasConfig, asaasFetch, cors, erroAsaas, exigirSuperAdmin, json } from "../_shared/asaas.ts";

const NOME = "ImobAdm WSA - mensalidades";
const EVENTOS = [
  "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE",
  "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;
  const token = Deno.env.get("ADM_ASAAS_WEBHOOK_TOKEN") ?? "";
  if (!asaasConfig().apiKey) return json({ ok: false, erro: "Cadastre o secret ADM_ASAAS_API_KEY." }, 500);
  if (token.length < 32) return json({ ok: false, erro: "Cadastre o secret ADM_ASAAS_WEBHOOK_TOKEN (32+ caracteres)." }, 500);

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/adm-asaas-webhook`;
  const lista = await asaasFetch("/webhooks?limit=100");
  if (!lista.ok) return json({ ok: false, erro: `Listar webhooks: ${erroAsaas(lista)}` }, 502);
  const existente = ((lista.body as { data?: Array<{ id: string; url: string; name?: string }> }).data ?? [])
    .find((w) => w.url === url || w.name === NOME);

  const payload = {
    name: NOME, url, email: quem.email ?? undefined, enabled: true, interrupted: false,
    authToken: token, sendType: "SEQUENTIALLY", events: EVENTOS, apiVersion: 3,
  };
  const r = existente
    ? await asaasFetch(`/webhooks/${existente.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await asaasFetch("/webhooks", { method: "POST", body: JSON.stringify(payload) });
  if (!r.ok) return json({ ok: false, erro: erroAsaas(r) }, 502);

  return json({
    ok: true, acao: existente ? "atualizado" : "criado",
    webhook_id: existente?.id ?? (r.body as { id?: string }).id, url, ambiente: asaasConfig().env,
  });
});
