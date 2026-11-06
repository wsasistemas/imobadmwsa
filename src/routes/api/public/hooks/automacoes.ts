import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/automacoes")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("gerar_automacoes");
        if (error) {
          console.error("[automacoes] rpc error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
