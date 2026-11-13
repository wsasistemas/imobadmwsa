// Avisos aos consultores pelo WhatsApp (OpenWA), conforme Configurações › Usuários.
// Tipos: reuniao_marcada | pediu_consultor | lembrete_1h | remarcada. Só envia se o usuário ativo com esse WhatsApp
// quer aquele aviso. Quando o número é o da própria sessão, a mensagem cai no chat "mensagem para mim".
import { chatDe, enviarTexto, opewaConfigurado } from "./opewa.ts";

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type TipoAviso = "reuniao_marcada" | "pediu_consultor" | "lembrete_1h" | "remarcada";

export async function avisarConsultor(db: Db, fone: string | null | undefined, tipo: TipoAviso, texto: string): Promise<boolean> {
  const fc = (fone ?? "").replace(/\D/g, "");
  if (!fc || !opewaConfigurado()) return false;
  const { data: pode } = await db.rpc("com_srv_aviso_permitido", { p_whatsapp: fc, p_tipo: tipo });
  if (pode !== true) return false;
  const r = await enviarTexto(chatDe(fc), texto);
  if (!r.ok) console.error("[avisos]", tipo, r.erro);
  return r.ok;
}

const TZ = "America/Sao_Paulo";
export const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(".", "");

const fone = (f: string | null | undefined) => {
  const d = (f ?? "").replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
};

export interface DadosLead { nome: string | null; empresa: string | null; whatsapp: string | null }
const quem = (l: DadosLead) => `${l.nome ?? "Lead sem nome"}${l.empresa ? ` (${l.empresa})` : ""}`;

export const textoReuniao = (l: DadosLead, inicio: string, meet: string | null, remarcada = false, origem = "pela Sophia") =>
  `${remarcada ? "🔁 *Demonstração remarcada*" : "📅 *Demonstração marcada*"} ${origem}\n${quem(l)}\n${quando(inicio)}${meet ? `\nMeet: ${meet}` : ""}${l.whatsapp ? `\nWhatsApp do lead: ${fone(l.whatsapp)}` : ""}`;

export const textoCancelada = (l: DadosLead, inicio: string) =>
  `❌ *Demonstração cancelada* pelo lead\n${quem(l)}\nEra ${quando(inicio)}${l.whatsapp ? `\nWhatsApp do lead: ${fone(l.whatsapp)}` : ""}`;

export const textoPediuConsultor = (l: DadosLead, motivo: string) =>
  `🔔 *Lead quer falar com você*\n${quem(l)}\nMotivo: ${motivo}${l.whatsapp ? `\nResponda pelo WhatsApp: ${fone(l.whatsapp)}` : ""}`;

export const textoLembrete = (l: DadosLead, inicio: string, meet: string | null) =>
  `⏰ *Demonstração em 1 hora*\n${quem(l)}\n${quando(inicio)}${meet ? `\nMeet: ${meet}` : ""}${l.whatsapp ? `\nWhatsApp do lead: ${fone(l.whatsapp)}` : ""}`;
