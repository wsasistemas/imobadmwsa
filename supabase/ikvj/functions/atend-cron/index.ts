// atend-cron — chamado pelo pg_cron com a chave do Vault (x-adm-chave):
//   * com-atend (a cada minuto, só com o robô ligado): 1 boas-vindas por vez e o lembrete único de quem parou;
//   * com-avisos-consultor (a cada 5 min, só com demonstração na próxima hora): corpo {"so_avisos": true}.
// Nos dois casos envia o aviso "demonstração em 1 hora" aos consultores que querem (Configurações › Usuários).
// Secrets: ADM_OPEWA_URL, ADM_OPEWA_API_KEY, ADM_OPEWA_SESSAO.
import { admin, cors, json } from "../_shared/asaas.ts";
import { agendaDoLead } from "../_shared/agenda-lead.ts";
import { ofertarHorarios } from "../_shared/atend-fluxo.ts";
import { boasVindas, type Contexto, nomesDosSistemas } from "../_shared/atendimento.ts";
import { avisarConsultor, textoLembrete } from "../_shared/avisos.ts";
import { comOpcoes, enviarTexto, opewaConfigurado } from "../_shared/opewa.ts";

const primeiro = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const db = admin();
  const { data: chaveOk } = await db.rpc("adm_srv_cron_chave_ok", { p_chave: req.headers.get("x-adm-chave") ?? "" });
  if (chaveOk !== true) return json({ ok: false, erro: "forbidden" }, 403);
  if (!opewaConfigurado()) return json({ ok: true, sem_configuracao: true });
  const corpo = await req.json().catch(() => ({}));
  const saida: Record<string, unknown> = {};

  if (corpo.so_avisos !== true) {
    const { data: p } = await db.rpc("com_srv_atend_bv_pegar");
    const bv = p as { ok: boolean; motivo?: string; conversa_id?: string; nome?: string; chat_id?: string; sistemas?: string[]; token_agenda?: string; pediu_demo?: boolean };
    if (bv?.ok) {
      const { data: c } = await db.rpc("com_srv_atend_contexto");
      const ctx = c as Contexto;
      let texto = comOpcoes(boasVindas(ctx, { nome: bv.nome ?? "", temperatura: "morno", pontuacao: 50, sistemas: bv.sistemas ?? [] }), ctx.config.bv_botoes);
      let oferta: unknown = null;
      // Pediu demonstração no site: a primeira mensagem já traz os horários livres da agenda.
      if (bv.pediu_demo && bv.token_agenda) {
        const ag = await agendaDoLead(db, bv.token_agenda, "Reunião marcada pela Sophia (Atendimento ONLINE, WhatsApp).");
        const o = await ofertarHorarios(ag.porta);
        if (o.oferta) {
          const nome = primeiro(bv.nome ?? "");
          texto = `Olá${nome ? `, ${nome}` : ""}! 👋 Seja bem-vindo(a) ao Ecossistema WSA Sistemas IA. Recebi o seu pedido de demonstração do ${nomesDosSistemas(ctx, bv.sistemas ?? [])}.\n\n${o.texto}`;
          oferta = o.oferta;
        }
      }
      const r = await enviarTexto(bv.chat_id!, texto);
      await db.rpc("com_srv_atend_bv_resultado", { p_conversa: bv.conversa_id, p_ok: r.ok, p_texto: texto, p_wa_id: r.id, p_erro: r.erro });
      if (r.ok && oferta) await db.rpc("com_srv_atend_oferta", { p_conversa: bv.conversa_id, p_oferta: oferta });
      saida.boas_vindas = r.ok ? (oferta ? "enviada com horários" : "enviada") : `falhou: ${r.erro}`;
    } else saida.boas_vindas = bv?.motivo ?? "nada";

    const { data: l } = await db.rpc("com_srv_atend_lembretes_pegar");
    let lembretes = 0;
    for (const x of (l ?? []) as { conversa_id: string; chat_id: string; nome: string | null }[]) {
      const t = `Oi${x.nome ? `, ${primeiro(x.nome)}` : ""}! Ficou alguma dúvida? Se quiser, seguimos de onde paramos.`;
      const r = await enviarTexto(x.chat_id, t);
      if (r.ok) { lembretes++; await db.rpc("com_srv_atend_registrar", { p_conversa: x.conversa_id, p_autor: "robo", p_texto: t, p_wa_id: r.id }); }
    }
    saida.lembretes = lembretes;
  }

  // Demonstração em 1 hora → aviso ao consultor.
  const { data: av } = await db.rpc("com_srv_usuario_lembretes_pegar");
  let avisos = 0;
  for (const x of (av ?? []) as { inicio: string; meet_url: string | null; whatsapp: string; lead: string | null; empresa: string | null; lead_whatsapp: string | null }[]) {
    if (await avisarConsultor(db, x.whatsapp, "lembrete_1h", textoLembrete({ nome: x.lead, empresa: x.empresa, whatsapp: x.lead_whatsapp }, x.inicio, x.meet_url))) avisos++;
  }
  saida.avisos_consultor = avisos;
  console.log("[atend-cron]", JSON.stringify(saida));
  return json({ ok: true, ...saida });
});
