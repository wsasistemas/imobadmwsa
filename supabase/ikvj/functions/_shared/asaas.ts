// Utilitários compartilhados das Edge Functions do ImobAdm (Asaas). Base: imobdocerias/create-asaas-payment.
// Secrets (prefixo ADM_ para não colidir com os do imobdocerias no mesmo projeto):
//   ADM_ASAAS_API_KEY, ADM_ASAAS_ENVIRONMENT (sandbox | production), ADM_ASAAS_WEBHOOK_TOKEN
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

export function asaasConfig() {
  const apiKey = Deno.env.get("ADM_ASAAS_API_KEY") ?? "";
  const env = Deno.env.get("ADM_ASAAS_ENVIRONMENT") === "production" ? "production" : "sandbox";
  const base = env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  return { apiKey, env, base };
}

export async function asaasFetch(path: string, init: RequestInit = {}) {
  const { apiKey, base } = asaasConfig();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobAdm-WSA",
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* texto puro */ }
  return { ok: res.ok, status: res.status, body };
}

export function erroAsaas(r: { status: number; body: unknown }) {
  const errors = (r.body as { errors?: Array<{ description?: string }> })?.errors;
  return errors?.map((e) => e.description).filter(Boolean).join("; ") || `Erro Asaas (${r.status})`;
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Confere, com o login de quem chamou, se é o super admin da Central de Acessos. */
export async function exigirSuperAdmin(req: Request): Promise<{ ok: true; userId: string; email: string | null } | { ok: false; res: Response }> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { ok: false, res: json({ ok: false, erro: "Sem login." }, 401) };
  const cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u, error: eu } = await cliente.auth.getUser();
  if (eu || !u?.user) return { ok: false, res: json({ ok: false, erro: "Login inválido." }, 401) };
  const { data: sou, error } = await cliente.rpc("pa_sou_super_admin");
  if (error || sou !== true) return { ok: false, res: json({ ok: false, erro: "Somente o super admin." }, 403) };
  return { ok: true, userId: u.user.id, email: u.user.email ?? null };
}

/** Comparação de tempo constante (token do webhook). */
export function iguais(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}
