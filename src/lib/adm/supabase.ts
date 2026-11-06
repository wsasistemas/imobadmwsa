// Cliente do Supabase central (ikvjaowvpvxojvcfwnct), onde estão todos os sistemas WSA.
// O app ainda tem o cliente do Lovable em src/integrations/supabase (gerado, não editar); o ImobAdm usa só este.
// URL e chave publicável são públicas por natureza (vão para o navegador); podem ser trocadas pelas variáveis
// VITE_ADM_SUPABASE_URL e VITE_ADM_SUPABASE_PUBLISHABLE_KEY (Vercel e .env local).
import { createClient } from "@supabase/supabase-js";

export const ADM_SUPABASE_URL: string =
  import.meta.env.VITE_ADM_SUPABASE_URL || "https://ikvjaowvpvxojvcfwnct.supabase.co";
const ADM_SUPABASE_KEY: string =
  import.meta.env.VITE_ADM_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_j4hWbx9_Ovv6q4DgpOJPbQ_3Ar_n3hS";

export const sb = createClient(ADM_SUPABASE_URL, ADM_SUPABASE_KEY, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: true,
    storageKey: "imobadm-auth",
  },
});
