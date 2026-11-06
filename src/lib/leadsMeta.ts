import type { EstagioFunil, LeadScore, OrigemLead, TipoAtividade } from "@/types";

export const ESTAGIOS: { value: EstagioFunil; label: string; color: string }[] = [
  { value: "novo_lead", label: "Novo lead", color: "bg-slate-500" },
  { value: "em_qualificacao", label: "Em qualificação", color: "bg-blue-500" },
  { value: "qualificado", label: "Qualificado", color: "bg-indigo-500" },
  { value: "proposta_enviada", label: "Proposta enviada", color: "bg-violet-500" },
  { value: "visita_agendada", label: "Visita agendada", color: "bg-amber-500" },
  { value: "em_negociacao", label: "Em negociação", color: "bg-orange-500" },
  { value: "fechado_ganho", label: "Fechado ganho", color: "bg-emerald-600" },
  { value: "fechado_perdido", label: "Fechado perdido", color: "bg-rose-600" },
];

export const SCORES: { value: LeadScore; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "frio", label: "Frio" },
  { value: "morno", label: "Morno" },
  { value: "quente", label: "Quente" },
  { value: "perdido", label: "Perdido" },
  { value: "fechado", label: "Fechado" },
];

export const ORIGENS: { value: OrigemLead; label: string }[] = [
  { value: "site", label: "Site" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google_ads", label: "Google Ads" },
  { value: "indicacao", label: "Indicação" },
  { value: "portal", label: "Portal" },
  { value: "outro", label: "Outro" },
];

export const TIPOS_ATIVIDADE: { value: TipoAtividade; label: string }[] = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "visita", label: "Visita" },
  { value: "reuniao", label: "Reunião" },
  { value: "nota", label: "Nota" },
];

export function scoreVariant(s: LeadScore): "default" | "secondary" | "destructive" | "outline" {
  if (s === "quente" || s === "fechado") return "default";
  if (s === "morno") return "secondary";
  if (s === "perdido") return "destructive";
  return "outline";
}
