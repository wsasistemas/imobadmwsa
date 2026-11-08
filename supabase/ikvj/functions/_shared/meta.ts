// Conexão com o Facebook e o Instagram (Lead Ads) do ImobAdm. Adaptado de _shared/redes/meta.ts do Imobimoveis
// (mesmo app e mesmas regras: estado assinado no login, token de longa duração, appsecret_proof em toda chamada).
// Um app da Meta da WSA; app id/secret ficam nos secrets ADM_META_APP_ID / ADM_META_APP_SECRET.

export interface AppMeta {
  appId: string;
  appSecret: string;
  configId?: string | null;   // Facebook Login for Business (opcional; sem ele usa `scope`)
  versao: string;
  redirectUri: string;
}

// pages_manage_ads: a Graph exige para listar /{page}/leadgen_forms (erro #200 sem ela).
export const PERMISSOES_META = ["leads_retrieval", "pages_manage_ads", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "business_management"];
export const VERSAO_PADRAO = "v23.0";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();

export function appMeta(): AppMeta | null {
  const appId = env("ADM_META_APP_ID");
  const appSecret = env("ADM_META_APP_SECRET");
  const base = env("SUPABASE_URL");
  if (!appId || !appSecret || !base) return null;
  return {
    appId, appSecret,
    configId: env("ADM_META_CONFIG_ID") || null,
    versao: env("ADM_META_GRAPH_VERSION") || VERSAO_PADRAO,
    redirectUri: `${base.replace(/\/$/, "")}/functions/v1/adm-meta`,
  };
}

// ---------------------------------------------------------------- estado assinado do login
export interface Estado { u: string; r: string; e: number; n: string }

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64url(t: string): Uint8Array {
  const s = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export async function hmac(chave: string, texto: string | Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof texto === "string" ? enc.encode(texto) : texto));
}
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function iguaisBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a[i]! ^ b[i]!;
  return d === 0;
}

const VALIDADE_MS = 10 * 60_000;

export async function assinarEstado(segredo: string, dados: { u: string; r: string }, agora = Date.now()): Promise<string> {
  const n = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const corpo = b64url(enc.encode(JSON.stringify({ ...dados, e: agora + VALIDADE_MS, n })));
  return `${corpo}.${b64url(await hmac(`imobadm-meta-estado:${segredo}`, corpo))}`;
}

export async function conferirEstado(segredo: string, estado: string, agora = Date.now()): Promise<Estado | null> {
  const [corpo, ass, sobra] = (estado ?? "").split(".");
  if (!corpo || !ass || sobra !== undefined || estado.length > 2000) return null;
  try {
    if (!iguaisBytes(deB64url(ass), await hmac(`imobadm-meta-estado:${segredo}`, corpo))) return null;
    const e = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as Estado;
    if (typeof e.u !== "string" || typeof e.r !== "string" || typeof e.e !== "number") return null;
    return e.e > agora ? e : null;
  } catch {
    return null;
  }
}

/** Para onde a pessoa volta depois do login: só uma origem da lista permitida (secret ADM_APP_URLS). */
export function origemDeRetorno(pedida: string | null | undefined, permitidas: string[]): string | null {
  const limpa = (u: string) => {
    try {
      const x = new URL(u.trim());
      return x.protocol === "https:" || x.hostname === "localhost" || x.hostname === "127.0.0.1" ? x.origin : null;
    } catch {
      return null;
    }
  };
  const lista = permitidas.map(limpa).filter((x): x is string => !!x);
  const p = pedida ? limpa(pedida) : null;
  return (p && lista.includes(p) ? p : lista[0]) ?? null;
}

export function urlLogin(app: AppMeta, estado: string): string {
  const u = new URL(`https://www.facebook.com/${app.versao}/dialog/oauth`);
  u.searchParams.set("client_id", app.appId);
  u.searchParams.set("redirect_uri", app.redirectUri);
  u.searchParams.set("state", estado);
  u.searchParams.set("response_type", "code");
  if (app.configId) u.searchParams.set("config_id", app.configId);
  else u.searchParams.set("scope", PERMISSOES_META.join(","));
  return u.toString();
}

// ---------------------------------------------------------------- Graph API
export class ErroMeta extends Error {
  constructor(message: string, readonly codigo: number | null, readonly status: number) { super(message); }
}

/** 190/102 = token inválido ou vencido; 10 e 200-299 = permissão. */
export function tokenPerdido(e: unknown) {
  return e instanceof ErroMeta && (e.codigo === 190 || e.codigo === 102 || e.codigo === 10 || (e.codigo !== null && e.codigo >= 200 && e.codigo <= 299));
}

interface Chamada { metodo?: "GET" | "POST" | "DELETE"; token?: string; params?: Record<string, string> }

