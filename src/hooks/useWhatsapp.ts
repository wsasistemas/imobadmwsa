import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WhatsappConfig {
  id: string;
  imobiliaria_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone: string | null;
  verify_token: string | null;
  ativo: boolean;
  ia_default_ativa: boolean;
  ia_prompt: string | null;
}

export interface Conversa {
  id: string;
  imobiliaria_id: string;
  lead_id: string | null;
  wa_contact_id: string;
  nome_contato: string | null;
  status: "aberta" | "pausada" | "arquivada";
  ia_ativa: boolean;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  nao_lidas: number;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  direcao: "inbound" | "outbound";
  conteudo: string;
  tipo: string;
  from_ai: boolean;
  created_at: string;
}

export function useWhatsappConfig(imobiliariaId: string | undefined) {
  return useQuery({
    queryKey: ["wa-config", imobiliariaId],
    enabled: !!imobiliariaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_config" as never)
        .select("*")
        .eq("imobiliaria_id", imobiliariaId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WhatsappConfig | null;
    },
  });
}

export function useUpsertWhatsappConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<WhatsappConfig> & { imobiliaria_id: string }) => {
      const { data, error } = await supabase
        .from("whatsapp_config" as never)
        .upsert(payload as never, { onConflict: "imobiliaria_id" })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WhatsappConfig;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["wa-config", d.imobiliaria_id] });
      toast.success("Configuração salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useConversas(imobiliariaId: string | undefined) {
  return useQuery({
    queryKey: ["wa-conversas", imobiliariaId],
    enabled: !!imobiliariaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversas_whatsapp" as never)
        .select("*")
        .eq("imobiliaria_id", imobiliariaId!)
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversa[];
    },
  });
}

export function useMensagens(conversaId: string | undefined) {
  return useQuery({
    queryKey: ["wa-mensagens", conversaId],
    enabled: !!conversaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mensagens_whatsapp" as never)
        .select("*")
        .eq("conversa_id", conversaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Mensagem[];
    },
  });
}

export function useToggleIA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase
        .from("conversas_whatsapp" as never)
        .update({ ia_ativa: ativa } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-conversas"] }),
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("conversas_whatsapp" as never)
        .update({ nao_lidas: 0 } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-conversas"] }),
  });
}
