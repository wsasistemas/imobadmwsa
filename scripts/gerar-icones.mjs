// Gera src/components/icones/icones.data.ts com os ícones coloridos (Iconify) embutidos no bundle, sem buscar na
// api.iconify.design em tempo de execução. Mesmo modelo do imobdocerias e do Imobenviomassa.
// Para incluir um ícone: some na lista abaixo e rode `npm run icones`.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Todos os ícones coloridos usados no painel (menu, KPIs, cabeçalhos de cartão). Mesmos do mockup v2.
const ICONES = [
  // menu
  "flat-color-icons:combo-chart", "flat-color-icons:department", "flat-color-icons:money-transfer",
  "flat-color-icons:data-configuration", "fluent-color:shield-checkmark-24", "fluent-color:people-list-24",
  "fluent-color:board-24", "fluent-color:calendar-24", "fluent-color:chart-multiple-24", "logos:meta-icon",
  "fluent-color:person-add-24", "logos:facebook", "logos:linkedin-icon", "logos:tiktok-icon", "fluent-color:clock-24",
  "fluent-color:calendar-sync-24", "fluent-color:lock-shield-24", "flat-color-icons:database", "flat-color-icons:export",
  // telas
  "flat-color-icons:bullish", "flat-color-icons:ok", "fluent-color:warning-24", "flat-color-icons:cancel",
  "flat-color-icons:timeline", "flat-color-icons:calendar", "fluent-color:receipt-24", "fluent-color:send-24",
  "fluent-color:chat-24", "fluent-color:alert-24", "flat-color-icons:lock", "fluent-color:apps-24",
  "fluent-color:link-24", "fluent-color:people-24", "fluent-color:history-24", "flat-color-icons:currency-exchange",
  "fluent-color:building-multiple-24", "fluent-color:building-store-24", "flat-color-icons:plus",
  "flat-color-icons:search", "fluent-color:settings-24", "fluent-color:globe-24", "logos:instagram-icon",
];

const colecoes = new Map();
const dadosDe = (nome) => {
  const [prefixo, icone] = nome.split(":");
  if (!colecoes.has(prefixo)) colecoes.set(prefixo, JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefixo}/icons.json`), "utf8")));
  const c = colecoes.get(prefixo);
  const i = c.icons[icone];
  if (!i) throw new Error(`Ícone não existe: ${nome}`);
  return { body: i.body, width: i.width ?? c.width ?? 16, height: i.height ?? c.height ?? 16 };
};

const usados = [...new Set(ICONES)];
writeFileSync(
  new URL("../src/components/icones/icones.data.ts", import.meta.url),
  `// Gerado por scripts/gerar-icones.mjs (npm run icones). Não edite à mão.
import type { IconifyIcon } from "@iconify/react";

export type NomeIcone =
${usados.map((n) => `  | ${JSON.stringify(n)}`).join("\n")};

export const DADOS_COLORIDOS: Record<NomeIcone, IconifyIcon> = ${JSON.stringify(Object.fromEntries(usados.map((n) => [n, dadosDe(n)])), null, 2)};
`,
);
console.log(`${usados.length} ícones coloridos gravados.`);
