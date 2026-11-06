// adm-regua-enviar — envia os avisos da régua de cobrança (WhatsApp e e-mail).
// Quem chama: o pg_cron adm-regua-diaria (header x-adm-chave = chave do Vault) ou o super admin
// pelo painel. Body: { apenas_listar?: boolean } → devolve o que seria enviado, sem enviar.
// Sem duplicar: cada envio é reservado no banco antes (adm_srv_reservar_aviso); se falhar, a
// reserva é liberada e o aviso sai na próxima execução (a janela de cada passo é de 3 dias).
//
// Secrets (todos opcionais: canal sem configuração é pulado, sem gastar o aviso):
//   ADM_WHATSAPP_TOKEN, ADM_WHATSAPP_PHONE_ID      Meta Cloud API (templates aprovados, pt_BR)
//   ADM_RESEND_API_KEY, ADM_EMAIL_REMETENTE        ex.: "WSA Sistemas <financeiro@imobsystems.com.br>"
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";

interface Aviso {
  fatura_id: string; empresa_id: string; passo: string; d: number; canal: "whatsapp" | "email";
  nome: string; destino: string; valor: number; vencimento: string; invoice_url: string | null;
  dias: number; suspende_em: string;
}

// Template da Meta por passo. Parâmetros do corpo, nesta ordem: nome, valor, vencimento, link
// (+ data da suspensão no d+8). Os textos sugeridos estão em docs/regua-templates.md.
const TEMPLATES: Record<string, { nome: string; comSuspensao?: boolean }> = {
  "d-3": { nome: "adm_cobranca_lembrete" },
  "d+1": { nome: "adm_cobranca_atraso" },
  "d+5": { nome: "adm_cobranca_atraso" },
  "d+8": { nome: "adm_cobranca_suspensao_aviso", comSuspensao: true },
  "d+11": { nome: "adm_cobranca_suspensa" },
};

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const link = (a: Aviso) => a.invoice_url ?? "https://www.imobsystems.com.br";

async function enviarWhatsapp(a: Aviso): Promise<{ ok: boolean; r: Record<string, unknown> }> {
  const token = env("ADM_WHATSAPP_TOKEN"), phone = env("ADM_WHATSAPP_PHONE_ID");
  if (!token || !phone) return { ok: false, r: { erro: "WhatsApp não configurado (ADM_WHATSAPP_TOKEN / ADM_WHATSAPP_PHONE_ID)" } };
  const t = TEMPLATES[a.passo];
  if (!t) return { ok: false, r: { erro: `Sem template para o passo ${a.passo}` } };
  const params = [a.nome, brl(a.valor), br(a.vencimento), link(a)];
  if (t.comSuspensao) params.push(br(a.suspende_em));
  const res = await fetch(`https://graph.facebook.com/v21.0/${phone}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: a.destino.replace(/\D/g, ""), type: "template",
      template: {
        name: t.nome, language: { code: "pt_BR" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, r: { erro: b?.error?.message ?? `Meta ${res.status}`, template: t.nome } };
  return { ok: true, r: { id: b?.messages?.[0]?.id, template: t.nome } };
}

function emailHtml(a: Aviso) {
  const titulo = a.d < 0
    ? `Sua mensalidade vence em ${br(a.vencimento)}`
    : a.d >= 11 ? "Acesso suspenso por falta de pagamento"
    : `Mensalidade em atraso há ${a.dias} dia(s)`;
  const corpo = a.d < 0
    ? `A mensalidade dos sistemas WSA no valor de <b>${brl(a.valor)}</b> vence em <b>${br(a.vencimento)}</b>.`
    : a.d >= 11
    ? `O acesso aos sistemas foi suspenso porque a mensalidade de <b>${brl(a.valor)}</b> (vencida em ${br(a.vencimento)}) não foi paga. Assim que o pagamento for confirmado, o acesso volta na hora.`
    : `A mensalidade de <b>${brl(a.valor)}</b> venceu em <b>${br(a.vencimento)}</b>. Para não ter o acesso suspenso em <b>${br(a.suspende_em)}</b>, faça o pagamento pelo link abaixo.`;
  return {
    assunto: `${titulo} — ${a.nome}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
      <h2 style="color:#1e3a8a">${titulo}</h2>
      <p>Olá, ${a.nome}.</p><p>${corpo}</p>
      <p><a href="${link(a)}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Pagar agora (PIX, boleto ou cartão)</a></p>
      <p style="font-size:12px;color:#6b7280">Se já pagou, desconsidere este aviso. WSA Sistemas.</p></div>`,
  };
}

async function enviarEmail(a: Aviso): Promise<{ ok: boolean; r: Record<string, unknown> }> {
  const key = env("ADM_RESEND_API_KEY"), de = env("ADM_EMAIL_REMETENTE");
  if (!key || !de) return { ok: false, r: { erro: "E-mail não configurado (ADM_RESEND_API_KEY / ADM_EMAIL_REMETENTE)" } };
  const m = emailHtml(a);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: de, to: [a.destino], subject: m.assunto, html: m.html }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, r: { erro: b?.message ?? `Resend ${res.status}` } };
  return { ok: true, r: { id: b?.id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const db = admin();
  const chave = req.headers.get("x-adm-chave") ?? "";
  let origem = "cron";
  if (chave) {
    const { data: ok } = await db.rpc("adm_srv_cron_chave_ok", { p_chave: chave });
    if (ok !== true) return json({ ok: false, erro: "forbidden" }, 403);
  } else {
    const quem = await exigirSuperAdmin(req);
    if (!quem.ok) return quem.res;
    origem = "painel";
  }

  const body = await req.json().catch(() => ({})) as { apenas_listar?: boolean };
  const { data, error } = await db.rpc("adm_srv_avisos_pendentes");
  if (error) return json({ ok: false, erro: error.message }, 500);
  const avisos = (data ?? []) as Aviso[];
  if (body.apenas_listar) return json({ ok: true, pendentes: avisos });

  const configurado = {
    whatsapp: !!(env("ADM_WHATSAPP_TOKEN") && env("ADM_WHATSAPP_PHONE_ID")),
    email: !!(env("ADM_RESEND_API_KEY") && env("ADM_EMAIL_REMETENTE")),
  };
  const resumo = { origem, total: avisos.length, enviados: 0, falhas: 0, pulados: 0, sem_configuracao: 0, configurado, erros: [] as string[] };
  for (const a of avisos) {
    if (!configurado[a.canal]) { resumo.sem_configuracao++; continue; } // não gasta o aviso nem polui o histórico
    const { data: reservou } = await db.rpc("adm_srv_reservar_aviso", { p_fatura: a.fatura_id, p_passo: a.passo, p_canal: a.canal });
    if (reservou !== true) { resumo.pulados++; continue; }
    let res: { ok: boolean; r: Record<string, unknown> };
    try {
      res = a.canal === "whatsapp" ? await enviarWhatsapp(a) : await enviarEmail(a);
    } catch (e) {
      res = { ok: false, r: { erro: String(e) } };
    }
    await db.rpc("adm_srv_resultado_aviso", {
      p_fatura: a.fatura_id, p_passo: a.passo, p_canal: a.canal, p_ok: res.ok, p_resultado: res.r,
    });
    if (res.ok) resumo.enviados++;
    else { resumo.falhas++; resumo.erros.push(`${a.nome} ${a.passo} ${a.canal}: ${res.r.erro}`); }
  }
  console.log("[adm-regua-enviar]", JSON.stringify(resumo));
  return json({ ok: true, ...resumo });
});
