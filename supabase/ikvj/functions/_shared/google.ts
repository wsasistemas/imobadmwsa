// Google Agenda: OAuth por vendedor, freeBusy e eventos. Secrets: ADM_GOOGLE_CLIENT_ID e ADM_GOOGLE_CLIENT_SECRET.
import { admin, json } from "./asaas.ts";
import { gerarHorarios, type AgendaOcupada, type ConfigAgenda, type Horario, type Periodo, type ReuniaoMarcada } from "./agenda-slots.ts";

const API = "https://www.googleapis.com/calendar/v3";
const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export type Db = ReturnType<typeof admin>;
export interface AppGoogle { id: string; segredo: string }
export interface AgendaToken { id: string; calendar_id: string; refresh_token: string | null }
export interface Contexto {
  negocio_id: string; nome: string; empresa: string | null; email: string | null; whatsapp: string | null;
  config: ConfigAgenda & { criar_meet: boolean };
  agendas: AgendaToken[];
  reunioes: ReuniaoMarcada[];
  minha: { id: string; inicio: string; fim: string; meet_url: string | null } | null;
}

export function appGoogle(): AppGoogle | null {
  const id = env("ADM_GOOGLE_CLIENT_ID"), segredo = env("ADM_GOOGLE_CLIENT_SECRET");
  return id && segredo ? { id, segredo } : null;
}

export function urlRetorno(): string {
  return `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/adm-google`;
}

export function urlLogin(app: AppGoogle, estado: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: app.id, redirect_uri: urlRetorno(), response_type: "code", access_type: "offline", prompt: "consent", state: estado,
    scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
  }).toString();
  return u.toString();
}

export class TokenPerdido extends Error {}

async function token(app: AppGoogle, corpo: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.id, client_secret: app.segredo, ...corpo }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (b?.error === "invalid_grant") throw new TokenPerdido("O Google recusou a autorização desta agenda. Conecte de novo.");
    throw new Error(`Google: ${b?.error_description ?? b?.error ?? r.status}`);
  }
  return b as { access_token: string; refresh_token?: string; id_token?: string };
}

export const trocarCodigo = (app: AppGoogle, code: string) =>
  token(app, { grant_type: "authorization_code", code, redirect_uri: urlRetorno() });

export const acessoDe = async (app: AppGoogle, refresh: string) =>
  (await token(app, { grant_type: "refresh_token", refresh_token: refresh })).access_token;

export async function revogar(refresh: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined);
}

