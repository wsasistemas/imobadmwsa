import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsappRealtime(imobiliariaId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!imobiliariaId) return;
    const ch = supabase
      .channel(`wa-${imobiliariaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas_whatsapp", filter: `imobiliaria_id=eq.${imobiliariaId}` },
        () => qc.invalidateQueries({ queryKey: ["wa-conversas"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mensagens_whatsapp", filter: `imobiliaria_id=eq.${imobiliariaId}` },
        () => qc.invalidateQueries({ queryKey: ["wa-mensagens"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [imobiliariaId, qc]);
}
