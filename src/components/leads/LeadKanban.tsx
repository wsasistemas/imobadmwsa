import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ESTAGIOS, scoreVariant } from "@/lib/leadsMeta";
import type { Lead } from "@/types";
import { formatBRL, formatPhone, cn } from "@/lib/utils";
import { useUpdateLead } from "@/hooks/useLeads";
import { GripVertical, Flame } from "lucide-react";
import { useState } from "react";
import { MotivoPerdidoDialog } from "./MotivoPerdidoDialog";

const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;

function isQuenteSemInteracao(lead: Lead) {
  if (lead.score !== "quente") return false;
  const ref = lead.ultima_interacao ?? lead.updated_at;
  return Date.now() - new Date(ref).getTime() > DUAS_HORAS_MS;
}

export function LeadKanban({ leads }: { leads: Lead[] }) {
  const update = useUpdateLead();
  const [dragging, setDragging] = useState<string | null>(null);
  const [perdidoOpen, setPerdidoOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const byStage = ESTAGIOS.map((s) => ({
    ...s,
    items: leads.filter((l) => l.estagio === s.value),
  }));

  function handleDrop(colValue: (typeof ESTAGIOS)[number]["value"]) {
    if (!dragging) return;
    if (colValue === "fechado_perdido") {
      setPendingId(dragging);
      setPerdidoOpen(true);
      setDragging(null);
      return;
    }
    update.mutate({
      id: dragging,
      patch: { estagio: colValue, motivo_perdido: null },
    });
    setDragging(null);
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto pb-4 sm:mx-0">
        <div className="flex min-w-max gap-3 px-4 sm:px-0">
          {byStage.map((col) => (
            <div
              key={col.value}
              className="w-72 shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.value)}
            >
              <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-medium">{col.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{col.items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {col.items.map((lead) => {
                  const alerta = isQuenteSemInteracao(lead);
                  return (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragging(lead.id)}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "cursor-grab p-3 transition-shadow hover:shadow-md active:cursor-grabbing",
                        alerta && "animate-pulse border-orange-500 ring-2 ring-orange-500/40",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <Link
                              to="/leads/$id"
                              params={{ id: lead.id }}
                              className="block flex-1 truncate font-medium hover:underline"
                            >
                              {lead.nome}
                            </Link>
                            {alerta && <Flame className="h-3.5 w-3.5 text-orange-500" />}
                          </div>
                          {lead.telefone && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {formatPhone(lead.telefone)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge variant={scoreVariant(lead.score)} className="text-[10px]">
                              {lead.score}
                            </Badge>
                            {lead.orcamento_max && (
                              <span className="text-[10px] text-muted-foreground">
                                até {formatBRL(lead.orcamento_max)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {col.items.length === 0 && (
                  <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                    Vazio
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <MotivoPerdidoDialog
        open={perdidoOpen}
        onOpenChange={(v) => {
          setPerdidoOpen(v);
          if (!v) setPendingId(null);
        }}
        onConfirm={(motivo) => {
          if (pendingId) {
            update.mutate({
              id: pendingId,
              patch: {
                estagio: "fechado_perdido",
                score: "perdido",
                motivo_perdido: motivo,
              },
            });
          }
          setPerdidoOpen(false);
          setPendingId(null);
        }}
      />
    </>
  );
}
