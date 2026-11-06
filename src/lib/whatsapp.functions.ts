import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { META_GRAPH_BASE } from "./whatsappMeta";

const SendInput = z.object({
  conversa_id: z.string().uuid(),
  texto: z.string().min(1).max(4000),
  from_ai: z.boolean().optional().default(false),
});

/** Envia mensagem via Meta Cloud API e registra em mensagens_whatsapp. */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SendInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado");

    const { data: conv, error: convErr } = await supabase
      .from("conversas_whatsapp")
      .select("id, imobiliaria_id, wa_contact_id")
      .eq("id", data.conversa_id)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");

    const { data: cfg } = await supabase
      .from("whatsapp_config")
      .select("phone_number_id, ativo")
      .eq("imobiliaria_id", conv.imobiliaria_id)
      .maybeSingle();
    if (!cfg?.phone_number_id || !cfg.ativo) throw new Error("WhatsApp não configurado/ativo");

    // Envia à Meta
    const res = await fetch(`${META_GRAPH_BASE}/${cfg.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conv.wa_contact_id,
        type: "text",
        text: { body: data.texto },
      }),
    });
    const payload = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) throw new Error(payload?.error?.message ?? `Falha Meta (${res.status})`);
    const waId = payload.messages?.[0]?.id ?? null;

    await supabase.from("mensagens_whatsapp").insert({
      conversa_id: data.conversa_id,
      imobiliaria_id: conv.imobiliaria_id,
      direcao: "outbound",
      conteudo: data.texto,
      tipo: "text",
      wa_message_id: waId,
      from_ai: data.from_ai,
      autor_id: userId,
    });
    await supabase
      .from("conversas_whatsapp")
      .update({ ultima_mensagem: data.texto, ultima_mensagem_at: new Date().toISOString() })
      .eq("id", data.conversa_id);

    return { ok: true, wa_message_id: waId };
  });

const AIInput = z.object({ conversa_id: z.string().uuid() });

/** Gera e envia resposta de IA para uma conversa (últimas 15 mensagens). */
export const aiReplyWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AIInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY ausente");

    const { data: conv } = await supabase
      .from("conversas_whatsapp")
      .select("id, imobiliaria_id, nome_contato")
      .eq("id", data.conversa_id)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: cfg } = await supabase
      .from("whatsapp_config")
      .select("ia_prompt")
      .eq("imobiliaria_id", conv.imobiliaria_id)
      .maybeSingle();

    const { data: msgs } = await supabase
      .from("mensagens_whatsapp")
      .select("direcao, conteudo, created_at")
      .eq("conversa_id", data.conversa_id)
      .order("created_at", { ascending: false })
      .limit(15);

    const history = (msgs ?? [])
      .reverse()
      .map((m) => ({
        role: m.direcao === "inbound" ? "user" : "assistant",
        content: m.conteudo,
      }));

    const systemPrompt =
      cfg?.ia_prompt ??
      "Você é um atendente de uma imobiliária. Seja cordial, qualifique o lead (bairro, orçamento, prazo) e proponha agendar visita. Respostas curtas para WhatsApp.";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...history],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`IA falhou (${aiRes.status}): ${t.slice(0, 200)}`);
    }
    const aiJson = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const texto = aiJson.choices?.[0]?.message?.content?.trim();
    if (!texto) throw new Error("IA retornou vazio");

    // Envia via a mesma rotina de envio
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado");
    const { data: cfg2 } = await supabase
      .from("whatsapp_config")
      .select("phone_number_id")
      .eq("imobiliaria_id", conv.imobiliaria_id)
      .maybeSingle();
    const { data: convFull } = await supabase
      .from("conversas_whatsapp")
      .select("wa_contact_id")
      .eq("id", data.conversa_id)
      .maybeSingle();
    if (!cfg2?.phone_number_id || !convFull?.wa_contact_id) throw new Error("WhatsApp incompleto");

    const send = await fetch(`${META_GRAPH_BASE}/${cfg2.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: convFull.wa_contact_id,
        type: "text",
        text: { body: texto },
      }),
    });
    const sp = (await send.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!send.ok) throw new Error(sp?.error?.message ?? "Falha ao enviar");

    await supabase.from("mensagens_whatsapp").insert({
      conversa_id: data.conversa_id,
      imobiliaria_id: conv.imobiliaria_id,
      direcao: "outbound",
      conteudo: texto,
      tipo: "text",
      wa_message_id: sp.messages?.[0]?.id ?? null,
      from_ai: true,
    });
    await supabase
      .from("conversas_whatsapp")
      .update({ ultima_mensagem: texto, ultima_mensagem_at: new Date().toISOString() })
      .eq("id", data.conversa_id);

    return { ok: true, texto };
  });

const CriarLeadInput = z.object({ conversa_id: z.string().uuid() });

/** Cria um lead vinculado à conversa (se ainda não existir). */
export const criarLeadDaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CriarLeadInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase
      .from("conversas_whatsapp")
      .select("id, imobiliaria_id, lead_id, wa_contact_id, nome_contato")
      .eq("id", data.conversa_id)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    if (conv.lead_id) return { lead_id: conv.lead_id };

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        imobiliaria_id: conv.imobiliaria_id,
        corretor_id: userId,
        nome: conv.nome_contato ?? conv.wa_contact_id,
        telefone: conv.wa_contact_id,
        origem: "whatsapp",
        estagio: "novo_lead",
        score: "novo",
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase
      .from("conversas_whatsapp")
      .update({ lead_id: lead.id })
      .eq("id", conv.id);

    return { lead_id: lead.id };
  });
