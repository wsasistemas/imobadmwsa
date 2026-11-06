import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, TrendingUp, Users, Target, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { useLeads } from "@/hooks/useLeads";
import { useVisitas } from "@/hooks/useVisitas";
import { useEquipe } from "@/hooks/useCorretores";
import { ESTAGIOS, ORIGENS } from "@/lib/leadsMeta";
import { toCSV, downloadCSV } from "@/lib/csv";
import { formatDate } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

const COLORS = ["#1e3a8a", "#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#eab308", "#6b7280"];

function RelatoriosPage() {
  const { data: leads = [] } = useLeads();
  const { data: visitas = [] } = useVisitas();
  const { data: equipe = [] } = useEquipe();

  const [periodo, setPeriodo] = useState<"7" | "30" | "90" | "365" | "all">("30");
  const [corretorId, setCorretorId] = useState<string>("all");

  const { fromDate, leadsF, visitasF } = useMemo(() => {
    const now = new Date();
    const from = periodo === "all" ? null : new Date(now.getTime() - Number(periodo) * 24 * 60 * 60 * 1000);
    const lF = leads.filter((l) => {
      if (from && new Date(l.created_at) < from) return false;
      if (corretorId !== "all" && l.corretor_id !== corretorId) return false;
      return true;
    });
    const vF = visitas.filter((v) => {
      if (from && new Date(v.data_hora) < from) return false;
      if (corretorId !== "all" && v.corretor_id !== corretorId) return false;
      return true;
    });
    return { fromDate: from, leadsF: lF, visitasF: vF };
  }, [leads, visitas, periodo, corretorId]);

  const kpis = useMemo(() => {
    const total = leadsF.length;
    const ganhos = leadsF.filter((l) => l.estagio === "fechado_ganho").length;
    const perdidos = leadsF.filter((l) => l.estagio === "fechado_perdido").length;
    const conversao = total ? Math.round((ganhos / total) * 100) : 0;
    const quentes = leadsF.filter((l) => l.score === "quente").length;
    const visitasReal = visitasF.filter((v) => v.status === "realizada").length;
    return { total, ganhos, perdidos, conversao, quentes, visitasReal };
  }, [leadsF, visitasF]);

  const funil = useMemo(() => {
    return ESTAGIOS.filter((e) => e.value !== "fechado_perdido").map((e) => ({
      estagio: e.label,
      total: leadsF.filter((l) => l.estagio === e.value).length,
    }));
  }, [leadsF]);

  const porOrigem = useMemo(() => {
    return ORIGENS.map((o) => ({
      name: o.label,
      value: leadsF.filter((l) => l.origem === o.value).length,
    })).filter((d) => d.value > 0);
  }, [leadsF]);

  const ranking = useMemo(() => {
    const map = new Map<string, { nome: string; leads: number; ganhos: number; visitas: number }>();
    equipe.forEach((u) => map.set(u.id, { nome: u.nome, leads: 0, ganhos: 0, visitas: 0 }));
    leadsF.forEach((l) => {
      if (!l.corretor_id) return;
      const r = map.get(l.corretor_id);
      if (!r) return;
      r.leads += 1;
      if (l.estagio === "fechado_ganho") r.ganhos += 1;
    });
    visitasF.forEach((v) => {
      if (v.status !== "realizada") return;
      const r = map.get(v.corretor_id);
      if (r) r.visitas += 1;
    });
    return Array.from(map.values())
      .filter((r) => r.leads + r.visitas > 0)
      .sort((a, b) => b.ganhos - a.ganhos || b.leads - a.leads);
  }, [equipe, leadsF, visitasF]);

  const serieTemporal = useMemo(() => {
    const dias = periodo === "all" ? 90 : Math.min(Number(periodo), 90);
    const buckets: { date: string; leads: number; ganhos: number }[] = [];
    const now = new Date();
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ date: key.slice(5), leads: 0, ganhos: 0 });
    }
    leadsF.forEach((l) => {
      const key = new Date(l.created_at).toISOString().slice(0, 10).slice(5);
      const b = buckets.find((x) => x.date === key);
      if (b) {
        b.leads += 1;
        if (l.estagio === "fechado_ganho") b.ganhos += 1;
      }
    });
    return buckets;
  }, [leadsF, periodo]);

  const exportarLeads = () => {
    const corretorMap = new Map(equipe.map((u) => [u.id, u.nome]));
    const rows = leadsF.map((l) => ({
      nome: l.nome,
      email: l.email ?? "",
      telefone: l.telefone ?? "",
      estagio: ESTAGIOS.find((e) => e.value === l.estagio)?.label ?? l.estagio,
      score: l.score,
      origem: l.origem,
      corretor: l.corretor_id ? corretorMap.get(l.corretor_id) ?? "" : "",
      criado_em: formatDate(l.created_at),
      ultima_interacao: l.ultima_interacao ? formatDate(l.ultima_interacao) : "",
    }));
    const csv = toCSV(rows, [
      { key: "nome", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "telefone", label: "Telefone" },
      { key: "estagio", label: "Estágio" },
      { key: "score", label: "Score" },
      { key: "origem", label: "Origem" },
      { key: "corretor", label: "Corretor" },
      { key: "criado_em", label: "Criado em" },
      { key: "ultima_interacao", label: "Última interação" },
    ]);
    downloadCSV(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportarRanking = () => {
    const csv = toCSV(ranking, [
      { key: "nome", label: "Corretor" },
      { key: "leads", label: "Leads" },
      { key: "visitas", label: "Visitas realizadas" },
      { key: "ganhos", label: "Fechados ganhos" },
    ]);
    downloadCSV(`ranking-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={fromDate ? `De ${formatDate(fromDate.toISOString())} até hoje` : "Todo o período"}
        action={
          <Button onClick={exportarLeads} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Exportar leads (CSV)
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>

        <Select value={corretorId} onValueChange={setCorretorId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Corretor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os corretores</SelectItem>
            {equipe.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Leads no período" value={kpis.total} icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Quentes" value={kpis.quentes} icon={<Flame className="h-4 w-4 text-orange-500" />} />
        <KpiCard label="Visitas realizadas" value={kpis.visitasReal} icon={<Target className="h-4 w-4" />} />
        <KpiCard label="Fechados" value={kpis.ganhos} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} />
        <KpiCard label="Conversão" value={`${kpis.conversao}%`} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Funil de conversão</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funil} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="estagio" width={140} />
                <Tooltip />
                <Bar dataKey="total" fill="#1e3a8a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Leads por origem</CardTitle></CardHeader>
          <CardContent className="h-72">
            {porOrigem.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porOrigem} dataKey="value" nameKey="name" outerRadius={90} label>
                    {porOrigem.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Evolução no tempo</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieTemporal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#1e3a8a" strokeWidth={2} />
                <Line type="monotone" dataKey="ganhos" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ranking de corretores</CardTitle>
            <Button size="sm" variant="outline" onClick={exportarRanking}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem atividade da equipe no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Corretor</th>
                      <th className="py-2 text-right">Leads</th>
                      <th className="py-2 text-right">Visitas realizadas</th>
                      <th className="py-2 text-right">Fechados</th>
                      <th className="py-2 text-right">Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r) => (
                      <tr key={r.nome} className="border-t">
                        <td className="py-2 font-medium">{r.nome}</td>
                        <td className="py-2 text-right">{r.leads}</td>
                        <td className="py-2 text-right">{r.visitas}</td>
                        <td className="py-2 text-right">{r.ganhos}</td>
                        <td className="py-2 text-right">{r.leads ? Math.round((r.ganhos / r.leads) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs">{label}</span>
          {icon}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
