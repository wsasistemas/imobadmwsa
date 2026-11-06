/**
 * Reexport do client do Lovable Cloud para manter o import path
 * `@/lib/supabase` conforme o PRD.
 * O arquivo real (auto-gerado) vive em src/integrations/supabase/client.ts
 * e NÃO deve ser editado manualmente.
 */
export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";

import { supabase } from "@/integrations/supabase/client";

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("imobiliarias").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
