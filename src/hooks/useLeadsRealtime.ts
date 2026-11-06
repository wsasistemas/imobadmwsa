import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Assina mudanças na tabela leads e invalida a query. */
export function useLeadsRealtime(imobiliariaId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!imobiliariaId) return;
    const channel = supabase
      .channel(`leads-${imobiliariaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `imobiliaria_id=eq.${imobiliariaId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["leads"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [imobiliariaId, qc]);
}
