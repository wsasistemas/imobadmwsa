import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tipologia } from "@/types";
import { toast } from "sonner";

export function useTipologias(empreendimentoId: string | undefined) {
  return useQuery({
    queryKey: ["tipologias", empreendimentoId],
    enabled: !!empreendimentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipologias")
        .select("*")
        .eq("empreendimento_id", empreendimentoId!)
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tipologia[];
    },
  });
}

export function useCreateTipologia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Tipologia> & { nome: string; imobiliaria_id: string; empreendimento_id: string }) => {
      const { data, error } = await supabase
        .from("tipologias")
        .insert(input as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Tipologia;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tipologias", data.empreendimento_id] });
      toast.success("Tipologia adicionada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTipologia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; empreendimentoId: string }) => {
      const { error } = await supabase.from("tipologias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tipologias", vars.empreendimentoId] });
      toast.success("Tipologia removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
