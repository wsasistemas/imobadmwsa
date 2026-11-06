// adm-asaas-assinatura — cria ou atualiza o cliente e a assinatura mensal da empresa no Asaas.
// Só o super admin. Body: { empresa_id: string, acao?: "sincronizar" | "cancelar" }
// Uma assinatura por empresa, valor = soma dos vínculos ativos, billingType UNDEFINED (o cliente escolhe
// boleto, PIX ou cartão). As notificações do próprio Asaas ficam desligadas: os avisos são da régua.
import { admin, asaasConfig, asaasFetch, cors, erroAsaas, exigirSuperAdmin, json } from "../_shared/asaas.ts";

interface Cobranca {
  id: string; nome: string; cpf_cnpj: string | null; email: string | null; whatsapp: string | null;
  modalidade: string; valor: number; proximo_vencimento: string;
  asaas_customer_id: string | null; asaas_subscription_id: string | null; descricao: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;
  if (!asaasConfig().apiKey) return json({ ok: false, erro: "Cadastre o secret ADM_ASAAS_API_KEY no Supabase." }, 500);

  let body: { empresa_id?: string; acao?: string };
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido." }, 400); }
  if (!body.empresa_id) return json({ ok: false, erro: "empresa_id obrigatório." }, 400);

  const db = admin();
  const { data, error } = await db.rpc("adm_srv_empresa_cobranca", { p_empresa: body.empresa_id });
  if (error || !data) return json({ ok: false, erro: error?.message ?? "Empresa não encontrada." }, 404);
  const e = data as Cobranca;

  // Cancelar a assinatura (empresa cancelada)
  if (body.acao === "cancelar") {
    if (!e.asaas_subscription_id) return json({ ok: true, acao: "nada a cancelar" });
    const r = await asaasFetch(`/subscriptions/${e.asaas_subscription_id}`, { method: "DELETE" });
    if (!r.ok) return json({ ok: false, erro: erroAsaas(r) }, 502);
    return json({ ok: true, acao: "cancelada", subscription: e.asaas_subscription_id });
  }

  if (e.modalidade !== "pagante") return json({ ok: false, erro: `Empresa em ${e.modalidade}: não gera assinatura.` }, 400);
  if (!e.cpf_cnpj) return json({ ok: false, erro: "Preencha o CPF ou CNPJ da empresa antes de gerar a cobrança." }, 400);
  if (!(Number(e.valor) > 0)) return json({ ok: false, erro: "Vincule ao menos um sistema com valor mensal." }, 400);

  // 1. Cliente
  let customer = e.asaas_customer_id;
  if (!customer) {
    const achou = await asaasFetch(`/customers?cpfCnpj=${e.cpf_cnpj}&limit=1`);
    const lista = (achou.body as { data?: Array<{ id: string }> })?.data;
    if (achou.ok && lista?.length) customer = lista[0].id;
  }
  if (!customer) {
    const criou = await asaasFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: e.nome, cpfCnpj: e.cpf_cnpj, email: e.email ?? undefined,
        mobilePhone: e.whatsapp ? e.whatsapp.replace(/^55/, "") : undefined,
        externalReference: e.id, notificationDisabled: true,
      }),
    });
    if (!criou.ok) return json({ ok: false, erro: `Cliente: ${erroAsaas(criou)}` }, 502);
    customer = (criou.body as { id?: string }).id ?? null;
    if (!customer) return json({ ok: false, erro: "Asaas não devolveu o id do cliente." }, 502);
  }

  // 2. Assinatura
  let subscription = e.asaas_subscription_id;
  if (!subscription) {
    const r = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer, billingType: "UNDEFINED", cycle: "MONTHLY", value: Number(e.valor),
        nextDueDate: e.proximo_vencimento, description: e.descricao, externalReference: e.id,
      }),
    });
    if (!r.ok) return json({ ok: false, erro: `Assinatura: ${erroAsaas(r)}` }, 502);
    subscription = (r.body as { id?: string }).id ?? null;
    if (!subscription) return json({ ok: false, erro: "Asaas não devolveu o id da assinatura." }, 502);
  } else {
    const r = await asaasFetch(`/subscriptions/${subscription}`, {
      method: "PUT",
      body: JSON.stringify({ value: Number(e.valor), description: e.descricao, updatePendingPayments: true }),
    });
    if (!r.ok) return json({ ok: false, erro: `Atualizar assinatura: ${erroAsaas(r)}` }, 502);
  }

  const g = await db.rpc("adm_srv_gravar_asaas", {
    p_empresa: e.id, p_customer: customer, p_subscription: subscription, p_autor: quem.userId,
  });
  if (g.error) return json({ ok: false, erro: g.error.message }, 500);

  return json({ ok: true, customer, subscription, valor: e.valor, proximo_vencimento: e.proximo_vencimento, ambiente: asaasConfig().env });
});
