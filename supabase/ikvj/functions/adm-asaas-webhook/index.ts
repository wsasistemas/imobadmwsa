// adm-asaas-webhook — recebe os eventos do Asaas da conta da WSA (mensalidades das empresas).
// Sem JWT (verify_jwt = false): a autenticação é o header `asaas-access-token`, OBRIGATÓRIO.
// Toda a regra fica no banco (public.adm_srv_asaas_evento, idempotente pelo id do evento).
import { admin, cors, iguais, json } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const esperado = Deno.env.get("ADM_ASAAS_WEBHOOK_TOKEN") ?? "";
  if (esperado.length < 32) {
    console.error("[adm-asaas-webhook] ADM_ASAAS_WEBHOOK_TOKEN ausente ou curto");
    return json({ ok: false, erro: "Webhook não configurado." }, 500);
  }
  if (!iguais(req.headers.get("asaas-access-token") ?? "", esperado)) {
    return json({ ok: false, erro: "forbidden" }, 403);
  }

  let body: { id?: string; event?: string; dateCreated?: string; payment?: { id?: string; status?: string } };
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido." }, 400); }
  if (!body?.event) return json({ ok: true, ignorado: "sem evento" });

  const id = body.id ?? `${body.event}:${body.payment?.id ?? "-"}:${body.payment?.status ?? "-"}:${body.dateCreated ?? "-"}`;
  const { data, error } = await admin().rpc("adm_srv_asaas_evento", { p_id: id, p_evento: body.event, p_payload: body });
  if (error) {
    console.error("[adm-asaas-webhook] erro ao processar", body.event, body.payment?.id, error.message);
    return json({ ok: false, erro: "Falha ao processar." }, 500); // o Asaas tenta de novo
  }
  console.log("[adm-asaas-webhook]", body.event, body.payment?.id, JSON.stringify(data));
  return json(data);
});
