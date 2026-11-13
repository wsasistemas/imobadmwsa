// Atendimento ONLINE: a Sophia oferece horários livres da agenda e entende a escolha do lead.
// Sem dependência do Deno: testado no Node (supabase/ikvj/tests/agendar.test.mjs).

export type Oferta =
  | { tipo: "horarios"; slots: string[]; expira: string }   // horários oferecidos (início ISO), na ordem 1, 2, 3
  | { tipo: "recusou"; depois: string | null; expira: string }; // nenhum serviu: consultor (1) ou mais horários (2)

const TZ = "America/Sao_Paulo";
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const horaDe = (iso: string) => Number(new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

/** "qui, 14/11 às 10:00" */
export function rotulo(iso: string): string {
  const d = new Date(iso);
  const sem = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "");
  const data = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${sem}, ${data} às ${hora}`;
}

/**
 * Até 3 opções: o horário livre mais próximo e, depois, o primeiro de cada dia seguinte; se faltar dia,
 * completa no mesmo dia com pelo menos 2 h de distância (manhã/tarde).
 */
export function escolherOpcoes(livres: { inicio: string }[], depoisDe: string | null = null, n = 3): string[] {
  const base = livres.map((h) => h.inicio).filter((i) => !depoisDe || new Date(i) > new Date(depoisDe))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const escolhidos: string[] = [];
  const dias = new Set<string>();
  for (const i of base) {
    if (escolhidos.length >= n) break;
    if (!dias.has(diaDe(i))) { escolhidos.push(i); dias.add(diaDe(i)); }
  }
  for (const i of base) {
    if (escolhidos.length >= n) break;
    if (escolhidos.includes(i)) continue;
    if (escolhidos.every((e) => Math.abs(new Date(e).getTime() - new Date(i).getTime()) >= 2 * 3_600_000)) escolhidos.push(i);
  }
  return escolhidos.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

export function textoOpcoes(slots: string[], duracaoMin: number): string {
  return `Tenho estes horários para a demonstração (${duracaoMin} min, por Google Meet):\n` +
    slots.map((s, i) => `${NUM[i]} ${rotulo(s)}`).join("\n") +
    `\n${NUM[slots.length]} Nenhum desses serve\n\nÉ só responder com o número.`;
}

export const TEXTO_RECUSOU = "Sem problema! Como prefere seguir?\n1️⃣ Falar com um consultor para combinar outro horário\n2️⃣ Ver mais horários";

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Número escolhido (1, 2, 3…), por dígito, emoji, ordinal ou hora citada. null = não deu para entender. */
function numeroEscolhido(texto: string, max: number, horarios: string[] = []): number | null {
  const t = normal(texto);
  const emoji = NUM.findIndex((e) => texto.includes(e));
  if (emoji >= 0 && emoji < max) return emoji + 1;
  const m = /^(?:opcao|opção|numero|n)?\s*([1-9])\b/.exec(t) ?? /^(?:a|o)?\s*([1-9])\s*(?:a|o|ª|º)?$/.exec(t);
  if (m && Number(m[1]) <= max) return Number(m[1]);
  const ord = [/\bprimeir/, /\bsegund/, /\bterceir/, /\bquart/].findIndex((r) => r.test(t));
  if (ord >= 0 && ord < max) return ord + 1;
  // "às 10h", "10:00", "15 horas" → o horário oferecido com essa hora (se só um bater)
  const h = /\b([01]?\d|2[0-3])\s*(?:h|:|horas?\b)/.exec(t);
  if (h && horarios.length) {
    const iguais = horarios.map((s, i) => [i, horaDe(s)] as const).filter(([, hh]) => hh === Number(h[1]));
    if (iguais.length === 1) return iguais[0][0] + 1;
  }
  return null;
}

const NENHUM = /\b(nenhum|nenhuma|nao serve|nao posso|nao da|nao consigo|outro horario|outros horarios|outro dia)\b/;

/** Resposta a uma oferta de horários. */
export function interpretarHorario(texto: string, slots: string[]): { slot: string } | { nenhum: true } | null {
  const n = numeroEscolhido(texto, slots.length + 1, slots);
  if (n !== null && n <= slots.length) return { slot: slots[n - 1] };
  if (n === slots.length + 1 || NENHUM.test(normal(texto))) return { nenhum: true };
  return null;
}

/** Resposta ao "Como prefere seguir?" depois de recusar os horários. */
export function interpretarRecusa(texto: string): "consultor" | "mais" | null {
  const t = normal(texto);
  const n = numeroEscolhido(texto, 2);
  if (n === 1 || /\b(consultor|pessoa|humano|atendente|vendedor|ligar|me liga)\b/.test(t)) return "consultor";
  if (n === 2 || /\b(mais|outros|outras|ver horarios|mais horarios)\b/.test(t)) return "mais";
  return null;
}

export const ofertaValida = (o: Oferta | null | undefined): o is Oferta => !!o && new Date(o.expira).getTime() > Date.now();
export const expiraEm = (horas = 24) => new Date(Date.now() + horas * 3_600_000).toISOString();
