// agenda-marcar — marca, remarca ou cancela pela página pública. verify_jwt = false: a proteção é o token com validade.
// Ordem ao marcar: confere o horário no Google → reserva com trava no banco → cria o evento → confirma. Se o Google falhar, solta a reserva.
// Templates na Meta (pt_BR): reuniao_confirmada com {{1}} nome, {{2}} data e hora, {{3}} link.
import { admin, cors, json } from "../_shared/asaas.ts";
import {
  abrirToken, apagarEvento, appGoogle, criarEvento, dataHoraBr, enviarTemplate, horariosLivres, linkAgenda, type AppGoogle, type Contexto, type Db,
} from "../_shared/google.ts";

const OCUPADO = "Esse horário acabou de ser ocupado. Escolha outro.";

async function marcar(db: Db, app: AppGoogle, token: string, c: Contexto, inicio: string, substitui: string | null) {
  const pedido = new Date(inicio).getTime();
  if (!Number.isFinite(pedido)) return json({ ok: false, erro: "Horário inválido." }, 400);
  const livre = (await horariosLivres(db, app, c)).find((h) => new Date(h.inicio).getTime() === pedido);
  if (!livre) return json({ ok: false, erro: OCUPADO, conflito: true }, 409);

  const { data, error } = await db.rpc("com_srv_agenda_reservar", {
    p_token: token, p_inicio: livre.inicio, p_agendas: livre.agendas, p_substitui: substitui,
  });
  if (error) return json({ ok: false, erro: "Não foi possível marcar agora. Tente de novo." }, 500);
  const r = data as { ok: boolean; motivo?: string; reuniao_id: string; calendar_id: string; refresh_token: string; inicio: string; fim: string; criar_meet: boolean };
  if (!r.ok) {
    if (r.motivo === "ja_marcada") return json({ ok: false, erro: "Você já tem uma reunião marcada. Use Remarcar." }, 409);
    return json({ ok: false, erro: OCUPADO, conflito: true }, 409);
  }

  let evento: { id: string; meet: string | null };
  try {
    evento = await criarEvento(app, r.refresh_token, r.calendar_id, {
      titulo: `Demonstração WSA · ${c.empresa || c.nome}`,
      descricao: `Reunião marcada pelo link de agendamento.\nContato: ${c.nome}`,
      inicio: r.inicio, fim: r.fim, convidado: c.email, meet: r.criar_meet, idPedido: r.reuniao_id,
    });
  } catch (e) {
    console.error("[agenda-marcar]", e instanceof Error ? e.message : String(e));
    await db.rpc("com_srv_agenda_soltar", { p_reuniao: r.reuniao_id });
    return json({ ok: false, erro: "O Google Agenda não respondeu. Tente de novo em instantes." }, 502);
  }

  const { data: conf, error: eConf } = await db.rpc("com_srv_agenda_confirmar", {
    p_reuniao: r.reuniao_id, p_evento: evento.id, p_meet: evento.meet ?? "", p_substitui: substitui,
  });
  if (eConf) console.error("[agenda-marcar] confirmar", eConf.message);
  const antiga = conf as { antiga_evento?: string; antiga_calendar?: string; antiga_refresh?: string } | null;
  if (antiga?.antiga_evento) await apagarEvento(app, antiga.antiga_refresh ?? null, antiga.antiga_calendar ?? null, antiga.antiga_evento);

  await enviarTemplate(c.whatsapp, "reuniao_confirmada", [c.nome.trim().split(/\s+/)[0] || "tudo bem", dataHoraBr(r.inicio), evento.meet ?? linkAgenda(token)]);
  return json({ ok: true, reuniao: { id: r.reuniao_id, inicio: r.inicio, fim: r.fim, meet_url: evento.meet } });
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
    const { data, error } = await db.rpc("com_srv_agenda_cancelar", { p_token: a.token, p_reuniao: a.c.minha.id });
    const r = data as { ok: boolean; evento?: string; calendar?: string; refresh_token?: string } | null;
    if (error || !r?.ok) return json({ ok: false, erro: "Não foi possível cancelar agora." }, 500);
    await apagarEvento(app, r.refresh_token ?? null, r.calendar ?? null, r.evento ?? null);
    return json({ ok: true });
  }
  return json({ ok: false, erro: "Ação desconhecida." }, 400);
});
