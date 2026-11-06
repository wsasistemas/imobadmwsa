import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CondicaoPagamento } from "@/types";
import { toast } from "sonner";

export function useCondicoesPagamento(empreendimentoId: string | undefined) {
  return useQuery({
    queryKey: ["condicoes", empreendimentoId],
    enabled: !!empreendimentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("condicoes_pagamento")
        .select("*")
        .eq("empreendimento_id", empreendimentoId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CondicaoPagamento[];
    },
  });
}

export function useCreateCondicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<CondicaoPagamento> & {
        nome: string;
        imobiliaria_id: string;
        empreendimento_id: string;
      },
    ) => {
      const { data, error } = await supabase
        .from("condicoes_pagamento")
        .insert(input as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CondicaoPagamento;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["condicoes", data.empreendimento_id] });
      toast.success("Condição adicionada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCondicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; empreendimentoId: string }) => {
      const { error } = await supabase.from("condicoes_pagamento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["condicoes", vars.empreendimentoId] });
      toast.success("Condição removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
