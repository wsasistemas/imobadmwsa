import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EXPIRES_IN = 60 * 60 * 24 * 7; // 7 dias

/** Resolve caminhos do bucket "empreendimentos" em URLs assinadas. */
export function useSignedUrls(paths: string[] | undefined | null) {
  const list = (paths ?? []).filter(Boolean);
  return useQuery({
    queryKey: ["signed-urls", list],
    enabled: list.length > 0,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("empreendimentos")
        .createSignedUrls(list, EXPIRES_IN);
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((d, i) => {
        if (d.signedUrl) map.set(list[i], d.signedUrl);
      });
      return map;
    },
  });
}
