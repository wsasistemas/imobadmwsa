import { Card } from "@/components/ui/card";
import { Users, Flame, CalendarCheck, TrendingUp } from "lucide-react";
import type { Lead } from "@/types";
import type { Atividade } from "@/types";

type Props = {
  leads: Lead[];
  atividades?: Atividade[];
};

export function LeadKpis({ leads, atividades = [] }: Props) {
  const total = leads.length;
  const quentes = leads.filter((l) => l.score === "quente").length;

  const hoje = new Date();
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const fimDia = inicioDia + 24 * 60 * 60 * 1000;
  const visitasHoje = atividades.filter((a) => {
    if (a.tipo !== "visita") return false;
    const t = new Date(a.data).getTime();
    return t >= inicioDia && t < fimDia;
  }).length;

  const fechados = leads.filter((l) => l.estagio === "fechado_ganho").length;
  const conversao = total > 0 ? Math.round((fechados / total) * 100) : 0;

  const items = [
    { label: "Total de leads", value: total, icon: Users, color: "text-primary" },
    { label: "Leads quentes", value: quentes, icon: Flame, color: "text-orange-500" },
    { label: "Visitas hoje", value: visitasHoje, icon: CalendarCheck, color: "text-blue-500" },
    { label: "Conversão", value: `${conversao}%`, icon: TrendingUp, color: "text-emerald-500" },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{it.label}</p>
              <p className="mt-1 text-2xl font-semibold">{it.value}</p>
            </div>
            <it.icon className={`h-8 w-8 ${it.color} opacity-70`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
