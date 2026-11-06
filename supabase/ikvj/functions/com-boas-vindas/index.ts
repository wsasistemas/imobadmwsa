// com-boas-vindas — manda o WhatsApp de boas-vindas aos leads novos, com o link para agendar a reunião.
// Chamada pelo pg_cron com-boas-vindas (a cada minuto, só quando há pendente), com a chave do Vault (x-adm-chave).
// Só leads das últimas 48 h (lead antigo não recebe mensagem atrasada). Sem os secrets do WhatsApp, não faz nada
// e os pendentes simplesmente expiram.
// Secrets: ADM_WHATSAPP_TOKEN, ADM_WHATSAPP_PHONE_ID (os mesmos da régua) e, opcional, ADM_AGENDA_URL
// (endereço público do painel; o link fica <ADM_AGENDA_URL>/agendar/<token>).
// Template na Meta: boas_vindas_lead (pt_BR) com {{1}} = primeiro nome e {{2}} = link de agendamento.
import { admin, cors, json } from "../_shared/asaas.ts";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const db = admin();
  const { data: chaveOk } = await db.rpc("adm_srv_cron_chave_ok", { p_chave: req.headers.get("x-adm-chave") ?? "" });
  if (chaveOk !== true) return json({ ok: false, erro: "forbidden" }, 403);

  const token = env("ADM_WHATSAPP_TOKEN"), phone = env("ADM_WHATSAPP_PHONE_ID");
  if (!token || !phone) return json({ ok: true, sem_configuracao: true });
  const base = (env("ADM_AGENDA_URL") || "https://imobwsa.vercel.app").replace(/\/+$/, "");

  const { data, error } = await db.rpc("com_srv_boas_vindas_pendentes");
  if (error) return json({ ok: false, erro: error.message }, 500);
  const pendentes = (data ?? []) as { negocio_id: string; nome: string; whatsapp: string; token_agenda: string }[];

  let enviados = 0, falhas = 0;
  for (const p of pendentes) {
    const primeiroNome = (p.nome || "").trim().split(/\s+/)[0] || "tudo bem";
    const link = `${base}/agendar/${p.token_agenda}`;
    let ok = false;
    let detalhe: Record<string, unknown> = {};
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phone}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: p.whatsapp, type: "template",
          template: {
            name: "boas_vindas_lead", language: { code: "pt_BR" },
            components: [{ type: "body", parameters: [{ type: "text", text: primeiroNome }, { type: "text", text: link }] }],
          },
        }),
      });
      const b = await res.json().catch(() => ({}));
      ok = res.ok;
      detalhe = ok ? { id: b?.messages?.[0]?.id } : { erro: b?.error?.message ?? `Meta ${res.status}` };
    } catch (e) {
      detalhe = { erro: String(e) };
    }
    await db.rpc("com_srv_boas_vindas_resultado", { p_negocio: p.negocio_id, p_ok: ok, p_detalhe: detalhe });
    if (ok) enviados++; else falhas++;
  }
  console.log("[com-boas-vindas]", JSON.stringify({ total: pendentes.length, enviados, falhas }));
  return json({ ok: true, total: pendentes.length, enviados, falhas });
});
