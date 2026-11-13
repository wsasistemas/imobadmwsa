// Agenda do Google de um lead (pelo token do negócio), no formato que o fluxo da Sophia usa (PortaAgenda).
// Usado pelo webhook (conversa) e pelo cron (boas-vindas de quem pediu demonstração).
import type { PortaAgenda } from "./atend-fluxo.ts";
import { appGoogle, contextoDoToken, horariosLivres, marcarHorario, type Db } from "./google.ts";

export async function agendaDoLead(db: Db, token: string, origem: string): Promise<{ porta: PortaAgenda; email: string | null; minha: { id: string; inicio: string } | null }> {
  const app = appGoogle();
  const c = await contextoDoToken(db, token);
  return {
    email: c?.email ?? null,
    minha: c?.minha ?? null,
    porta: {
      duracaoMin: c?.config.duracao_min ?? 30,
      livres: async () => (app && c ? await horariosLivres(db, app, c) : []),
      marcar: async (inicio) => {
        if (!app || !c) return { ok: false, erro: "Agenda não configurada" };
        const r = await marcarHorario(db, app, token, c, inicio, c.minha?.id ?? null, origem);
        return r.ok ? { ok: true, inicio: r.reuniao.inicio, meet_url: r.reuniao.meet_url, reuniao_id: r.reuniao.id } : { ok: false, erro: r.erro, conflito: r.conflito };
      },
    },
  };
}
