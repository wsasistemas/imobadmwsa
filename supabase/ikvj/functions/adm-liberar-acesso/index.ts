// adm-liberar-acesso — cria o login do comprador, dá o acesso à plataforma comprada e envia o e-mail de parabéns.
// Só o super admin. A senha provisória existe só na memória desta função e no e-mail: não vai para tabela nem para log.
// Login que já existe e não tem senha provisória pendente não muda de senha (o login é compartilhado entre os sistemas).
// Secrets: ADM_RESEND_API_KEY, ADM_EMAIL_REMETENTE.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { admin, cors, exigirSuperAdmin, json } from "../_shared/asaas.ts";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function gerarSenha(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const simbolos = "#@!%";
  const b = crypto.getRandomValues(new Uint32Array(14));
  const corpo = Array.from(b.slice(0, 12), (n) => letras[n % letras.length]).join("");
  return `${corpo.slice(0, 6)}${simbolos[b[12]! % simbolos.length]}${corpo.slice(6)}${(b[13]! % 90) + 10}`;
}

function linkLogin(url: string, email: string): string {
  const u = new URL(url.startsWith("http") ? url : `https://${url}`);
  if (u.pathname === "/" || u.pathname === "") u.pathname = "/auth";
  u.searchParams.set("email", email);
  return u.toString();
}

function emailHtml(d: { nome: string; empresa: string; sistema: string; email: string; senha: string | null; link: string }) {
  const nome = esc(d.nome.trim().split(/\s+/)[0] ?? ""), sistema = esc(d.sistema), email = esc(d.email);
  const linha = (r: string, v: string) => `<tr><td style="padding:7px 0;color:#667085;font-size:14px">${r}</td><td style="padding:7px 0;text-align:right;font:700 15px Consolas,monospace;color:#1f2937">${v}</td></tr>`;
  const cred = `<table width="100%" style="background:#eef3fb;border-radius:12px;padding:12px 16px;margin:16px 0">${linha("Login", email)}${d.senha ? linha("Senha provisória", esc(d.senha)) : ""}</table>`;
  const intro = d.senha ? "<p style=\"font-size:15px\">Estes são os seus dados de acesso:</p>" : "";
  const fim = d.senha
    ? "Por segurança, você vai criar uma senha só sua no primeiro acesso. Esta senha provisória vale por 7 dias."
    : "Use a mesma senha que você já tem nos sistemas WSA. Se não lembrar, clique em \"Esqueci minha senha\" na tela de login.";
  return `<div style="background:#eef0f4;padding:20px 10px;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#2f5f9e;color:#fff;padding:28px"><small style="font-weight:700;letter-spacing:1px">WSA SISTEMAS</small><h1 style="font:600 28px Georgia,serif;margin:10px 0 0">Parabéns pela compra do ${sistema}!</h1></div>
    <div style="padding:26px 28px"><p style="font-size:15px">Olá, <b>${nome}</b>!</p>
    <p style="font-size:15px">Seu pagamento foi confirmado e o <b>${sistema}</b> da <b>${esc(d.empresa)}</b> já está pronto para uso.</p>
    ${intro}${cred}
    <a href="${esc(d.link)}" style="display:block;text-align:center;background:#2f5f9e;color:#fff;font-weight:700;font-size:16px;padding:15px;border-radius:10px;text-decoration:none">Acessar o ${sistema}</a>
    <p style="font-size:13px;color:#667085;margin-top:16px">${fim}</p></div>
    <div style="background:#f5f3f0;padding:16px 28px;font-size:12px;color:#667085">WSA Sistemas · Você recebeu este e-mail porque sua empresa contratou o ${sistema}.</div></div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const quem = await exigirSuperAdmin(req);
  if (!quem.ok) return quem.res;

  const corpo = await req.json().catch(() => ({}));
  const vinculo = String(corpo.vinculoId ?? "");
  const semPagamento = corpo.semPagamento === true;
  if (!UUID.test(vinculo)) return json({ ok: false, erro: "Vínculo inválido." }, 400);
  const resend = env("ADM_RESEND_API_KEY"), de = env("ADM_EMAIL_REMETENTE");
  if (!resend || !de) return json({ ok: false, erro: "Cadastre os secrets ADM_RESEND_API_KEY e ADM_EMAIL_REMETENTE." }, 409);

  const db = admin();
  const { data, error } = await db.rpc("adm_srv_acesso_preparar", { p_vinculo: vinculo, p_sem_pagamento: semPagamento });
  if (error) return json({ ok: false, erro: "Não foi possível preparar o acesso." }, 500);
  const p = data as { ok: boolean; erro?: string; empresa: string; sistema: string; app: string; url: string; nome: string; email: string; usuario_id: string | null; senha_pendente: boolean };
  if (!p.ok) return json({ ok: false, erro: p.erro }, 409);

  let usuario = p.usuario_id, senha: string | null = null;
  try {
    if (!usuario) {
      senha = gerarSenha();
      const c = await db.auth.admin.createUser({ email: p.email, password: senha, email_confirm: true, user_metadata: { nome: p.nome } });
      if (c.error || !c.data.user) throw new Error(c.error?.message ?? "Falha ao criar o login.");
      usuario = c.data.user.id;
    } else if (p.senha_pendente) {
      senha = gerarSenha();
      const u = await db.auth.admin.updateUserById(usuario, { password: senha });
      if (u.error) throw new Error(u.error.message);
    }

    const g = await db.rpc("adm_srv_acesso_gravar", { p_vinculo: vinculo, p_usuario: usuario, p_senha_nova: !!senha, p_sem_pagamento: semPagamento, p_autor: quem.email ?? "painel" });
    if (g.error) throw new Error(g.error.message);

    // Permissão na Central de Acessos, com o login do próprio super admin (a função confere isso).
    const central = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } }, auth: { persistSession: false } });
    const perm = await central.rpc("pa_definir_permissao", { p_app: p.app, p_usuario: usuario, p_pode: true });
    if (perm.error) throw new Error(perm.error.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[adm-liberar-acesso]", vinculo, msg.slice(0, 300));
    return json({ ok: false, erro: msg.slice(0, 300) }, 502);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: de, to: [p.email], subject: `Parabéns pela compra do ${p.sistema}! Seu acesso está pronto`,
      html: emailHtml({ nome: p.nome, empresa: p.empresa, sistema: p.sistema, email: p.email, senha, link: linkLogin(p.url, p.email) }) }),
  });
  const b = await res.json().catch(() => ({}));
  await db.rpc("adm_srv_acesso_resultado", { p_vinculo: vinculo, p_ok: res.ok, p_erro: res.ok ? null : String(b?.message ?? `Resend ${res.status}`) });
  if (!res.ok) return json({ ok: false, erro: "Acesso criado, mas o e-mail não saiu. Use Reenviar." }, 502);
  return json({ ok: true, email: p.email, login_novo: !!senha });
});