export async function graph<T>(app: AppMeta, caminho: string, c: Chamada = {}): Promise<T> {
  const u = new URL(caminho.startsWith("https://") ? caminho : `https://graph.facebook.com/${app.versao}/${caminho.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(c.params ?? {})) u.searchParams.set(k, v);
  if (c.token) {
    u.searchParams.set("access_token", c.token);
    u.searchParams.set("appsecret_proof", hex(await hmac(app.appSecret, c.token)));
  }
  const r = await fetch(u.toString(), { method: c.metodo ?? "GET" });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const err = corpo.error as { message?: string; code?: number } | undefined;
  if (!r.ok || err) throw new ErroMeta(String(err?.message ?? `Graph API respondeu ${r.status}`).slice(0, 300), err?.code ?? null, r.status);
  return corpo as T;
}

async function todas<T>(app: AppMeta, caminho: string, c: Chamada, maxPaginas = 10): Promise<T[]> {
  const itens: T[] = [];
  let r = await graph<{ data?: T[]; paging?: { next?: string } }>(app, caminho, c);
  for (let i = 0; ; i += 1) {
    itens.push(...(r.data ?? []));
    const prox = r.paging?.next;
    if (!prox || i + 1 >= maxPaginas || !prox.startsWith("https://graph.facebook.com/")) break;
    r = await graph(app, prox, { token: c.token });
  }
  return itens;
}

export async function trocarCodigo(app: AppMeta, codigo: string): Promise<string> {
  const curto = await graph<{ access_token: string }>(app, "oauth/access_token", {
    params: { client_id: app.appId, client_secret: app.appSecret, redirect_uri: app.redirectUri, code: codigo },
  });
  const longo = await graph<{ access_token: string }>(app, "oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: curto.access_token },
  });
  return longo.access_token;
}

export interface PaginaMeta { id: string; nome: string; token: string; instagramId: string | null; instagramNome: string | null; podeLeads: boolean }

export async function listarPaginas(app: AppMeta, tokenUsuario: string): Promise<PaginaMeta[]> {
  const brutas = await todas<{ id: string; name?: string; access_token?: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string } }>(
    app, "me/accounts", { token: tokenUsuario, params: { fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100" } },
  );
  return brutas.filter((p) => p.id && p.access_token).map((p) => ({
    id: p.id, nome: p.name ?? p.id, token: p.access_token!,
    instagramId: p.instagram_business_account?.id ?? null,
    instagramNome: p.instagram_business_account?.username ? `@${p.instagram_business_account.username}` : null,
    podeLeads: !p.tasks || p.tasks.some((t) => t === "MANAGE" || t === "ADVERTISE"),
  }));
}

export async function assinarPagina(app: AppMeta, paginaId: string, tokenPagina: string): Promise<boolean> {
  const r = await graph<{ success?: boolean }>(app, `${encodeURIComponent(paginaId)}/subscribed_apps`, {
    metodo: "POST", token: tokenPagina, params: { subscribed_fields: "leadgen" },
  });
  return r.success === true;
}

export async function desassinarPagina(app: AppMeta, paginaId: string, tokenPagina: string): Promise<void> {
  await graph(app, `${encodeURIComponent(paginaId)}/subscribed_apps`, { metodo: "DELETE", token: tokenPagina });
}

export async function listarFormularios(app: AppMeta, paginaId: string, tokenPagina: string) {
  const brutos = await todas<{ id: string; name?: string; status?: string }>(app, `${encodeURIComponent(paginaId)}/leadgen_forms`, {
    token: tokenPagina, params: { fields: "id,name,status", limit: "100" },
  });
  return brutos.filter((f) => f.id).map((f) => ({ id: f.id, nome: f.name ?? f.id, situacao: f.status ?? "" }));
}

/** Confere se a conexão funciona: o token lê a página e o app segue assinado com "leadgen". Nunca lança. */
export async function conferirConexao(app: AppMeta, paginaId: string, tokenPagina: string): Promise<{ valido: boolean; detalhe: string | null }> {
  try {
    const a = await graph<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(app, `${encodeURIComponent(paginaId)}/subscribed_apps`, { token: tokenPagina });
    const nossa = (a.data ?? []).find((x) => x.id === app.appId);
    if (!nossa || !(nossa.subscribed_fields ?? []).includes("leadgen")) {
      return { valido: true, detalhe: "O app não está mais assinado na página: os leads não vão chegar. Conecte de novo." };
    }
    return { valido: true, detalhe: null };
  } catch (e) {
    return { valido: !tokenPerdido(e), detalhe: e instanceof Error ? e.message : String(e) };
  }
}

/** Lê o lead (GET /{leadgen_id}) e devolve os campos no formato do comercial.receber_lead. */
export async function lerLead(app: AppMeta, leadgenId: string, tokenPagina: string) {
  const l = await graph<{ id: string; created_time?: string; form_id?: string; platform?: string; campaign_name?: string; ad_name?: string;
    field_data?: { name: string; values?: string[] }[] }>(app, encodeURIComponent(leadgenId), {
    token: tokenPagina, params: { fields: "id,created_time,form_id,platform,campaign_name,ad_name,field_data" },
  });
  const campos: Record<string, string> = {};
  for (const f of l.field_data ?? []) campos[f.name.toLowerCase()] = (f.values ?? []).join(", ");
  const nome = campos.full_name || [campos.first_name, campos.last_name].filter(Boolean).join(" ") || campos.nome || "";
  const conhecidos = new Set(["full_name", "first_name", "last_name", "nome", "email", "phone_number", "telefone", "whatsapp", "company_name", "empresa", "job_title", "cargo"]);
  const outras = Object.fromEntries(Object.entries(campos).filter(([k]) => !conhecidos.has(k)));
  const extras = Object.entries(outras).map(([k, v]) => `${k}: ${v}`).join("\n");
  return {
    plataforma: (l.platform ?? "").toLowerCase() === "ig" ? "instagram" : "facebook",
    dados: {
      nome, email: campos.email ?? "", telefone: campos.phone_number || campos.telefone || campos.whatsapp || "",
      empresa: campos.company_name || campos.empresa || "", cargo: campos.job_title || campos.cargo || "",
      campanha: [l.campaign_name, l.ad_name].filter(Boolean).join(" · "), mensagem: extras,
      respostas: outras, // perguntas personalizadas do formulário, uma a uma (aparecem na ficha e entram na classificação)
      consentimento: true,
    } as Record<string, unknown>,
  };
}
