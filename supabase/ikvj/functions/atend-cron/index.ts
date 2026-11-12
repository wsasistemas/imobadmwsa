// atend-cron — chamado pelo pg_cron com-atend a cada minuto (só com o robô ligado), com a chave do Vault (x-adm-chave).
// Envia 1 boas-vindas por vez (janela, limite do dia e intervalo ficam no banco) e o lembrete único de quem parou.
// Secrets: ADM_OPEWA_URL, ADM_OPEWA_API_KEY, ADM_OPEWA_SESSAO.
import { admin, cors, json } from "../_shared/asaas.ts";
import { boasVindas, type Contexto } from "../_shared/atendimento.ts";
import { comOpcoes, enviarTexto, opewaConfigurado } from "../_shared/opewa.ts";

const primeiro = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const db = admin();
  const { data: chaveOk } = await db.rpc("adm_srv_cron_chave_ok", { p_chave: req.headers.get("x-adm-chave") ?? "" });
  if (chaveOk !== true) return json({ ok: false, erro: "forbidden" }, 403);
  if (!opewaConfigurado()) return json({ ok: true, sem_configuracao: true });

  const saida: Record<string, unknown> = {};
  const { data: p } = await db.rpc("com_srv_atend_bv_pegar");
  const bv = p as { ok: boolean; motivo?: string; conversa_id?: string; nome?: string; chat_id?: string; sistemas?: string[] };
  if (bv?.ok) {
    const { data: c } = await db.rpc("com_srv_atend_contexto");
    const ctx = c as Contexto;
    const texto = comOpcoes(boasVindas(ctx, { nome: bv.nome ?? "", temperatura: "morno", pontuacao: 50, sistemas: bv.sistemas ?? [] }), ctx.config.bv_botoes);
    const r = await enviarTexto(bv.chat_id!, texto);
    await db.rpc("com_srv_atend_bv_resultado", { p_conversa: bv.conversa_id, p_ok: r.ok, p_texto: texto, p_wa_id: r.id, p_erro: r.erro });
    saida.boas_vindas = r.ok ? "enviada" : `falhou: ${r.erro}`;
  } else saida.boas_vindas = bv?.motivo ?? "nada";

  const { data: l } = await db.rpc("com_srv_atend_lembretes_pegar");
  let lembretes = 0;
  for (const x of (l ?? []) as { conversa_id: string; chat_id: string; nome: string | null }[]) {
    const t = `Oi${x.nome ? `, ${primeiro(x.nome)}` : ""}! Ficou alguma dúvida? Se quiser, seguimos de onde paramos.`;
    const r = await enviarTexto(x.chat_id, t);
    if (r.ok) { lembretes++; await db.rpc("com_srv_atend_registrar", { p_conversa: x.conversa_id, p_autor: "robo", p_texto: t, p_wa_id: r.id }); }
  }
  saida.lembretes = lembretes;
  console.log("[atend-cron]", JSON.stringify(saida));
  return json({ ok: true, ...saida });
});
