import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSetRole, useUpdateUsuario } from "@/hooks/useCorretores";
import type { UserRole, UsuarioComRole } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  corretor: UsuarioComRole | null;
  currentUserId: string;
}

export function CorretorEditDialog({ open, onOpenChange, corretor, currentUserId }: Props) {
  const update = useUpdateUsuario();
  const setRole = useSetRole();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [role, setRoleState] = useState<UserRole>("corretor");

  useEffect(() => {
    if (corretor) {
      setNome(corretor.nome);
      setTelefone(corretor.telefone ?? "");
      setAtivo(corretor.ativo);
      setRoleState(corretor.role);
    }
  }, [corretor, open]);

  if (!corretor) return null;
  const isSelf = corretor.id === currentUserId;

  const handleSave = async () => {
    await update.mutateAsync({
      id: corretor.id,
      nome: nome.trim() || corretor.nome,
      telefone: telefone.trim() || null,
      ativo,
    });
    if (role !== corretor.role) {
      await setRole.mutateAsync({ userId: corretor.id, role });
    }
    onOpenChange(false);
  };

  const busy = update.isPending || setRole.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar corretor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail</Label>
            <Input value={corretor.email} disabled />
          </div>
          <div className="grid gap-1.5">
            <Label>Telefone</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} />
          </div>
          <div className="grid gap-1.5">
            <Label>Papel</Label>
            <Select
              value={role}
              onValueChange={(v) => setRoleState(v as UserRole)}
              disabled={isSelf && corretor.role === "gestor"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corretor">Corretor</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && corretor.role === "gestor" && (
              <p className="text-xs text-muted-foreground">
                Você não pode remover o próprio papel de gestor.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">Desativar bloqueia o acesso à plataforma.</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} disabled={isSelf} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
