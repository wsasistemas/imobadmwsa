import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, CalendarDays, List } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VisitaFormDialog } from "@/components/visitas/VisitaFormDialog";
import { VisitasCalendar } from "@/components/visitas/VisitasCalendar";
import { VisitasList } from "@/components/visitas/VisitasList";
import { useVisitas, useVisitasRealtime } from "@/hooks/useVisitas";
import { useLeads } from "@/hooks/useLeads";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import { useCorretores } from "@/hooks/useCorretores";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_VISITA } from "@/lib/visitasMeta";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});

function AgendaPage() {
  const { usuario } = useAuth();
  useVisitasRealtime(usuario?.imobiliariaId);
  const { data: visitas, isLoading } = useVisitas();
  const { data: leads } = useLeads();
  const { data: empreendimentos } = useEmpreendimentos();
  const { data: corretores } = useCorretores();
  const isGestor = usuario?.role === "gestor";

  const [fCorretor, setFCorretor] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const filtered = useMemo(() => {
    return (visitas ?? []).filter((v) => {
      if (fCorretor !== "all" && v.corretor_id !== fCorretor) return false;
      if (fStatus !== "all" && v.status !== fStatus) return false;
      if (selectedDay) {
        const d = new Date(v.data_hora);
        if (d.toDateString() !== selectedDay.toDateString()) return false;
      }
      return true;
    });
  }, [visitas, fCorretor, fStatus, selectedDay]);

  const leadsById = useMemo(() => new Map((leads ?? []).map((l) => [l.id, l])), [leads]);
  const empById = useMemo(() => new Map((empreendimentos ?? []).map((e) => [e.id, e])), [empreendimentos]);

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Visitas agendadas com clientes."
        action={
          <VisitaFormDialog
            trigger={<Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nova visita</Button>}
          />
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {isGestor && (
          <Select value={fCorretor} onValueChange={setFCorretor}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Corretor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os corretores</SelectItem>
              {(corretores ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_VISITA.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedDay && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
            Limpar dia ({selectedDay.toLocaleDateString("pt-BR")})
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <Tabs defaultValue="calendario" className="space-y-4">
          <TabsList>
            <TabsTrigger value="calendario"><CalendarDays className="mr-2 h-4 w-4" /> Calendário</TabsTrigger>
            <TabsTrigger value="lista"><List className="mr-2 h-4 w-4" /> Lista</TabsTrigger>
          </TabsList>
          <TabsContent value="calendario" className="space-y-4">
            <VisitasCalendar visitas={filtered} onSelectDay={setSelectedDay} />
            {selectedDay && (
              <VisitasList visitas={filtered} leadsById={leadsById} empreendimentosById={empById} />
            )}
          </TabsContent>
          <TabsContent value="lista">
            <VisitasList visitas={filtered} leadsById={leadsById} empreendimentosById={empById} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
