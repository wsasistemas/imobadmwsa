// agenda-lembretes — lembretes de reunião (24 h e 1 h). Chamada pelo pg_cron com-agenda-lembretes a cada 5 min, com a chave x-adm-chave.
// Template na Meta (pt_BR): lembrete_reuniao com {{1}} nome, {{2}} data e hora, {{3}} link.
import { admin, cors, json } from "../_shared/asaas.ts";
import { dataHoraBr, enviarTemplate, linkAgenda } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const db = admin();
  const { data: chaveOk } = await db.rpc("adm_srv_cron_chave_ok", { p_chave: req.headers.get("x-adm-chave") ?? "" });
  if (chaveOk !== true) return json({ ok: false, erro: "forbidden" }, 403);

  const { data, error } = await db.rpc("com_srv_lembretes_pegar");
  if (error) return json({ ok: false, erro: error.message }, 500);
  const lista = (data ?? []) as { tipo: string; inicio: string; meet_url: string | null; nome: string; whatsapp: string | null; token_agenda: string }[];

  let enviados = 0;
  for (const l of lista) {
    const ok = await enviarTemplate(l.whatsapp, "lembrete_reuniao", [(l.nome || "").trim().split(/\s+/)[0] || "tudo bem", dataHoraBr(l.inicio), l.meet_url ?? linkAgenda(l.token_agenda)]);
    if (ok) enviados++;
  }
  console.log("[agenda-lembretes]", JSON.stringify({ total: lista.length, enviados }));
  return json({ ok: true, total: lista.length, enviados });
});
