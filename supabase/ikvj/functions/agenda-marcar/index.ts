// agenda-marcar — marca, remarca ou cancela pela página pública. verify_jwt = false: a proteção é o token com validade.
// Ordem ao marcar (em _shared/google.ts → marcarHorario): confere o horário no Google → reserva com trava no banco →
// cria o evento → confirma. Se o Google falhar, solta a reserva. Depois avisa o consultor pelo WhatsApp (OpenWA),
// conforme Configurações › Usuários. Templates na Meta (pt_BR): reuniao_confirmada com {{1}} nome, {{2}} data e hora, {{3}} link.
import { admin, cors, json } from "../_shared/asaas.ts";
import { avisarConsultor, type DadosLead, textoCancelada, textoReuniao } from "../_shared/avisos.ts";
import { abrirToken, apagarEvento, appGoogle, dataHoraBr, enviarTemplate, linkAgenda, marcarHorario, type AppGoogle, type Contexto, type Db } from "../_shared/google.ts";

type Aviso = { consultor: { nome: string; whatsapp: string | null } | null; lead: DadosLead; inicio: string; meet_url: string | null } | null;
const dadosAviso = async (db: Db, reuniao: string) => (await db.rpc("com_srv_atend_reuniao_aviso", { p_reuniao: reuniao })).data as Aviso;

async function marcar(db: Db, app: AppGoogle, token: string, c: Contexto, inicio: string, substitui: string | null) {
  const r = await marcarHorario(db, app, token, c, inicio, substitui, "Reunião marcada pelo link de agendamento.");
  if (!r.ok) return json({ ok: false, erro: r.erro, ...(r.conflito ? { conflito: true } : {}) }, r.status);
  await enviarTemplate(c.whatsapp, "reuniao_confirmada", [c.nome.trim().split(/\s+/)[0] || "tudo bem", dataHoraBr(r.reuniao.inicio), r.reuniao.meet_url ?? linkAgenda(token)]);
  try {
    const a = await dadosAviso(db, r.reuniao.id);
    if (a) await avisarConsultor(db, a.consultor?.whatsapp, substitui ? "remarcada" : "reuniao_marcada",
      textoReuniao(a.lead, r.reuniao.inicio, r.reuniao.meet_url, !!substitui, "pelo link de agendamento"));
  } catch (e) {
    console.error("[agenda-marcar] aviso", e instanceof Error ? e.message : String(e)); // aviso nunca desfaz a reunião
  }
  return json({ ok: true, reuniao: r.reuniao });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const corpo = await req.json().catch(() => ({}));
  const db = admin();
  const a = await abrirToken(db, corpo.token);
  if (!a.ok) return a.res;
  const app = appGoogle();
  if (!app) return json({ ok: false, erro: "A agenda ainda não está disponível." }, 409);

  const acao = String(corpo.acao ?? "marcar");
  if (acao === "marcar") return marcar(db, app, a.token, a.c, String(corpo.inicio ?? ""), null);
  if (!a.c.minha) return json({ ok: false, erro: "Não há reunião marcada neste link." }, 404);
  if (acao === "remarcar") return marcar(db, app, a.token, a.c, String(corpo.inicio ?? ""), a.c.minha.id);
  if (acao === "cancelar") {
    const antes = await dadosAviso(db, a.c.minha.id).catch(() => null);
    const { data, error } = await db.rpc("com_srv_agenda_cancelar", { p_token: a.token, p_reuniao: a.c.minha.id });
    const r = data as { ok: boolean; evento?: string; calendar?: string; refresh_token?: string } | null;
    if (error || !r?.ok) return json({ ok: false, erro: "Não foi possível cancelar agora." }, 500);
    await apagarEvento(app, r.refresh_token ?? null, r.calendar ?? null, r.evento ?? null);
    if (antes) await avisarConsultor(db, antes.consultor?.whatsapp, "remarcada", textoCancelada(antes.lead, antes.inicio)).catch(() => false);
    return json({ ok: true });
  }
  return json({ ok: false, erro: "Ação desconhecida." }, 400);
});
