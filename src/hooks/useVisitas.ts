import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Visita } from "@/types";
import { toast } from "sonner";

const KEY = ["visitas"] as const;

export function useVisitas(params?: { leadId?: string; empreendimentoId?: string }) {
  return useQuery({
    queryKey: [...KEY, params ?? {}],
    queryFn: async () => {
      let q = supabase.from("visitas").select("*").order("data_hora", { ascending: true });
      if (params?.leadId) q = q.eq("lead_id", params.leadId);
      if (params?.empreendimentoId) q = q.eq("empreendimento_id", params.empreendimentoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Visita[];
    },
  });
}

export function useCreateVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Visita, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("visitas").insert(input).select().single();
      if (error) throw error;
      return data as Visita;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Visita agendada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Visita> }) => {
      const { data, error } = await supabase.from("visitas").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Visita;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["atividades"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visitas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Visita removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVisitasRealtime(imobiliariaId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!imobiliariaId) return;
    const ch = supabase
      .channel(`visitas-${imobiliariaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitas", filter: `imobiliaria_id=eq.${imobiliariaId}` },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [imobiliariaId, qc]);
}
