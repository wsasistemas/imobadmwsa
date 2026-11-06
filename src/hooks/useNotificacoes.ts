import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TipoNotificacao = "visita_lembrete" | "lead_quente_parado" | "sistema";

export interface Notificacao {
  id: string;
  usuario_id: string;
  imobiliaria_id: string;
  tipo: TipoNotificacao;
  titulo: string;
  descricao: string | null;
  link: string | null;
  referencia_id: string | null;
  lida: boolean;
  lida_em: string | null;
  created_at: string;
}

const KEY = ["notificacoes"] as const;

export function useNotificacoes() {
  const qc = useQueryClient();
  const { usuario } = useAuth();

  const query = useQuery({
    queryKey: KEY,
    enabled: !!usuario?.userId,
    staleTime: 30_000,
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("usuario_id", usuario!.userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notificacao[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!usuario?.userId) return;
    const ch = supabase
      .channel(`notificacoes:${usuario?.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${usuario?.userId}` },
        () => qc.invalidateQueries({ queryKey: KEY })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [usuario?.userId, qc]);

  const marcarLida = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const marcarTodasLidas = useMutation({
    mutationFn: async () => {
      if (!usuario?.userId) return;
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq("usuario_id", usuario?.userId)
        .eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const notificacoes = query.data ?? [];
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return { notificacoes, naoLidas, isLoading: query.isLoading, marcarLida, marcarTodasLidas };
}
