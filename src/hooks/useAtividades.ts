import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Atividade } from "@/types";
import { toast } from "sonner";

export function useAtividades(leadId: string | undefined) {
  return useQuery({
    queryKey: ["atividades", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades")
        .select("*")
        .eq("lead_id", leadId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Atividade[];
    },
  });
}

export type AtividadeInput = Omit<Atividade, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export function useCreateAtividade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AtividadeInput) => {
      const { data, error } = await supabase.from("atividades").insert(input).select().single();
      if (error) throw error;
      // atualiza ultima_interacao no lead
      await supabase.from("leads").update({ ultima_interacao: input.data }).eq("id", input.lead_id);
      return data as Atividade;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["atividades", data.lead_id] });
      qc.invalidateQueries({ queryKey: ["lead", data.lead_id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Atividade registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
