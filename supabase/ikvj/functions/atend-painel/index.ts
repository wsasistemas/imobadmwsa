// atend-painel — ações do painel do Atendimento ONLINE que falam com o OpeWA. Só o super admin.
// acao: "situacao" (sessão e configuração) · "conectar_webhook" (cria/atualiza o webhook assinado) ·
//       "enviar" (consultor responde pelo painel; pausa a Sophia) · "teste" (mensagem de teste para um número).
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";
import { chatDe, enviarTexto, opewaConfigurado, registrarWebhook, situacaoSessao } from "../_shared/opewa.ts";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;
  const corpo = await req.json().catch(() => ({}));
  const db = admin();
  const webhookUrl = `${env("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/atend-webhook`;

  if (!opewaConfigurado()) {
    return json({ ok: corpo.acao === "situacao", configurado: false, webhook_url: webhookUrl, erro: "Cadastre os secrets ADM_OPEWA_URL, ADM_OPEWA_API_KEY e ADM_OPEWA_SESSAO." }, corpo.acao === "situacao" ? 200 : 409);
  }

  switch (corpo.acao) {
    case "situacao": {
      const s = await situacaoSessao();
      return json({ ok: true, configurado: true, webhook_url: webhookUrl, sessao: s });
    }
    case "conectar_webhook": {
      const segredo = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      const { data: idAtual } = await db.rpc("com_srv_atend_webhook_id");
      const r = await registrarWebhook(webhookUrl, segredo, (idAtual as string | null) ?? null);
      if (!r.ok) return json({ ok: false, erro: `O OpeWA recusou o webhook: ${r.erro}` }, 502);
      const g = await db.rpc("com_srv_atend_webhook_gravar", { p_segredo: segredo, p_webhook_id: r.id });
      if (g.error) return json({ ok: false, erro: "Webhook criado, mas não foi possível guardar o segredo." }, 500);
      return json({ ok: true, webhook_id: r.id });
    }
    case "enviar": {
      const conversa = String(corpo.conversa_id ?? ""), texto = String(corpo.texto ?? "").trim().slice(0, 4000);
      if (!UUID.test(conversa) || !texto) return json({ ok: false, erro: "Escreva a mensagem." }, 400);
      const { data: chat } = await db.rpc("com_srv_atend_destino", { p_conversa: conversa });
      if (!chat) return json({ ok: false, erro: "Conversa não encontrada ou o lead pediu para sair." }, 409);
      const r = await enviarTexto(String(chat), texto);
      if (!r.ok) return json({ ok: false, erro: `Não saiu pelo WhatsApp: ${r.erro}` }, 502);
      await db.rpc("com_srv_atend_registrar", { p_conversa: conversa, p_autor: "consultor", p_texto: texto, p_wa_id: r.id });
      return json({ ok: true });
    }
    case "teste": {
      const fone = String(corpo.telefone ?? "").replace(/\D/g, "");
      if (fone.length < 12 || fone.length > 13) return json({ ok: false, erro: "Telefone com 55 + DDD + número." }, 400);
      const r = await enviarTexto(chatDe(fone), "✅ Teste do Atendimento ONLINE da WSA Sistemas IA. Se chegou, o envio está funcionando.");
      return r.ok ? json({ ok: true }) : json({ ok: false, erro: `Não saiu: ${r.erro}` }, 502);
    }
    default:
      return json({ ok: false, erro: "Ação inválida." }, 400);
  }
});
