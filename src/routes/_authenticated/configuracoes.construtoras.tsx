import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ConfigTabs } from "@/components/configuracoes/ConfigTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConstrutoraFormDialog } from "@/components/configuracoes/ConstrutoraFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useConstrutoras, useDeleteConstrutora } from "@/hooks/useConstrutoras";
import type { Construtora } from "@/types";

export const Route = createFileRoute("/_authenticated/configuracoes/construtoras")({
  component: GestaoConstrutoras,
});

function GestaoConstrutoras() {
  const { usuario } = useAuth();
  const isGestor = usuario?.role === "gestor";
  const { data: construtoras = [], isLoading } = useConstrutoras();
  const del = useDeleteConstrutora();

  const [dialog, setDialog] = useState<{ open: boolean; construtora: Construtora | null }>({
    open: false,
    construtora: null,
  });
  const [toDelete, setToDelete] = useState<Construtora | null>(null);

  return (
    <div>
      <PageHeader
        title="Construtoras parceiras"
        description="Cadastro, contato e comissionamento."
        action={
          isGestor ? (
            <Button onClick={() => setDialog({ open: true, construtora: null })}>
              <Plus className="mr-2 h-4 w-4" />
              Nova construtora
            </Button>
          ) : undefined
        }
      />
      <ConfigTabs />

      {isLoading ? (
        <LoadingSpinner />
      ) : construtoras.length === 0 ? (
        <EmptyState
          icon={Building}
          title="Nenhuma construtora cadastrada"
          description="Cadastre construtoras para vincular aos empreendimentos."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {construtoras.map((c) => (
            <Card key={c.id} className="card-radius">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building className="h-4 w-4 text-primary" />
                  {c.nome}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.cnpj && <p className="text-muted-foreground">CNPJ: {c.cnpj}</p>}
                {c.contato_nome && <p>{c.contato_nome}</p>}
                {c.contato_email && (
                  <p className="text-muted-foreground">{c.contato_email}</p>
                )}
                {c.contato_telefone && (
                  <p className="text-muted-foreground">{c.contato_telefone}</p>
                )}
                {c.comissao_percentual != null && (
                  <p className="text-xs">
                    Comissão: <span className="font-medium">{c.comissao_percentual}%</span>
                  </p>
                )}
                {isGestor && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ open: true, construtora: c })}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setToDelete(c)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remover
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {usuario?.imobiliariaId && (
        <ConstrutoraFormDialog
          open={dialog.open}
          onOpenChange={(v) => setDialog((s) => ({ ...s, open: v }))}
          imobiliariaId={usuario.imobiliariaId}
          construtora={dialog.construtora}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover construtora?</AlertDialogTitle>
            <AlertDialogDescription>
              Empreendimentos vinculados ficarão sem construtora, mas não serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) {
                  await del.mutateAsync(toDelete.id);
                  setToDelete(null);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
