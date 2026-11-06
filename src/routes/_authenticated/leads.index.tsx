import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, LayoutGrid, List as ListIcon, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLeads } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { useLeadsRealtime } from "@/hooks/useLeadsRealtime";
import { LeadFormDialog } from "@/components/leads/LeadFormDialog";
import { LeadKanban } from "@/components/leads/LeadKanban";
import { LeadKpis } from "@/components/leads/LeadKpis";
import { LeadFilters, aplicarFiltros, type FiltrosLead } from "@/components/leads/LeadFilters";
import { ESTAGIOS, scoreVariant } from "@/lib/leadsMeta";
import { formatBRL, formatPhone, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsList,
});

function LeadsList() {
  const { usuario } = useAuth();
  const { data: leads, isLoading } = useLeads();
  useLeadsRealtime(usuario?.imobiliariaId);

  const [filtros, setFiltros] = useState<FiltrosLead>({
    q: "",
    corretor: "all",
    score: "all",
    origem: "all",
    periodo: "all",
  });

  const filtered = aplicarFiltros(leads ?? [], filtros);

  return (
    <div>
      <PageHeader
        title="Leads / CRM"
        description="Funil de vendas, histórico de interações e qualificação."
        action={
          <LeadFormDialog
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo lead
              </Button>
            }
          />
        }
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (leads ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum lead ainda"
          description="Cadastre o primeiro lead para começar a acompanhar o funil de vendas."
          action={
            <LeadFormDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar lead
                </Button>
              }
            />
          }
        />
      ) : (
        <>
          <LeadKpis leads={leads ?? []} />

          <Tabs defaultValue="kanban" className="space-y-4">
            <div className="flex flex-col gap-3">
              <TabsList className="self-start">
                <TabsTrigger value="kanban">
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Kanban
                </TabsTrigger>
                <TabsTrigger value="lista">
                  <ListIcon className="mr-2 h-4 w-4" />
                  Lista
                </TabsTrigger>
              </TabsList>
              <LeadFilters
                filtros={filtros}
                setFiltros={setFiltros}
                mostrarCorretor={usuario?.role === "gestor"}
              />
            </div>

            <TabsContent value="kanban" className="mt-0">
              <LeadKanban leads={filtered} />
            </TabsContent>

            <TabsContent value="lista" className="mt-0">
              <div className="space-y-2">
                {filtered.map((lead) => {
                  const stage = ESTAGIOS.find((s) => s.value === lead.estagio);
                  return (
                    <Card key={lead.id} className="p-4 transition-shadow hover:shadow-md">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <Link
                            to="/leads/$id"
                            params={{ id: lead.id }}
                            className="font-medium hover:underline"
                          >
                            {lead.nome}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {lead.telefone && <span>{formatPhone(lead.telefone)}</span>}
                            {lead.email && <span className="truncate">{lead.email}</span>}
                            <span>Criado {formatDate(lead.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {lead.orcamento_max && (
                            <span className="text-xs text-muted-foreground">
                              até {formatBRL(lead.orcamento_max)}
                            </span>
                          )}
                          <Badge variant={scoreVariant(lead.score)}>{lead.score}</Badge>
                          {stage && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${stage.color}`} />
                              {stage.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum lead encontrado com os filtros atuais.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
