// Atendimento ONLINE: o agendamento da demonstração feito pela Sophia, com os horários livres do Google Agenda.
// Mesmo fluxo no WhatsApp e no simulador; muda só a "porta" da agenda (no simulador, nada é marcado de verdade).
import {
  escolherOpcoes, expiraEm, interpretarHorario, interpretarRecusa, type Oferta, ofertaValida, rotulo, TEXTO_RECUSOU, textoOpcoes,
} from "./agendar.ts";

export interface PortaAgenda {
  duracaoMin: number;
  livres(): Promise<{ inicio: string }[]>;
  marcar(inicio: string): Promise<
    | { ok: true; inicio: string; meet_url: string | null; reuniao_id: string | null; simulado?: boolean }
    | { ok: false; erro: string; conflito?: boolean }
  >;
}

export interface PassoAgenda {
  texto: string;
  oferta: Oferta | null;
  agendou?: { inicio: string; meet_url: string | null; reuniao_id: string | null; simulado?: boolean };
  passarConsultor?: string; // motivo
}

const primeiro = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

/** Oferece os próximos horários livres (ou, sem horário, passa para um consultor). */
export async function ofertarHorarios(porta: PortaAgenda, depoisDe: string | null = null): Promise<PassoAgenda> {
  let livres: { inicio: string }[] = [];
  try { livres = await porta.livres(); } catch (e) { console.error("[atend-fluxo] livres", String(e).slice(0, 200)); }
  const slots = escolherOpcoes(livres, depoisDe);
  if (!slots.length) {
    return {
      texto: depoisDe
        ? "Não encontrei outros horários livres nos próximos dias. Vou pedir para um consultor combinar um horário com você por aqui."
        : "No momento não encontrei horário livre na agenda. Vou pedir para um consultor combinar um horário com você por aqui.",
      oferta: null, passarConsultor: "Sem horário livre na agenda",
    };
  }
  return { texto: textoOpcoes(slots, porta.duracaoMin), oferta: { tipo: "horarios", slots, expira: expiraEm() } };
}

/**
 * Antes da IA: se há uma oferta pendente e a resposta do lead é uma escolha, resolve aqui (sem IA).
 * Devolve null quando a mensagem é outra coisa (aí a IA responde e a oferta continua valendo).
 */
export async function tratarOferta(porta: PortaAgenda, oferta: Oferta | null, texto: string, lead: { nome: string; email?: string | null }): Promise<PassoAgenda | null> {
  if (!ofertaValida(oferta)) return null;

  if (oferta.tipo === "recusou") {
    const r = interpretarRecusa(texto);
    if (r === "consultor") {
      return { texto: "Combinado! Um consultor vai falar com você por aqui para acertar o melhor horário.", oferta: null, passarConsultor: "Nenhum horário oferecido serviu" };
    }
    if (r === "mais") return ofertarHorarios(porta, oferta.depois);
    return null;
  }

  const escolha = interpretarHorario(texto, oferta.slots);
  if (!escolha) return null;
  if ("nenhum" in escolha) {
    return { texto: TEXTO_RECUSOU, oferta: { tipo: "recusou", depois: oferta.slots[oferta.slots.length - 1] ?? null, expira: expiraEm() } };
  }

  const m = await porta.marcar(escolha.slot);
  if (m.ok) {
    const linhas = [
      `Pronto${lead.nome ? `, ${primeiro(lead.nome)}` : ""}! Sua demonstração está marcada para ${rotulo(m.inicio)} (${porta.duracaoMin} min).`,
      m.meet_url ? `Link do Google Meet: ${m.meet_url}` : "",
      lead.email ? "O convite também foi para o seu e-mail." : "",
      "Se precisar remarcar, é só me avisar por aqui.",
    ].filter(Boolean);
    return { texto: linhas.join("\n"), oferta: null, agendou: { inicio: m.inicio, meet_url: m.meet_url, reuniao_id: m.reuniao_id, simulado: m.simulado } };
  }
  if (m.conflito) {
    const novo = await ofertarHorarios(porta);
    return { ...novo, texto: novo.oferta ? `Esse horário acabou de ser ocupado. ${novo.texto}` : novo.texto };
  }
  return {
    texto: `Não consegui marcar agora por um problema na agenda. Vou pedir para um consultor confirmar com você o horário de ${rotulo(escolha.slot)}.`,
    oferta: null, passarConsultor: `Falha ao marcar na agenda: ${m.erro}`,
  };
}
