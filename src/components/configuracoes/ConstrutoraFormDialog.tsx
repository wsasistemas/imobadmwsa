import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateConstrutora, useUpdateConstrutora } from "@/hooks/useConstrutoras";
import type { Construtora } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imobiliariaId: string;
  construtora?: Construtora | null;
}

const empty = {
  nome: "",
  cnpj: "",
  contato_nome: "",
  contato_email: "",
  contato_telefone: "",
  comissao_percentual: "",
  observacoes: "",
};

export function ConstrutoraFormDialog({ open, onOpenChange, imobiliariaId, construtora }: Props) {
  const create = useCreateConstrutora();
  const update = useUpdateConstrutora();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (construtora) {
      setForm({
        nome: construtora.nome ?? "",
        cnpj: construtora.cnpj ?? "",
        contato_nome: construtora.contato_nome ?? "",
        contato_email: construtora.contato_email ?? "",
        contato_telefone: construtora.contato_telefone ?? "",
        comissao_percentual:
          construtora.comissao_percentual != null ? String(construtora.comissao_percentual) : "",
        observacoes: construtora.observacoes ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [construtora, open]);

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim() || null,
      contato_nome: form.contato_nome.trim() || null,
      contato_email: form.contato_email.trim() || null,
      contato_telefone: form.contato_telefone.trim() || null,
      comissao_percentual: form.comissao_percentual ? Number(form.comissao_percentual) : null,
      observacoes: form.observacoes.trim() || null,
    };
    if (construtora) {
      await update.mutateAsync({ id: construtora.id, ...payload });
    } else {
      await create.mutateAsync({ imobiliaria_id: imobiliariaId, ...payload });
    }
    onOpenChange(false);
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{construtora ? "Editar construtora" : "Nova construtora"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={120} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label>CNPJ</Label>
              <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} maxLength={18} />
            </div>
            <div className="grid gap-1.5">
              <Label>Comissão (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.comissao_percentual}
                onChange={(e) => setForm({ ...form, comissao_percentual: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Contato responsável</Label>
            <Input
              placeholder="Nome"
              value={form.contato_nome}
              onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.contato_email}
                onChange={(e) => setForm({ ...form, contato_email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input
                value={form.contato_telefone}
                onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy || !form.nome.trim()}>
            {construtora ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
