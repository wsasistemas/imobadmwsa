import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Building2, TrendingUp, Users, CalendarDays, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useVisitas, useVisitasRealtime } from "@/hooks/useVisitas";
import { ESTAGIOS, ORIGENS } from "@/lib/leadsMeta";
import { statusMeta } from "@/lib/visitasMeta";
import { formatDateTime, cn } from "@/lib/utils";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const PIE_COLORS = ["#1e3a8a", "#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#eab308", "#6b7280"];

function DashboardPage() {
  const { usuario } = useAuth();
  useVisitasRealtime(usuario?.imobiliariaId);
  const { data: leads = [] } = useLeads();
  const { data: visitas = [] } = useVisitas();

  const kpis = useMemo(() => {
    const ativos = leads.filter((l) => l.estagio !== "fechado_ganho" && l.estagio !== "fechado_perdido").length;
    const quentes = leads.filter((l) => l.score === "quente").length;
    const now = new Date();
    const in7 = new Date(now); in7.setDate(now.getDate() + 7);
    const visitasSemana = visitas.filter((v) => {
      const d = new Date(v.data_hora);
      return d >= now && d <= in7 && v.status !== "cancelada";
    }).length;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const doMes = leads.filter((l) => new Date(l.created_at) >= startMonth);
    const ganhos = doMes.filter((l) => l.estagio === "fechado_ganho").length;
    const conversao = doMes.length ? Math.round((ganhos / doMes.length) * 100) : 0;
    return { ativos, quentes, visitasSemana, conversao };
  }, [leads, visitas]);

  const funil = useMemo(() => {
    return ESTAGIOS.map((e) => ({
      ...e,
      count: leads.filter((l) => l.estagio === e.value).length,
    }));
  }, [leads]);
  const funilMax = Math.max(1, ...funil.map((f) => f.count));

  const proxVisitas = useMemo(() => {
    const now = new Date();
    return visitas
      .filter((v) => new Date(v.data_hora) >= now && v.status !== "cancelada")
      .slice(0, 5);
  }, [visitas]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const origemData = useMemo(() => {
    return ORIGENS.map((o) => ({
      name: o.label,
      value: leads.filter((l) => l.origem === o.value).length,
    })).filter((x) => x.value > 0);
  }, [leads]);

  const cards = [
    { label: "Leads ativos", value: kpis.ativos, icon: Users },
    { label: "Leads quentes", value: kpis.quentes, icon: Flame },
    { label: "Visitas (7 dias)", value: kpis.visitasSemana, icon: CalendarDays },
    { label: "Conversão do mês", value: `${kpis.conversao}%`, icon: TrendingUp },
  ];

  return (
    <div>
      <PageHeader
        title={`Olá, ${usuario?.nome?.split(" ")[0] ?? "seja bem-vindo(a)"}`}
        description="Visão geral da sua operação em tempo real."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="card-radius">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{k.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="card-radius lg:col-span-2">
          <CardHeader>
            <CardTitle>Funil de vendas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funil.map((f) => (
              <div key={f.value} className="flex items-center gap-3">
                <div className="w-40 shrink-0 text-sm">{f.label}</div>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className={cn("h-full", f.color)}
                    style={{ width: `${(f.count / funilMax) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right text-sm font-medium">{f.count}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-radius">
          <CardHeader>
            <CardTitle>Próximas visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {proxVisitas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma visita agendada.</p>
            ) : proxVisitas.map((v) => {
              const m = statusMeta(v.status);
              const l = leadsById.get(v.lead_id);
              return (
                <Link
                  key={v.id}
                  to="/leads/$id"
                  params={{ id: v.lead_id }}
                  className="flex items-start gap-2 rounded p-2 -mx-2 hover:bg-accent/40"
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l?.nome ?? "Lead"}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(v.data_hora)}</p>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="card-radius">
          <CardHeader>
            <CardTitle>Leads por origem</CardTitle>
          </CardHeader>
          <CardContent>
            {origemData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={origemData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                      {origemData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-radius">
          <CardHeader>
            <CardTitle>Acesso rápido</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Link to="/leads" className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm hover:bg-accent/40">
              <Users className="h-5 w-5 text-primary" /> Leads
            </Link>
            <Link to="/empreendimentos" className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm hover:bg-accent/40">
              <Building2 className="h-5 w-5 text-primary" /> Empreendimentos
            </Link>
            <Link to="/agenda" className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm hover:bg-accent/40">
              <CalendarDays className="h-5 w-5 text-primary" /> Agenda
            </Link>
            <Link to="/simulador" className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm hover:bg-accent/40">
              <TrendingUp className="h-5 w-5 text-primary" /> Simulador
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
