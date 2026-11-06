// adm-meta — conexão das páginas da WSA no Facebook/Instagram para receber os leads do Lead Ads.
// verify_jwt = false com duas portas (mesmo desenho do imobimoveis-meta):
//   1. GET ?code&state: volta do login do Facebook. Confere o estado assinado (pessoa + validade de 10 min), troca o
//      código pelo token de longa duração, guarda-o 30 min no Vault (sessão) e volta para a tela com ?meta_sessao=<id>.
//   2. POST com o login do super admin:
//      situacao | inicio {retorno} | paginas {sessao} | conectar {sessao, paginaId} | formularios {conexaoId}
//      | verificar {conexaoId} | desconectar {conexaoId}
// Secrets: ADM_META_APP_ID, ADM_META_APP_SECRET, ADM_META_VERIFY_TOKEN (webhook), ADM_APP_URLS (origens do painel,
// separadas por vírgula). Opcionais: ADM_META_CONFIG_ID, ADM_META_GRAPH_VERSION.
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";
import {
  appMeta, assinarEstado, assinarPagina, conferirConexao, conferirEstado, desassinarPagina, listarFormularios,
  listarPaginas, origemDeRetorno, tokenPerdido, trocarCodigo, urlLogin, type AppMeta,
} from "../_shared/meta.ts";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const origens = () => (env("ADM_APP_URLS") || "https://imobwsa.vercel.app,http://localhost:8080,http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);
const texto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const UUID = /^[0-9a-f-]{36}$/i;

type Db = ReturnType<typeof admin>;

async function voltaDoLogin(url: URL, db: Db): Promise<Response> {
  const app = appMeta();
  const estado = app ? await conferirEstado(app.appSecret, url.searchParams.get("state") ?? "") : null;
  const origem = origemDeRetorno(estado?.r, origens());
  if (!origem) return new Response("Função sem ADM_APP_URLS.", { status: 500 });
  const destino = new URL(`${origem}/fontes/meta`);
  const voltar = () => new Response(null, { status: 302, headers: { Location: destino.toString(), "Cache-Control": "no-store" } });

  if (!app || !estado) { destino.searchParams.set("meta_erro", "O login demorou demais ou veio de outro lugar. Clique em Conectar de novo."); return voltar(); }
  if (url.searchParams.get("error")) { destino.searchParams.set("meta_erro", "O login no Facebook foi cancelado ou as permissões não foram aceitas."); return voltar(); }
  const codigo = url.searchParams.get("code") ?? "";
  if (!codigo) { destino.searchParams.set("meta_erro", "O Facebook não devolveu o código do login. Tente de novo."); return voltar(); }
  try {
    const token = await trocarCodigo(app, codigo);
    const { data, error } = await db.rpc("com_srv_meta_sessao_criar", { p_usuario: estado.u, p_token: token });
    if (error) throw new Error(error.message);
    destino.searchParams.set("meta_sessao", String(data));
  } catch (e) {
    console.error("[adm-meta] login falhou", texto(e));
    destino.searchParams.set("meta_erro", "Não foi possível concluir o login no Facebook. Tente de novo.");
  }
  return voltar();
}

async function tokenDaSessao(db: Db, usuario: string, sessao: unknown): Promise<string> {
  const id = String(sessao ?? "");
  if (!UUID.test(id)) throw new Error("Sessão de login inválida. Clique em Conectar de novo.");
  const { data, error } = await db.rpc("com_srv_meta_sessao_token", { p_id: id, p_usuario: usuario });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("O login no Facebook venceu (30 minutos). Clique em Conectar de novo.");
  return String(data);
}

async function conexao(db: Db, id: unknown) {
  if (!UUID.test(String(id ?? ""))) throw new Error("Conexão inválida.");
  const { data, error } = await db.rpc("com_srv_meta_conexao_token", { p_conexao: String(id) });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conexão não encontrada.");
  return data as { id: string; page_id: string; token: string | null };
}

async function sincronizar(db: Db, app: AppMeta, conexaoId: string, paginaId: string, token: string) {
  const forms = await listarFormularios(app, paginaId, token);
  const { data, error } = await db.rpc("com_srv_meta_formularios_sincronizar", { p_conexao: conexaoId, p_forms: forms });
  if (error) throw new Error(error.message);
  return Number(data);
}

async function acao(req: Request, db: Db, corpo: Record<string, unknown>) {
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;
  const a = String(corpo.acao ?? "");
  const app = appMeta();

  if (a === "situacao") {
    return json({
      ok: true, configurado: !!app, webhook_configurado: env("ADM_META_VERIFY_TOKEN").length >= 16,
      webhook_url: `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/meta-leadgen-webhook`,
      retorno_url: `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/adm-meta`,
    });
  }
  if (!app) return json({ ok: false, erro: "Cadastre os secrets ADM_META_APP_ID e ADM_META_APP_SECRET (app da Meta da WSA)." }, 409);

  try {
    if (a === "inicio") {
      const origem = origemDeRetorno(typeof corpo.retorno === "string" ? corpo.retorno : null, origens());
      if (!origem) return json({ ok: false, erro: "Cadastre o secret ADM_APP_URLS (endereço do painel)." }, 409);
      return json({ ok: true, url: urlLogin(app, await assinarEstado(app.appSecret, { u: quem.userId, r: origem })) });
    }
    if (a === "paginas") {
      const token = await tokenDaSessao(db, quem.userId, corpo.sessao);
      const paginas = await listarPaginas(app, token);
      return json({ ok: true, paginas: paginas.map(({ token: _t, ...p }) => p) });
    }
    if (a === "conectar") {
      const token = await tokenDaSessao(db, quem.userId, corpo.sessao);
      const pagina = (await listarPaginas(app, token)).find((p) => p.id === String(corpo.paginaId ?? ""));
      if (!pagina) return json({ ok: false, erro: "Página não encontrada entre as que você administra." }, 404);
      const assinada = await assinarPagina(app, pagina.id, pagina.token).catch((e) => { console.error("[adm-meta] assinar", texto(e)); return false; });
      const { data, error } = await db.rpc("com_srv_meta_conexao_gravar", {
        p: { page_id: pagina.id, page_nome: pagina.nome, ig_id: pagina.instagramId, ig_usuario: pagina.instagramNome, assinada },
        p_token: pagina.token, p_usuario: quem.userId,
      });
      if (error) throw new Error(error.message);
      const formularios = await sincronizar(db, app, String(data), pagina.id, pagina.token).catch((e) => { console.error("[adm-meta] formularios", texto(e)); return null; });
      await db.rpc("com_srv_meta_sessao_apagar", { p_id: String(corpo.sessao) });
      return json({ ok: true, conexaoId: data, assinada, formularios });
    }
    if (a === "formularios" || a === "verificar") {
      const c = await conexao(db, corpo.conexaoId);
      if (!c.token) return json({ ok: false, erro: "A conexão está sem token. Conecte de novo." }, 410);
      const conf = await conferirConexao(app, c.page_id, c.token);
      await db.rpc("com_srv_meta_conexao_situacao", { p_conexao: c.id, p_valido: conf.valido, p_detalhe: conf.detalhe });
      if (a === "verificar") return json({ ok: true, ...conf });
      if (!conf.valido) return json({ ok: false, erro: "O Facebook recusou o token desta página. Conecte de novo." }, 410);
      return json({ ok: true, formularios: await sincronizar(db, app, c.id, c.page_id, c.token) });
    }
    if (a === "desconectar") {
      const c = await conexao(db, corpo.conexaoId);
      if (c.token) await desassinarPagina(app, c.page_id, c.token).catch((e) => console.error("[adm-meta] desassinar", texto(e)));
      const { error } = await db.rpc("com_srv_meta_conexao_desligar", { p_conexao: c.id });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }
    return json({ ok: false, erro: `Ação inválida: ${a}` }, 400);
  } catch (e) {
    if (tokenPerdido(e)) return json({ ok: false, erro: "O Facebook recusou o acesso (token vencido ou permissão retirada). Conecte de novo." }, 410);
    return json({ ok: false, erro: texto(e) }, 400);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = admin();
  if (req.method === "GET") return await voltaDoLogin(new URL(req.url), db);
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return await acao(req, db, corpo);
});
