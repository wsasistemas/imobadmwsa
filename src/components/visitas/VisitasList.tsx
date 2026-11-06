import { Link } from "@tanstack/react-router";
import { Calendar, MapPin, User, MoreHorizontal, CheckCircle2, XCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusMeta } from "@/lib/visitasMeta";
import { formatDateTime } from "@/lib/utils";
import { useUpdateVisita, useDeleteVisita } from "@/hooks/useVisitas";
import { VisitaFormDialog } from "./VisitaFormDialog";
import type { Visita, Lead, Empreendimento } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  visitas: Visita[];
  leadsById: Map<string, Lead>;
  empreendimentosById: Map<string, Empreendimento>;
};

function groupKey(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Passadas";
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff < 7) return "Esta semana";
  return "Próximas";
}

const ORDER = ["Hoje", "Amanhã", "Esta semana", "Próximas", "Passadas"];

export function VisitasList({ visitas, leadsById, empreendimentosById }: Props) {
  const update = useUpdateVisita();
  const del = useDeleteVisita();

  if (visitas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma visita.</p>;
  }

  const grouped = new Map<string, Visita[]>();
  for (const v of visitas) {
    const k = groupKey(v.data_hora);
    const arr = grouped.get(k) ?? [];
    arr.push(v);
    grouped.set(k, arr);
  }

  return (
    <div className="space-y-6">
      {ORDER.filter((k) => grouped.has(k)).map((k) => (
        <section key={k}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</h3>
          <div className="space-y-2">
            {grouped.get(k)!.map((v) => {
              const meta = statusMeta(v.status);
              const lead = leadsById.get(v.lead_id);
              const emp = v.empreendimento_id ? empreendimentosById.get(v.empreendimento_id) : null;
              return (
                <Card key={v.id}>
                  <CardContent className="flex items-start gap-3 p-3">
                    <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", meta.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/leads/$id"
                            params={{ id: v.lead_id }}
                            className="text-sm font-medium hover:underline"
                          >
                            {lead?.nome ?? "Lead"}
                          </Link>
                          <Badge variant={meta.badge} className="text-[10px]">{meta.label}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(v.data_hora)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {emp && (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{emp.nome}</span>
                        )}
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{v.duracao_min} min</span>
                      </div>
                      {v.observacoes && (
                        <p className="mt-1 text-xs text-muted-foreground">{v.observacoes}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {v.status !== "confirmada" && v.status !== "realizada" && (
                          <DropdownMenuItem onClick={() => update.mutate({ id: v.id, patch: { status: "confirmada" } })}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar
                          </DropdownMenuItem>
                        )}
                        {v.status !== "realizada" && (
                          <DropdownMenuItem onClick={() => update.mutate({ id: v.id, patch: { status: "realizada" } })}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar realizada
                          </DropdownMenuItem>
                        )}
                        {v.status !== "cancelada" && (
                          <DropdownMenuItem onClick={() => update.mutate({ id: v.id, patch: { status: "cancelada" } })}>
                            <XCircle className="mr-2 h-4 w-4" /> Cancelar
                          </DropdownMenuItem>
                        )}
                        <VisitaFormDialog
                          visita={v}
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => del.mutate(v.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// silence unused
void User;
