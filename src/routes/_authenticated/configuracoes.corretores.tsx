import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ConfigTabs } from "@/components/configuracoes/ConfigTabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { CorretorEditDialog } from "@/components/configuracoes/CorretorEditDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useEquipe } from "@/hooks/useCorretores";
import type { UsuarioComRole } from "@/types";

export const Route = createFileRoute("/_authenticated/configuracoes/corretores")({
  component: GestaoCorretores,
});

function initials(nome: string) {
  return nome
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function GestaoCorretores() {
  const { usuario } = useAuth();
  const isGestor = usuario?.role === "gestor";
  const { data: equipe = [], isLoading } = useEquipe();
  const [selected, setSelected] = useState<UsuarioComRole | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Corretores"
        description="Papéis, status e histórico da equipe."
        action={
          isGestor ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Convidar corretor
            </Button>
          ) : undefined
        }
      />
      <ConfigTabs />

      {isLoading ? (
        <LoadingSpinner />
      ) : equipe.length === 0 ? (
        <EmptyState icon={Users} title="Ninguém na equipe" description="Convide seu primeiro corretor." />
      ) : (
        <Card className="card-radius">
          <CardContent className="p-0">
            <div className="divide-y">
              {equipe.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-4 p-4">
                  <Avatar>
                    <AvatarFallback>{initials(u.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{u.nome}</p>
                      <Badge variant={u.role === "gestor" ? "default" : "secondary"}>
                        {u.role === "gestor" ? "Gestor" : "Corretor"}
                      </Badge>
                      {!u.ativo && <Badge variant="outline">Inativo</Badge>}
                      {u.id === usuario?.userId && <Badge variant="outline">Você</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    {u.telefone && (
                      <p className="text-xs text-muted-foreground">{u.telefone}</p>
                    )}
                  </div>
                  {isGestor && (
                    <Button size="sm" variant="outline" onClick={() => setSelected(u)}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {usuario && (
        <CorretorEditDialog
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
          corretor={selected}
          currentUserId={usuario.userId}
        />
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar corretor</DialogTitle>
            <DialogDescription>Como incorporar novos usuários à sua imobiliária</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Peça ao novo corretor para se cadastrar em{" "}
              <span className="font-medium text-foreground">/auth</span> usando o e-mail dele.
            </p>
            <p>
              Ele será automaticamente vinculado à sua imobiliária com o papel de{" "}
              <span className="font-medium text-foreground">Corretor</span>. Depois disso, você pode
              editar o papel, ativar/desativar e atualizar os dados pela lista aqui ao lado.
            </p>
            <p className="text-xs">
              O envio de magic link automatizado será liberado em uma próxima fase (integração com
              e-mail).
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
