// OpeWA (gateway de WhatsApp da WSA): envio de texto e consultas da sessão do Atendimento ONLINE.
// Secrets: ADM_OPEWA_URL (endereço público terminando em /api), ADM_OPEWA_API_KEY, ADM_OPEWA_SESSAO.

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export function opewaConfigurado(): boolean {
  return !!(env("ADM_OPEWA_URL") && env("ADM_OPEWA_API_KEY") && env("ADM_OPEWA_SESSAO"));
}

export const sessaoOpewa = () => env("ADM_OPEWA_SESSAO");

function base(): string {
  let u = env("ADM_OPEWA_URL").replace(/\/+$/, "");
  if (!/\/api$/.test(u)) u += "/api";
  return u;
}

export async function opewa(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(`${base()}${caminho}`, {
      method: init.method ?? "GET", signal: ctl.signal,
      headers: { "X-API-Key": env("ADM_OPEWA_API_KEY"), "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const dados = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, dados };
  } catch (e) {
    return { ok: false, status: 0, dados: { message: e instanceof Error && e.name === "AbortError" ? "O OpeWA não respondeu a tempo." : "Não foi possível falar com o OpeWA." } };
  } finally {
    clearTimeout(t);
  }
}

const erroDe = (r: { status: number; dados: Record<string, unknown> }) => {
  const m = r.dados?.message;
  return `${Array.isArray(m) ? m.join("; ") : String(m ?? "erro")} (${r.status})`.slice(0, 300);
};

/** Telefone (só dígitos) → id de chat do WhatsApp. */
export const chatDe = (fone: string) => `${fone.replace(/\D/g, "")}@c.us`;

export async function enviarTexto(chatId: string, texto: string): Promise<{ ok: boolean; id: string | null; erro: string | null }> {
  const r = await opewa(`/sessions/${encodeURIComponent(sessaoOpewa())}/messages/send-text`, { method: "POST", body: { chatId, text: texto.slice(0, 4000) } });
  if (!r.ok) return { ok: false, id: null, erro: erroDe(r) };
  const id = r.dados.id ?? r.dados.messageId ?? (r.dados.key as { id?: string } | undefined)?.id ?? null;
  return { ok: true, id: id ? String(id) : null, erro: null };
}

/** Status e telefone da sessão. */
export async function situacaoSessao(): Promise<{ ok: boolean; status: string | null; telefone: string | null; erro: string | null }> {
  const r = await opewa(`/sessions/${encodeURIComponent(sessaoOpewa())}`);
  if (!r.ok) return { ok: false, status: null, telefone: null, erro: erroDe(r) };
  return { ok: true, status: String(r.dados.status ?? ""), telefone: r.dados.phone ? String(r.dados.phone) : null, erro: null };
}

/** Telefone de quem mandou: número do id, senderPhone ou, para ids privados (@lid), a consulta no OpeWA. */
export async function telefoneDoRemetente(d: { from?: string; chatId?: string; senderPhone?: string | null }): Promise<string | null> {
  if (d.senderPhone) return String(d.senderPhone).replace(/\D/g, "");
  const id = String(d.chatId || d.from || "");
  if (id.endsWith("@c.us") || id.endsWith("@s.whatsapp.net")) return id.split("@")[0].replace(/\D/g, "");
  if (id.endsWith("@lid")) {
    const r = await opewa(`/sessions/${encodeURIComponent(sessaoOpewa())}/contacts/${encodeURIComponent(id)}/phone`);
    const f = r.ok ? String(r.dados.phone ?? "").replace(/\D/g, "") : "";
    return f || null;
  }
  return null;
}

/** Cria ou atualiza o webhook da sessão para a função atend-webhook, assinado com HMAC. */
export async function registrarWebhook(url: string, segredo: string, idAtual: string | null): Promise<{ ok: boolean; id: string | null; erro: string | null }> {
  const corpo = { url, events: ["message.received", "message.sent"], secret: segredo, retryCount: 3 };
  const s = encodeURIComponent(sessaoOpewa());
  if (idAtual) {
    const r = await opewa(`/sessions/${s}/webhooks/${encodeURIComponent(idAtual)}`, { method: "PUT", body: { ...corpo, active: true } });
    if (r.ok) return { ok: true, id: idAtual, erro: null };
    if (r.status !== 404) return { ok: false, id: null, erro: erroDe(r) };
  }
  const r = await opewa(`/sessions/${s}/webhooks`, { method: "POST", body: corpo });
  if (!r.ok) return { ok: false, id: null, erro: erroDe(r) };
  return { ok: true, id: String(r.dados.id ?? ""), erro: null };
}

/** Confere a assinatura X-OpenWA-Signature (sha256=<hex>) do corpo cru. */
export async function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!cabecalho || !segredo) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.trim().toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

/** Botões viram opções numeradas (o WhatsApp Web não tem botão de verdade). */
export function comOpcoes(texto: string, botoes: string[]): string {
  const b = botoes.map((x) => x.trim()).filter(Boolean).slice(0, 3);
  if (!b.length) return texto;
  return `${texto}\n\n${b.map((x, i) => `${i + 1}️⃣ ${x}`).join("\n")}`;
}
