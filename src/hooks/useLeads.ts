import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types";
import { toast } from "sonner";

const KEY = ["leads"] as const;

export function useLeads() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
  });
}

export type LeadInput = Partial<Lead> & { nome: string; imobiliaria_id: string };

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadInput) => {
      const { data, error } = await supabase.from("leads").insert(input).select().single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Lead cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["lead", data.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Lead excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
