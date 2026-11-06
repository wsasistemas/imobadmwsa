import type { StatusEmpreendimento, StatusTipologia } from "@/types";

export const STATUS_EMPREENDIMENTO: {
  value: StatusEmpreendimento;
  label: string;
  color: string;
}[] = [
  { value: "em_lancamento", label: "Em lançamento", color: "bg-blue-500" },
  { value: "em_obras", label: "Em obras", color: "bg-amber-500" },
  { value: "pronto_para_morar", label: "Pronto para morar", color: "bg-emerald-500" },
  { value: "entregue", label: "Entregue", color: "bg-slate-500" },
  { value: "esgotado", label: "Esgotado", color: "bg-rose-500" },
];

export const STATUS_TIPOLOGIA: {
  value: StatusTipologia;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}[] = [
  { value: "disponivel", label: "Disponível", variant: "default" },
  { value: "reservada", label: "Reservada", variant: "secondary" },
  { value: "vendida", label: "Vendida", variant: "destructive" },
  { value: "bloqueada", label: "Bloqueada", variant: "outline" },
];

export function statusEmpreendimentoMeta(s: StatusEmpreendimento) {
  return STATUS_EMPREENDIMENTO.find((x) => x.value === s) ?? STATUS_EMPREENDIMENTO[0];
}
