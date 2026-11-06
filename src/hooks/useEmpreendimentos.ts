import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Empreendimento } from "@/types";
import { toast } from "sonner";

const KEY = ["empreendimentos"] as const;

export function useEmpreendimentos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empreendimentos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Empreendimento[];
    },
  });
}

export function useEmpreendimento(id: string | undefined) {
  return useQuery({
    queryKey: ["empreendimento", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empreendimentos")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Empreendimento | null;
    },
  });
}

export type EmpreendimentoInput = Partial<Empreendimento> & {
  nome: string;
  imobiliaria_id: string;
};

export function useCreateEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EmpreendimentoInput) => {
      const { data, error } = await supabase
        .from("empreendimentos")
        .insert(input as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Empreendimento;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Empreendimento cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Empreendimento>;
    }) => {
      const { data, error } = await supabase
        .from("empreendimentos")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Empreendimento;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["empreendimento", data.id] });
      toast.success("Alterações salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empreendimentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Empreendimento removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
