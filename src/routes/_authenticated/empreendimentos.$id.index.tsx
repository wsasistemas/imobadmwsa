import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2, MapPin, Calendar, Building2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState } from "@/components/EmptyState";
import {
  useEmpreendimento,
  useDeleteEmpreendimento,
} from "@/hooks/useEmpreendimentos";
import { statusEmpreendimentoMeta } from "@/lib/empreendimentosMeta";
import { formatBRL, formatDate } from "@/lib/utils";
import { Gallery } from "@/components/empreendimentos/Gallery";
import { TipologiasTab } from "@/components/empreendimentos/TipologiasTab";
import { CondicoesTab } from "@/components/empreendimentos/CondicoesTab";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/empreendimentos/$id/")({
  component: EmpreendimentoDetail,
});

function EmpreendimentoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { data: emp, isLoading } = useEmpreendimento(id);
  const del = useDeleteEmpreendimento();

  if (isLoading) return <LoadingSpinner />;
  if (!emp) {
    return (
      <div>
        <PageHeader title="Empreendimento não encontrado" />
        <EmptyState
          title="Não encontrado"
          description="Volte para o catálogo."
          action={
            <Button asChild variant="outline">
              <Link to="/empreendimentos">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const status = statusEmpreendimentoMeta(emp.status);
  const endereco = [emp.endereco, emp.numero].filter(Boolean).join(", ");
  const local = [emp.bairro, emp.cidade, emp.estado].filter(Boolean).join(", ");

  return (
    <div>
      <PageHeader
        title={emp.nome}
        description={local || undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/empreendimentos">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/empreendimentos/$id/editar" params={{ id }}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
            {usuario?.role === "gestor" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir empreendimento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tipologias e condições associadas também serão removidas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await del.mutateAsync(emp.id);
                        navigate({ to: "/empreendimentos" });
                      }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Gallery paths={emp.imagens ?? []} />
        </div>
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4 text-sm">
              <Badge className={`${status.color} border-0 text-white`}>{status.label}</Badge>
              {emp.valor_a_partir_de && (
                <div>
                  <p className="text-xs text-muted-foreground">A partir de</p>
                  <p className="text-2xl font-semibold text-primary">
                    {formatBRL(emp.valor_a_partir_de)}
                  </p>
                </div>
              )}
              {emp.entrega_prevista && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Entrega: {formatDate(emp.entrega_prevista)}
                </div>
              )}
              {(endereco || local) && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {endereco && <p>{endereco}</p>}
                    {local && <p>{local}</p>}
                  </div>
                </div>
              )}
              {(emp.total_unidades || emp.unidades_disponiveis) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {emp.unidades_disponiveis ?? "—"} disponíveis
                  {emp.total_unidades ? ` de ${emp.total_unidades}` : ""}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="sobre">
          <TabsList>
            <TabsTrigger value="sobre">Sobre</TabsTrigger>
            <TabsTrigger value="tipologias">Tipologias</TabsTrigger>
            <TabsTrigger value="condicoes">Condições</TabsTrigger>
            <TabsTrigger value="plantas">Plantas</TabsTrigger>
          </TabsList>

          <TabsContent value="sobre">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Descrição</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {emp.descricao ? (
                  <p className="whitespace-pre-wrap text-sm">{emp.descricao}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem descrição.</p>
                )}
                {emp.diferenciais.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Diferenciais</p>
                    <div className="flex flex-wrap gap-2">
                      {emp.diferenciais.map((d) => (
                        <Badge key={d} variant="secondary">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tipologias">
            <TipologiasTab empreendimentoId={emp.id} />
          </TabsContent>

          <TabsContent value="condicoes">
            <CondicoesTab empreendimentoId={emp.id} />
          </TabsContent>

          <TabsContent value="plantas">
            <Card>
              <CardContent className="p-4">
                <Gallery paths={emp.plantas ?? []} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