export function emailDoIdToken(idToken: string | undefined): string | null {
  try {
    const parte = idToken!.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(parte)) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

async function ocupadoGoogle(acesso: string, calendar: string, de: Date, ate: Date): Promise<Periodo[]> {
  const r = await fetch(`${API}/freeBusy`, {
    method: "POST", headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: de.toISOString(), timeMax: ate.toISOString(), items: [{ id: calendar }] }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google freeBusy: ${b?.error?.message ?? r.status}`);
  const busy = (b?.calendars?.[calendar]?.busy ?? []) as { start: string; end: string }[];
  return busy.map((x) => ({ inicio: x.start, fim: x.end }));
}

/** Ocupado de cada agenda. Agenda que falha fica de fora: nunca oferecemos horário sem conferir no Google. */
export async function ocupadoDasAgendas(db: Db, app: AppGoogle, agendas: AgendaToken[], de: Date, ate: Date): Promise<AgendaOcupada[]> {
  const lista = await Promise.all(agendas.map(async (a): Promise<AgendaOcupada | null> => {
    if (!a.refresh_token) return null;
    try {
      const acesso = await acessoDe(app, a.refresh_token);
      return { id: a.id, ocupado: await ocupadoGoogle(acesso, a.calendar_id, de, ate) };
    } catch (e) {
      console.error("[google] agenda falhou", a.id, e instanceof Error ? e.message : String(e));
      if (e instanceof TokenPerdido) await db.rpc("com_srv_google_situacao", { p_agenda: a.id, p_valido: false, p_detalhe: e.message });
      return null;
    }
  }));
  return lista.filter((x): x is AgendaOcupada => !!x);
}

export async function horariosLivres(db: Db, app: AppGoogle, c: Contexto, agora = new Date(), dias = 14): Promise<Horario[]> {
  const ate = new Date(agora.getTime() + (dias + 1) * 86_400_000);
  const ocupado = await ocupadoDasAgendas(db, app, c.agendas, agora, ate);
  return gerarHorarios(c.config, ocupado, c.reunioes, agora, dias);
}

export async function criarEvento(app: AppGoogle, refresh: string, calendar: string, ev: {
  titulo: string; descricao: string; inicio: string; fim: string; convidado: string | null; meet: boolean; idPedido: string;
}): Promise<{ id: string; meet: string | null }> {
  const acesso = await acessoDe(app, refresh);
  const url = `${API}/calendars/${encodeURIComponent(calendar)}/events?sendUpdates=all&conferenceDataVersion=1`;
  const r = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.titulo, description: ev.descricao,
      start: { dateTime: ev.inicio, timeZone: "America/Sao_Paulo" }, end: { dateTime: ev.fim, timeZone: "America/Sao_Paulo" },
      attendees: ev.convidado ? [{ email: ev.convidado }] : [],
      ...(ev.meet ? { conferenceData: { createRequest: { requestId: ev.idPedido, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
    }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google events.insert: ${b?.error?.message ?? r.status}`);
  return { id: String(b.id), meet: b.hangoutLink ?? null };
}

export async function apagarEvento(app: AppGoogle, refresh: string | null, calendar: string | null, evento: string | null) {
  if (!refresh || !calendar || !evento) return;
  try {
    const acesso = await acessoDe(app, refresh);
    await fetch(`${API}/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(evento)}?sendUpdates=all`, {
      method: "DELETE", headers: { Authorization: `Bearer ${acesso}` },
    });
  } catch (e) {
    console.error("[google] não apagou o evento", e instanceof Error ? e.message : String(e));
  }
}

export const dataHoraBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Template de WhatsApp. Sem os secrets, não envia. Falha aqui nunca desfaz a reunião. */
export async function enviarTemplate(para: string | null, nome: string, parametros: string[]): Promise<boolean> {
  const tk = env("ADM_WHATSAPP_TOKEN"), phone = env("ADM_WHATSAPP_PHONE_ID");
  if (!tk || !phone || !para) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phone}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: para, type: "template",
        template: { name: nome, language: { code: "pt_BR" }, components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] },
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function linkAgenda(token: string): string {
  return `${(env("ADM_AGENDA_URL") || "https://imobwsa.vercel.app").replace(/\/+$/, "")}/agendar/${token}`;
}

export const TOKEN_OK = /^[A-Za-z0-9_-]{16,200}$/;

/** Confere o token, aplica o limite de chamadas e carrega o negócio. */
export async function abrirToken(db: Db, token: unknown): Promise<{ ok: true; token: string; c: Contexto } | { ok: false; res: Response }> {
  const t = String(token ?? "");
  const invalido = { ok: false as const, res: json({ ok: false, erro: "Este link não é mais válido. Peça um novo para a equipe WSA." }, 404) };
  if (!TOKEN_OK.test(t)) return invalido;
  const { data: dentro } = await db.rpc("com_srv_agenda_limite", { p_chave: t, p_max: 30 });
  if (dentro !== true) return { ok: false, res: json({ ok: false, erro: "Muitas tentativas. Aguarde um minuto." }, 429) };
  const { data, error } = await db.rpc("com_srv_agenda_contexto", { p_token: t });
  if (error) return { ok: false, res: json({ ok: false, erro: "Não foi possível abrir a agenda agora." }, 500) };
  if (!data) return invalido;
  return { ok: true, token: t, c: data as Contexto };
}
