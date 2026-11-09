// Cálculo dos horários livres. Sem dependência de Deno, para rodar também no teste local.
// O atendimento é em horário de Brasília, que hoje não tem horário de verão (UTC-3).

export interface ConfigAgenda {
  duracao_min: number;
  intervalo_min: number;
  antecedencia_min: number;
  horario: { dias: number[]; inicio: string; fim: string };
}
export interface Periodo { inicio: string; fim: string }
export interface AgendaOcupada { id: string; ocupado: Periodo[] }
export interface ReuniaoMarcada extends Periodo { agenda_id: string | null }
export interface Horario extends Periodo { agendas: string[] }

const MINUTO = 60_000;
const OFFSET_BRASILIA_MIN = 180;

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function gerarHorarios(c: ConfigAgenda, agendas: AgendaOcupada[], reunioes: ReuniaoMarcada[], agora: Date, dias = 14): Horario[] {
  const passo = c.duracao_min + c.intervalo_min;
  const limite = agora.getTime() + c.antecedencia_min * MINUTO;
  const folga = c.intervalo_min * MINUTO;
  const abre = minutos(c.horario.inicio);
  const fecha = minutos(c.horario.fim);
  const saida: Horario[] = [];
  const hojeBr = new Date(agora.getTime() - OFFSET_BRASILIA_MIN * MINUTO);

  const bate = (ini: number, fim: number, p: Periodo) => ini < new Date(p.fim).getTime() + folga && fim > new Date(p.inicio).getTime() - folga;

  for (let d = 0; d < dias; d++) {
    const dia = new Date(Date.UTC(hojeBr.getUTCFullYear(), hojeBr.getUTCMonth(), hojeBr.getUTCDate() + d));
    if (!c.horario.dias.includes(dia.getUTCDay())) continue;
    for (let m = abre; m + c.duracao_min <= fecha; m += passo) {
      const ini = dia.getTime() + (m + OFFSET_BRASILIA_MIN) * MINUTO;
      const fim = ini + c.duracao_min * MINUTO;
      if (ini < limite) continue;
      const livres = agendas
        .filter((a) => !a.ocupado.some((p) => bate(ini, fim, p)))
        .filter((a) => !reunioes.some((r) => r.agenda_id === a.id && bate(ini, fim, r)))
        .map((a) => a.id);
      if (livres.length) saida.push({ inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString(), agendas: livres });
    }
  }
  return saida;
}
