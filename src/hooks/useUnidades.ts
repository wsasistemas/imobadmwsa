import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export type Unidade = Database["public"]["Tables"]["unidades"]["Row"];
export type UnidadeInsert = Database["public"]["Tables"]["unidades"]["Insert"];
export type UnidadeStatus = Database["public"]["Enums"]["unidade_status"];

const key = (empId?: string) => ["unidades", empId ?? "all"] as const;

export function useUnidades(empreendimentoId?: string) {
  return useQuery({
    queryKey: key(empreendimentoId),
    queryFn: async () => {
      let q = supabase.from("unidades").select("*").order("bloco", { ascending: true }).order("andar", { ascending: true }).order("numero", { ascending: true });
      if (empreendimentoId) q = q.eq("empreendimento_id", empreendimentoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Unidade[];
    },
  });
}

export function useUnidadesRealtime(empreendimentoId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!empreendimentoId) return;
    const channel = supabase
      .channel(`unidades:${empreendimentoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "unidades", filter: `empreendimento_id=eq.${empreendimentoId}` },
        (payload) => {
          qc.setQueryData<Unidade[]>(key(empreendimentoId), (prev) => {
            if (!prev) return prev;
            if (payload.eventType === "INSERT") return [...prev, payload.new as Unidade];
            if (payload.eventType === "UPDATE") return prev.map((u) => (u.id === (payload.new as Unidade).id ? (payload.new as Unidade) : u));
            if (payload.eventType === "DELETE") return prev.filter((u) => u.id !== (payload.old as Unidade).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [empreendimentoId, qc]);
}

export function useReservarUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ unidadeId, leadId, horas = 24 }: { unidadeId: string; leadId: string; horas?: number }) => {
      const { data, error } = await supabase.rpc("reservar_unidade", {
        p_unidade_id: unidadeId,
        p_lead_id: leadId,
        p_horas_validade: horas,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      qc.invalidateQueries({ queryKey: ["reservas"] });
      toast.success("Unidade reservada com sucesso");
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        UNIDADE_INDISPONIVEL: "Unidade não está mais disponível",
        UNIDADE_INEXISTENTE: "Unidade inexistente",
      };
      toast.error(map[e.message] ?? e.message);
    },
  });
}

export function useCreateUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnidadeInsert) => {
      const { data, error } = await supabase.from("unidades").insert(input).select().single();
      if (error) throw error;
      return data as Unidade;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      toast.success("Unidade criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<UnidadeInsert> }) => {
      const { data, error } = await supabase.from("unidades").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Unidade;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      toast.success("Unidade atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("unidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      toast.success("Unidade removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkInsertUnidades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: UnidadeInsert[]) => {
      const { data, error } = await supabase.from("unidades").insert(rows).select();
      if (error) throw error;
      return data as Unidade[];
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      toast.success(`${data.length} unidades importadas`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
