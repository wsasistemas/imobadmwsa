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
  name: "list_empreendimentos",
  title: "Listar empreendimentos",
  description: "Lista empreendimentos (lançamentos) disponíveis na imobiliária.",
  inputSchema: {
    status: z
      .enum(["em_lancamento", "em_obras", "pronto_para_morar", "entregue", "esgotado"])
      .optional()
      .describe("Filtra por status."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    let q = supabaseFor(ctx)
      .from("empreendimentos")
      .select(
        "id, nome, status, cidade, estado, valor_a_partir_de, unidades_disponiveis, entrega_prevista",
      )
      .eq("ativo", true)
      .order("nome")
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { empreendimentos: data ?? [] },
    };
  },
});
