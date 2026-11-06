import { createFileRoute } from "@tanstack/react-router";
import { META_GRAPH_BASE } from "@/lib/whatsappMeta";

/**
 * Webhook Meta Cloud API — WhatsApp.
 * GET: verificação (challenge).
 * POST: recebe mensagens, roteia por phone_number_id -> imobiliaria, persiste,
 *       e responde via IA se ia_ativa=true na conversa.
 *
 * NOTA: neste MVP a verificação usa o WHATSAPP_VERIFY_TOKEN global; se você
 * salvou um verify_token por imobiliária em whatsapp_config, atualize aqui.
 */
export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body || typeof body !== "object") return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Estrutura Meta: entry[].changes[].value.{messages,contacts,metadata}
        const entries = (body as { entry?: unknown[] }).entry ?? [];
        for (const entry of entries) {
          const changes = (entry as { changes?: unknown[] }).changes ?? [];
          for (const change of changes) {
            const value = (change as { value?: Record<string, unknown> }).value;
            if (!value) continue;
            const meta = value.metadata as { phone_number_id?: string } | undefined;
            const phoneNumberId = meta?.phone_number_id;
            const messages = (value.messages as Array<Record<string, unknown>> | undefined) ?? [];
            const contacts = (value.contacts as Array<Record<string, unknown>> | undefined) ?? [];
            if (!phoneNumberId || messages.length === 0) continue;

            // Descobre imobiliária
            const { data: cfg } = await supabaseAdmin
              .from("whatsapp_config")
              .select("imobiliaria_id, ia_prompt, ia_default_ativa")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle();
            if (!cfg) continue;

            for (const msg of messages) {
              const from = String(msg.from ?? "");
              const type = String(msg.type ?? "text");
              const waMsgId = String(msg.id ?? "");
              const texto =
                type === "text"
                  ? String((msg.text as { body?: string } | undefined)?.body ?? "")
                  : `[${type}]`;
              const contactName =
                (contacts.find((c) => (c.wa_id as string) === from)?.profile as { name?: string } | undefined)
                  ?.name ?? null;

              // Upsert conversa
              const { data: existing } = await supabaseAdmin
                .from("conversas_whatsapp")
                .select("id, ia_ativa")
                .eq("imobiliaria_id", cfg.imobiliaria_id)
                .eq("wa_contact_id", from)
                .maybeSingle();

              let conversaId: string;
              let iaAtiva: boolean;
              if (existing) {
                conversaId = existing.id as string;
                iaAtiva = existing.ia_ativa as boolean;
                await supabaseAdmin
                  .from("conversas_whatsapp")
                  .update({
                    nome_contato: contactName ?? undefined,
                    ultima_mensagem: texto,
                    ultima_mensagem_at: new Date().toISOString(),
                    nao_lidas: undefined,
                  })
                  .eq("id", conversaId);
                await supabaseAdmin.rpc; // no-op placeholder
                await supabaseAdmin
                  .from("conversas_whatsapp")
                  .update({ nao_lidas: (0) })
                  .eq("id", conversaId);
              } else {
                const { data: nova, error: novaErr } = await supabaseAdmin
                  .from("conversas_whatsapp")
                  .insert({
                    imobiliaria_id: cfg.imobiliaria_id,
                    wa_contact_id: from,
                    nome_contato: contactName,
                    ia_ativa: cfg.ia_default_ativa,
                    ultima_mensagem: texto,
                    ultima_mensagem_at: new Date().toISOString(),
                    nao_lidas: 1,
                  })
                  .select("id, ia_ativa")
                  .single();
                if (novaErr || !nova) continue;
                conversaId = nova.id as string;
                iaAtiva = nova.ia_ativa as boolean;
              }

              await supabaseAdmin.from("mensagens_whatsapp").insert({
                conversa_id: conversaId,
                imobiliaria_id: cfg.imobiliaria_id,
                direcao: "inbound",
                conteudo: texto,
                tipo: type,
                wa_message_id: waMsgId,
                from_ai: false,
              });

              // IA responde
              if (iaAtiva && type === "text") {
                await respondWithAI({
                  conversaId,
                  imobiliariaId: cfg.imobiliaria_id as string,
                  waContact: from,
                  phoneNumberId,
                  systemPrompt: (cfg.ia_prompt as string | null) ?? undefined,
                });
              }
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function respondWithAI(args: {
  conversaId: string;
  imobiliariaId: string;
  waContact: string;
  phoneNumberId: string;
  systemPrompt?: string;
}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!lovableKey || !waToken) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: msgs } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .select("direcao, conteudo")
    .eq("conversa_id", args.conversaId)
    .order("created_at", { ascending: false })
    .limit(15);

  const history = (msgs ?? [])
    .reverse()
    .map((m) => ({
      role: m.direcao === "inbound" ? "user" : "assistant",
      content: m.conteudo as string,
    }));

  const system =
    args.systemPrompt ??
    "Você é um atendente de uma imobiliária. Seja cordial, qualifique o lead (bairro, orçamento, prazo) e proponha agendar visita. Respostas curtas para WhatsApp.";

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: system }, ...history],
    }),
  });
  if (!aiRes.ok) return;
  const aiJson = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const texto = aiJson.choices?.[0]?.message?.content?.trim();
  if (!texto) return;

  const sendRes = await fetch(`${META_GRAPH_BASE}/${args.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: args.waContact,
      type: "text",
      text: { body: texto },
    }),
  });
  const sp = (await sendRes.json().catch(() => ({}))) as { messages?: Array<{ id: string }> };
  if (!sendRes.ok) return;

  await supabaseAdmin.from("mensagens_whatsapp").insert({
    conversa_id: args.conversaId,
    imobiliaria_id: args.imobiliariaId,
    direcao: "outbound",
    conteudo: texto,
    tipo: "text",
    wa_message_id: sp.messages?.[0]?.id ?? null,
    from_ai: true,
  });
  await supabaseAdmin
    .from("conversas_whatsapp")
    .update({ ultima_mensagem: texto, ultima_mensagem_at: new Date().toISOString() })
    .eq("id", args.conversaId);
}
