// Gera, a partir de docs/politica-de-privacidade.md:
//   docs/privacidade.html  → página pronta (visual do site) para publicar em www.imobsystems.com.br/privacidade
//   supabase/ikvj/functions/politica-privacidade/index.ts → versão em texto servida pelo Supabase (link provisório da Meta)
// Rodar: node scripts/gerar-privacidade.mjs
import { readFileSync, writeFileSync } from "node:fs";

const linhas = readFileSync("docs/politica-de-privacidade.md", "utf8").replace(/\r/g, "").split("\n")
  .filter((l) => !l.startsWith("Endereço sugerido"));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/(wsasistemas\.ia@gmail\.com)/g, '<a href="mailto:$1">$1</a>');

let corpo = "";
let lista = false;
const fechaLista = () => { if (lista) { corpo += "</ul>\n"; lista = false; } };
for (const l of linhas) {
  if (l.startsWith("# ") || l.startsWith("Última atualização") || !l.trim()) { fechaLista(); continue; }
  if (l.startsWith("## ")) { fechaLista(); corpo += `<h2>${esc(l.slice(3))}</h2>\n`; continue; }
  if (l.startsWith("- ")) { if (!lista) { corpo += "<ul>\n"; lista = true; } corpo += `<li>${esc(l.slice(2))}</li>\n`; continue; }
  fechaLista();
  corpo += `<p>${esc(l)}</p>\n`;
}
fechaLista();

const atualizado = (linhas.find((l) => l.startsWith("Última atualização")) ?? "").replace("Última atualização: ", "");

writeFileSync("docs/privacidade.html", `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Política de Privacidade — WSA Sistemas IA</title>
<meta name="description" content="Como a WSA Sistemas IA trata os dados pessoais coletados no site, nos formulários e no atendimento, conforme a LGPD.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
  :root { --primary:#2563EB; --secondary:#EFF6FF; --text:#0F172A; --muted:#64748B; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Inter",system-ui,sans-serif; color:var(--text); background:#fff; line-height:1.65; }
  header { background:var(--secondary); padding:48px 16px 32px; text-align:center; }
  header h1 { font-family:"Space Grotesk",sans-serif; font-size:clamp(1.8rem,4vw,2.6rem); }
  header p { color:var(--muted); margin-top:8px; }
  main { max-width:760px; margin:0 auto; padding:32px 16px 64px; }
  h2 { font-size:1.2rem; margin:32px 0 8px; color:var(--primary); }
  p, li { color:#1E293B; }
  p + p { margin-top:8px; }
  ul { padding-left:22px; margin:8px 0; }
  li { margin:4px 0; }
  a { color:var(--primary); }
  footer { text-align:center; color:var(--muted); font-size:.85rem; padding:24px 16px 40px; border-top:1px solid #E2E8F0; }
</style>
</head>
<body>
<header>
  <h1>Política de Privacidade</h1>
  <p>WSA Sistemas IA · Última atualização: ${atualizado}</p>
</header>
<main>
${corpo}</main>
<footer>© WSA Sistemas IA · <a href="https://www.imobsystems.com.br">www.imobsystems.com.br</a></footer>
</body>
</html>
`);

const texto = linhas.map((l) => (l.startsWith("# ") ? l.slice(2) : l.startsWith("## ") ? `\n${l.slice(3)}` : l)).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
writeFileSync("supabase/ikvj/functions/politica-privacidade/index.ts", `// politica-privacidade — página pública (verify_jwt = false) com a Política de Privacidade da WSA Sistemas IA.
// Usada como URL de privacidade do app da Meta enquanto o site www.imobsystems.com.br não tem /privacidade.
// Gerado por scripts/gerar-privacidade.mjs a partir de docs/politica-de-privacidade.md. O Supabase entrega como texto puro.
const TEXTO = ${JSON.stringify(texto)};

Deno.serve(() => new Response(TEXTO, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }));
`);
console.log("docs/privacidade.html e a função politica-privacidade gerados.");
