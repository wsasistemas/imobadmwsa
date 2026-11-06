import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import {
  useCondicoesPagamento,
  useCreateCondicao,
  useDeleteCondicao,
} from "@/hooks/useCondicoesPagamento";
import { useAuth } from "@/hooks/useAuth";

const emptyForm = {
  nome: "",
  entrada_percentual: "",
  parcelas_obra: "",
  parcelas_pos_chaves: "",
  financiamento_bancario: false,
  observacoes: "",
};

export function CondicoesTab({ empreendimentoId }: { empreendimentoId: string }) {
  const { usuario } = useAuth();
  const { data, isLoading } = useCondicoesPagamento(empreendimentoId);
  const create = useCreateCondicao();
  const del = useDeleteCondicao();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !form.nome.trim()) return;
    await create.mutateAsync({
      nome: form.nome.trim(),
      imobiliaria_id: usuario.imobiliariaId,
      empreendimento_id: empreendimentoId,
      entrada_percentual: form.entrada_percentual ? Number(form.entrada_percentual) : null,
      parcelas_obra: form.parcelas_obra ? Number(form.parcelas_obra) : null,
      parcelas_pos_chaves: form.parcelas_pos_chaves
        ? Number(form.parcelas_pos_chaves)
        : null,
      financiamento_bancario: form.financiamento_bancario,
      observacoes: form.observacoes.trim() || null,
    });
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{data?.length ?? 0} condição(ões)</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Nova condição
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova condição de pagamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: À vista com desconto"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Entrada (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.entrada_percentual}
                    onChange={(e) =>
                      setForm({ ...form, entrada_percentual: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Parcelas obra</Label>
                  <Input
                    type="number"
                    value={form.parcelas_obra}
                    onChange={(e) => setForm({ ...form, parcelas_obra: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pós-chaves</Label>
                  <Input
                    type="number"
                    value={form.parcelas_pos_chaves}
                    onChange={(e) =>
                      setForm({ ...form, parcelas_pos_chaves: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.financiamento_bancario}
                  onCheckedChange={(v) =>
                    setForm({ ...form, financiamento_bancario: v })
                  }
                />
                <Label>Aceita financiamento bancário</Label>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  Adicionar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhuma condição cadastrada.
        </p>
      ) : (
        <div className="space-y-2">
          {data!.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{c.nome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.entrada_percentual ? `Entrada ${c.entrada_percentual}%` : ""}
                    {c.parcelas_obra ? ` · ${c.parcelas_obra}x obra` : ""}
                    {c.parcelas_pos_chaves
                      ? ` · ${c.parcelas_pos_chaves}x pós-chaves`
                      : ""}
                    {c.financiamento_bancario ? " · Financiamento" : ""}
                  </p>
                  {c.observacoes && (
                    <p className="mt-2 text-sm text-muted-foreground">{c.observacoes}</p>
                  )}
                </div>
                <button
                  onClick={() => del.mutate({ id: c.id, empreendimentoId })}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
