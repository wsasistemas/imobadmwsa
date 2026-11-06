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
  name: "create_lead",
  title: "Criar lead",
  description:
    "Cria um novo lead na imobiliária do usuário autenticado. O corretor responsável é o próprio usuário chamador.",
  inputSchema: {
    nome: z.string().trim().min(1).describe("Nome completo do lead."),
    email: z.string().email().optional().describe("E-mail do lead."),
    telefone: z.string().optional().describe("Telefone/WhatsApp do lead."),
    origem: z
      .enum([
        "site",
        "whatsapp",
        "instagram",
        "facebook",
        "google_ads",
        "indicacao",
        "portal",
        "outro",
      ])
      .optional()
      .describe("Origem do lead (padrão: outro)."),
    observacoes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseFor(ctx);
    const userId = ctx.getUserId();
    if (!userId)
      return { content: [{ type: "text", text: "Usuário não identificado" }], isError: true };
    const { data: perfil, error: pErr } = await sb
      .from("usuarios")
      .select("imobiliaria_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr || !perfil?.imobiliaria_id)
      return {
        content: [{ type: "text", text: "Perfil de usuário/imobiliária não encontrado." }],
        isError: true,
      };
    const { data, error } = await sb
      .from("leads")
      .insert({
        nome: input.nome,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        origem: input.origem ?? "outro",
        observacoes: input.observacoes ?? null,
        corretor_id: userId,
        imobiliaria_id: perfil.imobiliaria_id,
        estagio: "novo_lead",
        score: "novo",
        consentimento_lgpd: false,
      } as never)
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Lead criado: ${(data as { id: string }).id}` }],
      structuredContent: { lead: data },
    };
  },
});
