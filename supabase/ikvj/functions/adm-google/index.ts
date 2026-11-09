// adm-google — conexão das agendas Google por vendedor e ações da equipe. verify_jwt = false com duas portas (mesmo desenho do adm-meta):
//   1. GET ?code&state: volta do login do Google. Confere o estado assinado, troca o código e guarda o refresh token no Vault.
//   2. POST com o login do super admin: situacao | inicio {retorno, vendedor} | desconectar {agendaId} | ocupados {de, ate}
//      | nova_reuniao {negocioId, inicio, agendaId?}
// Secrets: ADM_GOOGLE_CLIENT_ID, ADM_GOOGLE_CLIENT_SECRET, ADM_APP_URLS. URL de retorno no Google Cloud: <supabase>/functions/v1/adm-google
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";
import { assinarEstado, conferirEstado, origemDeRetorno } from "../_shared/meta.ts";
import {
  appGoogle, criarEvento, emailDoIdToken, ocupadoDasAgendas, revogar, trocarCodigo, urlLogin, urlRetorno, type AgendaToken, type Db,
} from "../_shared/google.ts";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const origens = () => (env("ADM_APP_URLS") || "https://imobwsa.vercel.app,http://localhost:8080,http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
const UUID = /^[0-9a-f-]{36}$/i;
const texto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function voltaDoLogin(url: URL, db: Db): Promise<Response> {
  const app = appGoogle();
  const estado = app ? await conferirEstado(app.segredo, url.searchParams.get("state") ?? "") : null;
  const origem = origemDeRetorno(estado?.r, origens());
  if (!origem) return new Response("Função sem ADM_APP_URLS.", { status: 500 });
  const destino = new URL(`${origem}/google-agenda`);
  const voltar = () => new Response(null, { status: 302, headers: { Location: destino.toString(), "Cache-Control": "no-store" } });
  const erro = (m: string) => { destino.searchParams.set("google_erro", m); return voltar(); };

  if (!app || !estado) return erro("O login demorou demais ou veio de outro lugar. Clique em Conectar de novo.");
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error") || !code) return erro("O login no Google foi cancelado ou as permissões não foram aceitas.");
  try {
    const t = await trocarCodigo(app, code);
    const email = emailDoIdToken(t.id_token);
    if (!t.refresh_token || !email) return erro("O Google não devolveu a autorização completa. Tente de novo.");
    const vendedor = estado.u.includes("|") ? estado.u.split("|")[1] || null : null;
    const { error } = await db.rpc("com_srv_google_gravar", { p_email: email, p_refresh: t.refresh_token, p_vendedor: vendedor });
    if (error) throw new Error(error.message);
    destino.searchParams.set("google_ok", email);
  } catch (e) {
    console.error("[adm-google] login falhou", texto(e));
    return erro("Não foi possível concluir o login no Google. Tente de novo.");
  }
  return voltar();
}

async function agendas(db: Db): Promise<AgendaToken[]> {
  const { data, error } = await db.rpc("com_srv_google_agendas");
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaToken[];
}

async function acao(req: Request, db: Db, corpo: Record<string, unknown>) {
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;
  const a = String(corpo.acao ?? "");
  const app = appGoogle();
  if (a === "situacao") return json({ ok: true, configurado: !!app, retorno_url: urlRetorno() });
  if (!app) return json({ ok: false, erro: "Cadastre os secrets ADM_GOOGLE_CLIENT_ID e ADM_GOOGLE_CLIENT_SECRET." }, 409);

  try {
    if (a === "inicio") {
      const origem = origemDeRetorno(typeof corpo.retorno === "string" ? corpo.retorno : null, origens());
      if (!origem) return json({ ok: false, erro: "Cadastre o secret ADM_APP_URLS (endereço do painel)." }, 409);
      const vendedor = UUID.test(String(corpo.vendedor ?? "")) ? String(corpo.vendedor) : "";
      return json({ ok: true, url: urlLogin(app, await assinarEstado(app.segredo, { u: `${quem.userId}|${vendedor}`, r: origem })) });
    }
    if (a === "desconectar") {
      if (!UUID.test(String(corpo.agendaId ?? ""))) return json({ ok: false, erro: "Agenda inválida." }, 400);
      const { data, error } = await db.rpc("com_srv_google_desligar", { p_agenda: String(corpo.agendaId) });
      if (error) throw new Error(error.message);
      if (data) await revogar(String(data));
      return json({ ok: true });
    }
    if (a === "ocupados") {
      const de = new Date(String(corpo.de)), ate = new Date(String(corpo.ate));
      if (!Number.isFinite(de.getTime()) || !Number.isFinite(ate.getTime())) return json({ ok: false, erro: "Período inválido." }, 400);
      const lista = await agendas(db);
      const ocupado = await ocupadoDasAgendas(db, app, lista, de, ate);
      return json({ ok: true, ocupados: ocupado.flatMap((o) => o.ocupado.map((p) => ({ ...p, agenda: lista.find((x) => x.id === o.id)?.calendar_id ?? "" }))), agendas_lidas: ocupado.length, agendas_total: lista.length });
    }
    if (a === "nova_reuniao") {
      const negocio = String(corpo.negocioId ?? "");
      const inicio = new Date(String(corpo.inicio));
      if (!UUID.test(negocio) || !Number.isFinite(inicio.getTime())) return json({ ok: false, erro: "Informe o lead e o horário." }, 400);
      const lista = await agendas(db);
      if (lista.length === 0) return json({ ok: false, erro: "Conecte uma agenda em Configurações › Google Agenda." }, 409);
      const ate = new Date(inicio.getTime() + 4 * 3_600_000);
      const ocupado = await ocupadoDasAgendas(db, app, lista, inicio, ate);
      const { data: cfg } = await db.rpc("com_agenda_duracao");
      const fim = inicio.getTime() + Number(cfg ?? 30) * 60_000;
      const livres = ocupado.filter((o) => !o.ocupado.some((p) => new Date(p.inicio).getTime() < fim && new Date(p.fim).getTime() > inicio.getTime())).map((o) => o.id);
      if (livres.length === 0) return json({ ok: false, erro: "Nenhuma agenda está livre nesse horário." }, 409);

      const { data, error } = await db.rpc("com_srv_agenda_reservar_equipe", { p_negocio: negocio, p_inicio: inicio.toISOString(), p_agendas: livres });
      if (error) throw new Error(error.message);
      const r = data as { ok: boolean; reuniao_id: string; calendar_id: string; refresh_token: string; inicio: string; fim: string; criar_meet: boolean };
      if (!r.ok) return json({ ok: false, erro: "Nenhuma agenda está livre nesse horário." }, 409);
      try {
        const ev = await criarEvento(app, r.refresh_token, r.calendar_id, {
          titulo: String(corpo.titulo || "Reunião WSA"), descricao: "Reunião marcada pela equipe no ImobAdm.", inicio: r.inicio, fim: r.fim,
          convidado: typeof corpo.email === "string" && corpo.email ? corpo.email : null, meet: r.criar_meet, idPedido: r.reuniao_id,
        });
        await db.rpc("com_srv_agenda_confirmar", { p_reuniao: r.reuniao_id, p_evento: ev.id, p_meet: ev.meet ?? "" });
        return json({ ok: true, reuniao_id: r.reuniao_id, meet_url: ev.meet });
      } catch (e) {
        await db.rpc("com_srv_agenda_soltar", { p_reuniao: r.reuniao_id });
        throw e;
      }
    }
    return json({ ok: false, erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("[adm-google]", a, texto(e));
    return json({ ok: false, erro: texto(e) }, 502);
  }
}

Deno.serve(async (req) => {
  const db = admin();
  if (req.method === "GET") return voltaDoLogin(new URL(req.url), db);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  return acao(req, db, await req.json().catch(() => ({})));
});
