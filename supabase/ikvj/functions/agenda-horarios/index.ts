// agenda-horarios — horários livres da página pública /agendar/<token>. verify_jwt = false: a proteção é o token com validade.
// Nunca devolve e-mail de vendedor, id de agenda nem token: só início e fim de cada horário.
import { admin, cors, json } from "../_shared/asaas.ts";
import { abrirToken, appGoogle, horariosLivres } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const corpo = await req.json().catch(() => ({}));
  const db = admin();
  const a = await abrirToken(db, corpo.token);
  if (!a.ok) return a.res;

  const app = appGoogle();
  const horarios = app ? await horariosLivres(db, app, a.c) : [];
  return json({
    ok: true,
    nome: a.c.nome.trim().split(/\s+/)[0] ?? "",
    duracao_min: a.c.config.duracao_min,
    minha: a.c.minha,
    horarios: horarios.map((h) => ({ inicio: h.inicio, fim: h.fim })),
  });
});
