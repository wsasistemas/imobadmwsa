// leads-entrada — entrada de leads dos sites e landing pages da WSA (substitui o insert direto em public.leads).
// Sem JWT (verify_jwt = false): o site é público. Proteções:
//   - chave da fonte (header x-wsa-chave ou body.chave), conferida pelo hash (comercial.fontes.chave_hash) → 401;
//   - Cloudflare Turnstile obrigatório quando o secret ADM_TURNSTILE_SECRET existe → 401;
//   - campo isca `website` preenchido = robô → responde ok e não grava;
//   - limite de 5 envios por IP em 10 minutos → 429;
//   - idempotência por body.id_envio (o mesmo envio repetido não duplica).
// Body: { chave?, turnstile?, id_envio?, nome, email, telefone|whatsapp, empresa?, sistema?, mensagem?, consentimento?, campanha?, formulario? }
import { admin, cors as corsBase, json as jsonBase } from "../_shared/asaas.ts";

const cors = { ...corsBase, "Access-Control-Allow-Headers": `${corsBase["Access-Control-Allow-Headers"]}, x-wsa-chave` };
const json = (b: unknown, s = 200) => {
  const r = jsonBase(b, s);
  r.headers.set("Access-Control-Allow-Headers", cors["Access-Control-Allow-Headers"]);
  return r;
};

async function sha256(texto: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CAMPOS = ["nome", "email", "telefone", "whatsapp", "empresa", "cargo", "sistema", "mensagem", "consentimento", "campanha", "formulario"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido." }, 400); }

  // Robô preencheu o campo escondido: finge que deu certo.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true });

  const db = admin();
  const chave = String(req.headers.get("x-wsa-chave") ?? body.chave ?? "").trim();
  if (!chave) return json({ ok: false, erro: "Chave do site ausente." }, 401);
  const { data: fonte } = await db.rpc("com_srv_fonte_por_chave", { p_hash: await sha256(chave) });
  if (!fonte) return json({ ok: false, erro: "Chave do site inválida." }, 401);

  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const turnstileSecret = (Deno.env.get("ADM_TURNSTILE_SECRET") ?? "").trim();
  if (turnstileSecret) {
    const token = String(body.turnstile ?? "");
    if (!token) return json({ ok: false, erro: "Confirme que você não é um robô." }, 401);
    const form = new FormData();
    form.append("secret", turnstileSecret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
      .then((r) => r.json()).catch(() => ({ success: false }));
    if (!v.success) return json({ ok: false, erro: "Confirme que você não é um robô." }, 401);
  }

  const ipHash = ip ? await sha256(`wsa-leads:${ip}`) : null;
  if (ipHash) {
    const { data: n } = await db.rpc("com_srv_leads_do_ip", { p_ip_hash: ipHash, p_minutos: 10 });
    if (Number(n) >= 5) return json({ ok: false, erro: "Muitos envios seguidos. Tente de novo em alguns minutos." }, 429);
  }

  const dados: Record<string, unknown> = {};
  for (const k of CAMPOS) {
    const v = body[k];
    if (typeof v === "string") dados[k] = v.slice(0, 2000);
    else if (typeof v === "boolean") dados[k] = v;
  }
  if (!dados.formulario) dados.formulario = (fonte as { dominio?: string }).dominio ?? "site";
  const idEnvio = typeof body.id_envio === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.id_envio) ? `site:${body.id_envio}` : null;

  const { data, error } = await db.rpc("com_srv_receber_lead", {
    p_origem: "site", p_dados: dados, p_fonte_id: (fonte as { id: string }).id, p_id_externo: idEnvio, p_ip_hash: ipHash,
  });
  if (error) {
    console.error("[leads-entrada] erro", error.message);
    return json({ ok: false, erro: "Não foi possível registrar agora. Tente de novo." }, 500);
  }
  if ((data as { ok?: boolean })?.ok === false) return json({ ok: false, erro: (data as { erro?: string }).erro }, 400);
  return json({ ok: true });
});
