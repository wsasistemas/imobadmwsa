import type { NomeIcone } from "@/components/icones/icone-colorido";

import type { Situacao, SituacaoFatura, Temperatura } from "./api";

export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-11-06" ou ISO completo → "06/11/2026" (sem fuso: datas do banco já são do dia de Brasília). */
export function data(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

export function dataHora(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export const competencia = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function cnpj(v: string | null | undefined): string {
  const s = (v ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v ?? "";
}

export function telefone(v: string | null | undefined): string {
  const s = (v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (s.length === 11) return s.replace(/^(\d{2})(\d)(\d{4})(\d{4})$/, "($1) $2 $3-$4");
  if (s.length === 10) return s.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v ?? "";
}

/** Dias entre hoje (Brasília) e a data: negativo = passado. */
export function diasAte(d: string): number {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function quando(d: string | null): string {
  if (!d) return "—";
  const n = diasAte(d);
  if (n === 0) return "hoje, 00:05";
  if (n === 1) return "amanhã";
  if (n > 1) return `em ${n} dias`;
  return data(d);
}

export type Tom = "ok" | "war" | "err" | "info" | "neu";

export const SITUACAO: Record<Situacao, { rotulo: string; tom: Tom }> = {
  em_dia: { rotulo: "Em dia", tom: "ok" },
  atraso: { rotulo: "Em atraso", tom: "war" },
  suspensa: { rotulo: "Suspensa", tom: "err" },
  cortesia: { rotulo: "Cortesia", tom: "info" },
  cancelada: { rotulo: "Cancelada", tom: "neu" },
};

export const SITUACAO_FATURA: Record<SituacaoFatura, { rotulo: string; tom: Tom }> = {
  a_vencer: { rotulo: "A vencer", tom: "neu" },
  vencida: { rotulo: "Vencida", tom: "war" },
  paga: { rotulo: "Paga", tom: "ok" },
  cancelada: { rotulo: "Cancelada", tom: "neu" },
  estornada: { rotulo: "Estornada", tom: "err" },
};

// ------------------------------------------------------------------ Comercial (Fase 8)
export const TEMPERATURA: Record<Temperatura, { rotulo: string; tom: Tom; icone: NomeIcone; texto: string }> = {
  quente: { rotulo: "Quente", tom: "err", icone: "flat-color-icons:high-priority", texto: "Contato em até 1 hora" },
  morno: { rotulo: "Morno", tom: "war", icone: "flat-color-icons:medium-priority", texto: "Contato em até 24 horas" },
  frio: { rotulo: "Frio", tom: "info", icone: "flat-color-icons:low-priority", texto: "Nutrir e tentar de novo" },
};

export const ORIGEM: Record<string, { rotulo: string; icone: NomeIcone }> = {
  site: { rotulo: "Site", icone: "fluent-color:globe-24" },
  instagram: { rotulo: "Instagram", icone: "logos:instagram-icon" },
  facebook: { rotulo: "Facebook", icone: "logos:facebook" },
  linkedin: { rotulo: "LinkedIn", icone: "logos:linkedin-icon" },
  tiktok: { rotulo: "TikTok", icone: "logos:tiktok-icon" },
  whatsapp: { rotulo: "WhatsApp", icone: "fluent-color:chat-24" },
  manual: { rotulo: "Manual", icone: "fluent-color:person-add-24" },
  importado: { rotulo: "Importado", icone: "flat-color-icons:database" },
};

/** Cor da etapa (coluna `cor` de comercial.etapas) → classe Tailwind da barra e tom do selo. */
export const COR_ETAPA: Record<string, { barra: string; tom: Tom }> = {
  info: { barra: "bg-info", tom: "info" },
  primary: { barra: "bg-primary", tom: "info" },
  abobora: { barra: "bg-abobora", tom: "war" },
  warning: { barra: "bg-warning", tom: "war" },
  success: { barra: "bg-success", tom: "ok" },
  muted: { barra: "bg-muted-foreground", tom: "neu" },
};

/** "há 35 min", "há 2 h", "ontem", "há 3 dias". */
export function ha(d: string | null | undefined): string {
  if (!d) return "—";
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

/** Nome de pergunta do formulário da Meta ("qual_o_seu_prazo?") em texto legível. */
export const pergunta = (k: string) => {
  const t = k.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Etiqueta do sistema = nome do schema no Supabase (o mesmo que aparece em Database → Schemas). */
export const nomeSistema = (app: string) => app;

/** Texto do histórico (adm.eventos) em português simples. */
export function textoEvento(tipo: string, d: Record<string, unknown>): string {
  switch (tipo) {
    case "situacao": return `Situação: ${SITUACAO[d.de as Situacao]?.rotulo ?? d.de} → ${SITUACAO[d.para as Situacao]?.rotulo ?? d.para}`;
    case "empresa_criada": return "Empresa cadastrada";
    case "vinculo": return `Sistema ${nomeSistema(String(d.app ?? ""))} ${d.ativo === false ? "desligado" : "vinculado/alterado"}`.replace("Sistema  ", "Vínculo ");
    case "fatura_criada": return `Fatura criada (${brl(Number(d.valor))}, vence ${data(String(d.vencimento))})`;
    case "pagamento_manual": return `Pagamento registrado à mão (${d.forma ?? "manual"})`;
    case "prazo": return d.ate ? `Prazo extra até ${data(String(d.ate))}${d.motivo ? ` · ${d.motivo}` : ""}` : "Prazo extra retirado";
    case "suspensao_manual": return `Suspensa à mão${d.motivo ? ` · ${d.motivo}` : ""}`;
    case "suspensao_manual_removida": return "Suspensão manual retirada";
    case "asaas": return `Asaas: ${String(d.evento ?? "").replace("PAYMENT_", "").toLowerCase().replace(/_/g, " ")}`;
    case "aviso": return `Aviso ${String(d.passo ?? "").toUpperCase()} por ${d.canal === "email" ? "e-mail" : "WhatsApp"}${d.ok ? "" : ` (falhou: ${d.erro ?? "erro"})`}`;
    case "asaas_assinatura": return "Assinatura do Asaas criada/atualizada";
    default: return tipo.replace(/_/g, " ");
  }
}
