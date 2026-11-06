import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2, Plus, CalendarPlus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useLead, useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { useAtividades, useCreateAtividade } from "@/hooks/useAtividades";
import { useAuth } from "@/hooks/useAuth";
import { LeadFormDialog } from "@/components/leads/LeadFormDialog";
import { VisitaFormDialog } from "@/components/visitas/VisitaFormDialog";
import { useVisitas } from "@/hooks/useVisitas";
import { statusMeta } from "@/lib/visitasMeta";
import { ESTAGIOS, TIPOS_ATIVIDADE, scoreVariant } from "@/lib/leadsMeta";
import { formatBRL, formatPhone, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadProfile,
});

function LeadProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { data: lead, isLoading } = useLead(id);
  const { data: atividades } = useAtividades(id);
  const { data: visitas = [] } = useVisitas({ leadId: id });
  const update = useUpdateLead();
  const del = useDeleteLead();
  const createAtiv = useCreateAtividade();

  const [novaAtiv, setNovaAtiv] = useState({
    tipo: "nota" as (typeof TIPOS_ATIVIDADE)[number]["value"],
    titulo: "",
    descricao: "",
  });

  if (isLoading) return <LoadingSpinner />;

  if (!lead) {
    return (
      <div>
        <PageHeader title="Lead não encontrado" />
        <EmptyState
          title="Lead não existe ou foi removido"
          description="Volte para a lista para escolher outro lead."
          action={
            <Button asChild variant="outline">
              <Link to="/leads"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const stage = ESTAGIOS.find((s) => s.value === lead.estagio);

  async function onSubmitAtividade(e: React.FormEvent) {
    e.preventDefault();
    if (!novaAtiv.titulo.trim() || !usuario) {
      toast.error("Informe um título");
      return;
    }
    await createAtiv.mutateAsync({
      lead_id: lead!.id,
      usuario_id: usuario.userId,
      tipo: novaAtiv.tipo,
      titulo: novaAtiv.titulo.trim(),
      descricao: novaAtiv.descricao.trim() || null,
      data: new Date().toISOString(),
      duracao_minutos: null,
      concluida: true,
    });
    setNovaAtiv({ tipo: "nota", titulo: "", descricao: "" });
  }

  return (
    <div>
      <PageHeader
        title={lead.nome}
        description={[lead.telefone && formatPhone(lead.telefone), lead.email].filter(Boolean).join(" · ") || undefined}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/leads"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
            </Button>
            <VisitaFormDialog
              leadId={lead.id}
              trigger={
                <Button variant="outline" size="sm">
                  <CalendarPlus className="mr-2 h-4 w-4" /> Agendar visita
                </Button>
              }
            />
            <LeadFormDialog
              lead={lead}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              }
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todas as atividades vinculadas também serão removidas. Ação irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await del.mutateAsync(lead.id);
                      navigate({ to: "/leads" });
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal: atividades */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrar atividade</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitAtividade} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                  <Select
                    value={novaAtiv.tipo}
                    onValueChange={(v) => setNovaAtiv({ ...novaAtiv, tipo: v as typeof novaAtiv.tipo })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_ATIVIDADE.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Título (ex: Ligou querendo agendar visita)"
                    value={novaAtiv.titulo}
                    onChange={(e) => setNovaAtiv({ ...novaAtiv, titulo: e.target.value })}
                  />
                </div>
                <Textarea
                  placeholder="Detalhes (opcional)"
                  rows={2}
                  value={novaAtiv.descricao}
                  onChange={(e) => setNovaAtiv({ ...novaAtiv, descricao: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={createAtiv.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    {createAtiv.isPending ? "Salvando..." : "Registrar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {(atividades ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma atividade registrada ainda.
                </p>
              ) : (
                <ol className="space-y-4">
                  {atividades!.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {a.tipo.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 border-b pb-3 last:border-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{a.titulo}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(a.data)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                          {a.tipo}
                        </p>
                        {a.descricao && (
                          <p className="mt-1 text-sm text-muted-foreground">{a.descricao}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral: dados */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qualificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">Estágio</label>
                <Select
                  value={lead.estagio}
                  onValueChange={(v) => update.mutate({ id: lead.id, patch: { estagio: v as typeof lead.estagio } })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTAGIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Score</span>
                <Badge variant={scoreVariant(lead.score)}>{lead.score}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Origem</span>
                <span>{lead.origem}</span>
              </div>
              {stage && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${stage.color}`} /> {stage.label}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Orçamento máx." value={lead.orcamento_max ? formatBRL(lead.orcamento_max) : "—"} />
              <Row label="LGPD" value={lead.consentimento_lgpd ? "Consentido" : "Pendente"} />
              <Row label="Última interação" value={formatDateTime(lead.ultima_interacao)} />
              <Row label="Cadastrado em" value={formatDateTime(lead.created_at)} />
              {lead.observacoes && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Visitas</CardTitle>
              <span className="text-xs text-muted-foreground">{visitas.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {visitas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma visita.</p>
              ) : visitas.map((v) => {
                const m = statusMeta(v.status);
                return (
                  <div key={v.id} className="flex items-start gap-2 border-b pb-2 last:border-0 last:pb-0">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{formatDateTime(v.data_hora)}</p>
                      <p className="text-[11px] text-muted-foreground">{m.label} · {v.duracao_min} min</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// suppress unused import warning (initials reserved for future avatar)
void initials;
