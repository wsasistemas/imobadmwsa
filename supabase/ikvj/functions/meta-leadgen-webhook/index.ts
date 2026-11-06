// meta-leadgen-webhook — recebe da Meta os leads do Lead Ads (Facebook e Instagram) das páginas conectadas.
// verify_jwt = false. Configurar no app da Meta: produto Webhooks, objeto "page", campo "leadgen",
// URL = <SUPABASE_URL>/functions/v1/meta-leadgen-webhook e verify token = secret ADM_META_VERIFY_TOKEN.
//   GET  hub.mode=subscribe & hub.verify_token → devolve hub.challenge
//   POST confere X-Hub-Signature-256 (HMAC do corpo com ADM_META_APP_SECRET) → para cada leadgen_id: lê o lead
//        com o token da página (Vault) e chama comercial.receber_lead (idempotente pelo leadgen_id).
// Responde 200 quando processou (ou quando o erro não se resolve sozinho, como token vencido: isso vai para a
// conexão em token_valido/detalhe). Erro passageiro → 500, e a Meta reenvia; a entrada não duplica o lead.
import { admin } from "../_shared/asaas.ts";
import { appMeta, hex, hmac, iguaisBytes, lerLead, tokenPerdido } from "../_shared/meta.ts";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const texto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const ok = () => new Response("ok", { status: 200 });

interface Mudanca { field?: string; value?: { leadgen_id?: string; page_id?: string; form_id?: string } }

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const verify = env("ADM_META_VERIFY_TOKEN");
    if (verify && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verify) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  const app = appMeta();
  if (!app) { console.error("[meta-leadgen] sem ADM_META_APP_ID/SECRET"); return new Response("não configurado", { status: 500 }); }

  const bruto = new Uint8Array(await req.arrayBuffer());
  const assinatura = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  const esperado = hex(await hmac(app.appSecret, bruto));
  if (!assinatura || !iguaisBytes(new TextEncoder().encode(assinatura), new TextEncoder().encode(esperado))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  let corpo: { object?: string; entry?: { id?: string; changes?: Mudanca[] }[] };
  try { corpo = JSON.parse(new TextDecoder().decode(bruto)); } catch { return ok(); }
  if (corpo.object !== "page") return ok();

  const db = admin();
  let repetir = false; // erro passageiro → 500 para a Meta reenviar (a entrada é idempotente pelo leadgen_id)
  for (const entrada of corpo.entry ?? []) {
    for (const m of entrada.changes ?? []) {
      if (m.field !== "leadgen" || !m.value?.leadgen_id) continue;
      const { leadgen_id, form_id } = m.value;
      const pageId = m.value.page_id ?? entrada.id ?? "";
      try {
        const { data: info } = await db.rpc("com_srv_meta_por_pagina", { p_page_id: pageId, p_form_id: form_id ?? "" });
        const c = info as { conexao_id: string; token: string | null; form_ativo: boolean; sistema: string | null; fonte_id: string | null } | null;
        if (!c?.token) { console.warn("[meta-leadgen] página não conectada", pageId); continue; }
        if (!c.form_ativo) { console.log("[meta-leadgen] formulário desligado", form_id); continue; }
        const lead = await lerLead(app, leadgen_id, c.token);
        if (c.sistema) lead.dados.sistema = c.sistema;
        lead.dados.formulario = form_id ?? "lead ads";
        const { data: r, error } = await db.rpc("com_srv_receber_lead", {
          p_origem: lead.plataforma, p_dados: lead.dados, p_fonte_id: c.fonte_id, p_id_externo: `leadgen:${leadgen_id}`, p_ip_hash: null,
        });
        if (error) throw new Error(error.message);
        if (!(r as { evento_repetido?: boolean })?.evento_repetido) await db.rpc("com_srv_meta_lead_recebido", { p_conexao: c.conexao_id, p_form_id: form_id ?? "" });
        console.log("[meta-leadgen]", leadgen_id, lead.plataforma, JSON.stringify(r));
      } catch (e) {
        console.error("[meta-leadgen] falhou", leadgen_id, texto(e));
        if (!tokenPerdido(e)) repetir = true;
        if (tokenPerdido(e)) {
          const { data: info } = await db.rpc("com_srv_meta_por_pagina", { p_page_id: pageId, p_form_id: "" });
          const id = (info as { conexao_id?: string } | null)?.conexao_id;
          if (id) await db.rpc("com_srv_meta_conexao_situacao", { p_conexao: id, p_valido: false, p_detalhe: `Lead ${leadgen_id} não lido: ${texto(e)}` });
        }
      }
    }
  }
  return repetir ? new Response("tentar de novo", { status: 500 }) : ok();
});
