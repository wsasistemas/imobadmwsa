import type { StatusVisita } from "@/types";

export const STATUS_VISITA: {
  value: StatusVisita;
  label: string;
  color: string;
  badge: "default" | "secondary" | "destructive" | "outline";
}[] = [
  { value: "agendada", label: "Agendada", color: "bg-blue-500", badge: "secondary" },
  { value: "confirmada", label: "Confirmada", color: "bg-indigo-500", badge: "default" },
  { value: "realizada", label: "Realizada", color: "bg-emerald-600", badge: "default" },
  { value: "cancelada", label: "Cancelada", color: "bg-slate-500", badge: "outline" },
  { value: "nao_compareceu", label: "Não compareceu", color: "bg-rose-600", badge: "destructive" },
];

export function statusMeta(s: StatusVisita) {
  return STATUS_VISITA.find((x) => x.value === s) ?? STATUS_VISITA[0];
}
