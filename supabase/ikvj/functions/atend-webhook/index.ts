// atend-webhook — recebe os eventos do OpeWA (sessão wsa-admin) do Atendimento ONLINE.
// message.received: a Sophia responde (ou registra / trata o PARAR). message.sent que não foi o robô: é o consultor
// respondendo pelo celular, então grava e pausa a Sophia nessa conversa.
// Público (o OpeWA chama), protegido pela assinatura HMAC X-OpenWA-Signature com o segredo guardado no Vault.
// Responde 200 na hora e processa em segundo plano (o OpeWA espera no máximo ~10 s).
import { admin, json } from "../_shared/asaas.ts";
import { aplicarRegras, chamarIA, type Contexto, type Lead, montarPrompt } from "../_shared/atendimento.ts";
import { assinaturaValida, chatDe, comOpcoes, enviarTexto, situacaoSessao, telefoneDoRemetente } from "../_shared/opewa.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
type Db = ReturnType<typeof admin>;
type Msg = { id?: string; from?: string; to?: string; chatId?: string; body?: string; type?: string; fromMe?: boolean; isGroup?: boolean; kind?: string; senderPhone?: string | null; media?: unknown };

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const primeiro = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const corpo = await req.text();
  const db = admin();
  const { data: segredo } = await db.rpc("com_srv_atend_webhook_segredo");
  if (!(await assinaturaValida(corpo, req.headers.get("x-openwa-signature"), String(segredo ?? "")))) return json({ ok: false, erro: "assinatura" }, 401);

  let ev: { event?: string; data?: Msg };
  try { ev = JSON.parse(corpo); } catch { return json({ ok: false }, 400); }
  const d = ev.data ?? {};
  if (d.isGroup || (d.kind && d.kind !== "individual")) return json({ ok: true, ignorado: "nao_individual" });

  if (ev.event === "message.received" && !d.fromMe) EdgeRuntime.waitUntil(entrada(db, d).catch((e) => console.error("[atend-webhook] entrada", String(e).slice(0, 300))));
  else if (ev.event === "message.sent" || (ev.event === "message.received" && d.fromMe)) EdgeRuntime.waitUntil(saida(db, d).catch((e) => console.error("[atend-webhook] saida", String(e).slice(0, 300))));
  return json({ ok: true });
});

function textoDa(d: Msg): string {
  const t = String(d.body ?? "").trim();
  if (t) return t;
  const tipo = String(d.type ?? "");
  if (/audio|ptt|voice/i.test(tipo)) return "[O lead mandou um áudio]";
  if (/image|video|sticker|document/i.test(tipo) || d.media) return "[O lead mandou uma mídia sem texto]";
  return "";
}

async function entrada(db: Db, d: Msg) {
  const texto = textoDa(d);
  if (!texto) return;
  const fone = await telefoneDoRemetente(d);
  if (!fone) return;
  const chatId = String(d.chatId || d.from || chatDe(fone));
  const { data, error } = await db.rpc("com_srv_atend_entrada", { p_fone: fone, p_texto: texto, p_wa_id: d.id ?? null, p_chat_id: chatId });
  if (error) throw new Error(error.message);
  const e = data as { acao: string; conversa_id?: string; chat_id?: string; nome?: string; lead?: Lead; token_agenda?: string; fora_do_horario?: boolean; historico?: { autor: "lead" | "robo"; texto: string }[] };

  if (e.acao === "sair") {
    const t = `Tudo certo${e.nome ? `, ${primeiro(e.nome)}` : ""}. Você não vai mais receber mensagens nossas por aqui. Obrigado!`;
    const env1 = await enviarTexto(e.chat_id!, t);
    await db.rpc("com_srv_atend_registrar", { p_conversa: e.conversa_id, p_autor: "robo", p_texto: t, p_wa_id: env1.id });
    return;
  }
  if (e.acao !== "responder") return;

  const { data: c } = await db.rpc("com_srv_atend_contexto");
  const ctx = c as Contexto;
  const link = `${(env("ADM_AGENDA_URL") || "https://imobadmwsa.imobsystems.com.br").replace(/\/+$/, "")}/agendar/${e.token_agenda}`;
  let resposta: string, acoes: Record<string, unknown>;
  try {
    const bruto = await chamarIA(montarPrompt(ctx, e.lead!, e.fora_do_horario === true), e.historico ?? []);
    const dec = aplicarRegras(ctx, e.lead!, bruto, link);
    resposta = comOpcoes(dec.resposta, dec.botoes);
    acoes = dec.acoes;
  } catch (err) {
    await db.rpc("com_srv_atend_registrar", { p_conversa: e.conversa_id, p_autor: "sistema", p_texto: `A Sophia não conseguiu responder: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`, p_wa_id: null });
    return;
  }

  await esperar(1500 + Math.floor(Math.random() * 2500)); // parece digitação, não resposta instantânea
  const env2 = await enviarTexto(e.chat_id!, resposta);
  if (!env2.ok) {
    await db.rpc("com_srv_atend_registrar", { p_conversa: e.conversa_id, p_autor: "sistema", p_texto: `Resposta não saiu pelo WhatsApp: ${env2.erro}`, p_wa_id: null });
    return;
  }
  const { data: r } = await db.rpc("com_srv_atend_resposta", { p_conversa: e.conversa_id, p_texto: resposta, p_wa_id: env2.id, p_acoes: acoes });
  const res = r as { consultor?: { nome: string; whatsapp: string | null } | null; lead?: { nome: string | null; whatsapp: string | null; empresa: string | null } };

  // Aviso ao consultor, só quando ele usa outro número (quem está no celular da sessão já vê a conversa).
  const fc = res?.consultor?.whatsapp?.replace(/\D/g, "");
  if (fc) {
    const s = await situacaoSessao();
    if (!s.telefone || s.telefone.replace(/\D/g, "") !== fc) {
      const l = res.lead ?? { nome: null, whatsapp: null, empresa: null };
      await enviarTexto(chatDe(fc), `🔔 Lead do Atendimento ONLINE para você: ${l.nome ?? "sem nome"}${l.empresa ? ` (${l.empresa})` : ""} · ${l.whatsapp ?? ""}. Motivo: ${String(acoes.motivo_consultor ?? "regra do robô")}.`);
    }
  }
}

async function saida(db: Db, d: Msg) {
  await esperar(4000); // dá tempo de o próprio robô gravar o id do que enviou
  const fone = await telefoneDoRemetente({ chatId: d.chatId || d.to, from: d.to });
  if (!fone || !d.id) return;
  await db.rpc("com_srv_atend_saida_celular", { p_fone: fone, p_texto: textoDa(d) || "[mídia]", p_wa_id: d.id });
}
