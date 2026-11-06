import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Construtora } from "@/types";
import { toast } from "sonner";

const KEY = ["construtoras"] as const;

export function useConstrutoras() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construtoras")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Construtora[];
    },
  });
}

export function useCreateConstrutora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Construtora> & { nome: string; imobiliaria_id: string }) => {
      const { data, error } = await supabase
        .from("construtoras")
        .insert(input as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Construtora;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Construtora cadastrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateConstrutora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Construtora> & { id: string }) => {
      const { data, error } = await supabase
        .from("construtoras")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Construtora;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Construtora atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteConstrutora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("construtoras").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Construtora removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
