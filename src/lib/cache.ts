/**
 * Chaves e TTLs (em segundos) do cache Redis.
 * Consumido apenas por server functions (src/lib/*.functions.ts) — nunca no browser.
 * Fase 0: constantes já disponíveis; a integração Upstash entra na Fase 1.
 */

export const CACHE_KEYS = {
  empreendimentos: (id: string) => `emp:${id}`,
  tipologias: (id: string) => `tip:${id}`,
  tenant: (id: string) => `ten:${id}`,
  leadScore: (id: string) => `lsc:${id}`,
  simulacao: (p: string) => `sim:${p}`,
} as const;

export const CACHE_TTL = {
  empreendimentos: 600,
  tipologias: 600,
  tenant: 3600,
  leadScore: 300,
  simulacao: 1800,
  sessao: 86_400,
} as const;
