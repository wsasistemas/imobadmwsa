// atend-simulador — testa a Sophia (Atendimento ONLINE) sem enviar nada a ninguém e sem gravar no Funil de Vendas.
// Só o super admin. Depois de uma conversa com pelo menos 2 mensagens do lead, marca o robô como testado
// (o painel só deixa ligar depois disso). Secrets: LOVABLE_API_KEY; opcional ADM_IA_MODELO.
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";
import { aplicarRegras, chamarIA, type Contexto, type Lead, montarPrompt } from "../_shared/atendimento.ts";

const TEMPERATURAS = new Set(["quente", "morno", "frio"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;

  const corpo = await req.json().catch(() => ({}));
  const mensagens = (Array.isArray(corpo.mensagens) ? corpo.mensagens : [])
    .slice(-40)
    .map((m: { autor?: string; texto?: unknown }) => ({ autor: m.autor === "robo" ? "robo" as const : "lead" as const, texto: String(m.texto ?? "").slice(0, 1000) }))
    .filter((m: { texto: string }) => m.texto.trim());
  if (mensagens.length === 0 || mensagens[mensagens.length - 1].autor !== "lead") return json({ ok: false, erro: "Escreva a mensagem do lead." }, 400);

  const l = corpo.lead ?? {};
  const lead: Lead = {
    nome: String(l.nome ?? "Lead de teste").slice(0, 80),
    empresa: l.empresa ? String(l.empresa).slice(0, 80) : undefined,
    temperatura: TEMPERATURAS.has(l.temperatura) ? l.temperatura : "morno",
    pontuacao: Math.max(0, Math.min(100, Number(l.pontuacao) || 50)),
    sistemas: (Array.isArray(l.sistemas) ? l.sistemas : []).map(String).slice(0, 10),
  };

  const db = admin();
  const { data, error } = await db.rpc("com_srv_atend_contexto");
  if (error) return json({ ok: false, erro: "Não foi possível ler a configuração do robô." }, 500);
  const ctx = data as Contexto;

  try {
    const bruto = await chamarIA(montarPrompt(ctx, lead, corpo.fora_do_horario === true), mensagens);
    const d = aplicarRegras(ctx, lead, bruto, "[link de agendamento]");
    let simulado = false;
    if (mensagens.filter((m: { autor: string }) => m.autor === "lead").length >= 2) {
      await db.rpc("com_srv_atend_simulado");
      simulado = true;
    }
    return json({ ok: true, ...d, simulado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[atend-simulador]", msg.slice(0, 300));
    return json({ ok: false, erro: msg.slice(0, 300) }, 502);
  }
});
