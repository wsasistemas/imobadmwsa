import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function supabaseFor(ctx: ToolContext) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads da imobiliária do usuário autenticado. Suporta filtros opcionais por estágio do funil, score e limite de resultados.",
  inputSchema: {
    estagio: z
      .enum([
        "novo_lead",
        "em_qualificacao",
        "qualificado",
        "proposta_enviada",
        "visita_agendada",
        "em_negociacao",
        "fechado_ganho",
        "fechado_perdido",
      ])
      .optional()
      .describe("Filtra por estágio do funil."),
    score: z
      .enum(["novo", "frio", "morno", "quente", "perdido", "fechado"])
      .optional()
      .describe("Filtra por score do lead."),
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estagio, score, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    let q = supabaseFor(ctx)
      .from("leads")
      .select("id, nome, email, telefone, origem, score, estagio, ultima_interacao, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (estagio) q = q.eq("estagio", estagio);
    if (score) q = q.eq("score", score);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
