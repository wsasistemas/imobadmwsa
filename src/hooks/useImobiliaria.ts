import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Imobiliaria } from "@/types";
import { toast } from "sonner";

export function useImobiliaria(id: string | undefined) {
  return useQuery({
    queryKey: ["imobiliaria", id] as const,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imobiliarias")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Imobiliaria | null;
    },
  });
}

export function useUpdateImobiliaria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Imobiliaria> & { id: string }) => {
      const { data, error } = await supabase
        .from("imobiliarias")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Imobiliaria;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["imobiliaria", data.id] });
      toast.success("Perfil da imobiliária atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
