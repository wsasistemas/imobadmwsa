import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, BedDouble, Car, Bath, Ruler } from "lucide-react";
import {
  useTipologias,
  useCreateTipologia,
  useDeleteTipologia,
} from "@/hooks/useTipologias";
import { STATUS_TIPOLOGIA } from "@/lib/empreendimentosMeta";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/utils";
import type { StatusTipologia } from "@/types";

const emptyForm = {
  nome: "",
  area_privativa: "",
  quartos: "",
  suites: "",
  banheiros: "",
  vagas: "",
  valor: "",
  status: "disponivel" as StatusTipologia,
};

export function TipologiasTab({ empreendimentoId }: { empreendimentoId: string }) {
  const { usuario } = useAuth();
  const { data: tipologias, isLoading } = useTipologias(empreendimentoId);
  const create = useCreateTipologia();
  const del = useDeleteTipologia();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !form.nome.trim()) return;
    await create.mutateAsync({
      nome: form.nome.trim(),
      imobiliaria_id: usuario.imobiliariaId,
      empreendimento_id: empreendimentoId,
      area_privativa: form.area_privativa ? Number(form.area_privativa) : null,
      quartos: form.quartos ? Number(form.quartos) : null,
      suites: form.suites ? Number(form.suites) : null,
      banheiros: form.banheiros ? Number(form.banheiros) : null,
      vagas: form.vagas ? Number(form.vagas) : null,
      valor: form.valor ? Number(form.valor) : null,
      status: form.status,
    });
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {tipologias?.length ?? 0} tipologia(s)
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Nova tipologia
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova tipologia</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Tipo 01 - 2 quartos"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Área privativa (m²)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.area_privativa}
                    onChange={(e) => setForm({ ...form, area_privativa: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quartos</Label>
                  <Input
                    type="number"
                    value={form.quartos}
                    onChange={(e) => setForm({ ...form, quartos: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Suítes</Label>
                  <Input
                    type="number"
                    value={form.suites}
                    onChange={(e) => setForm({ ...form, suites: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Banheiros</Label>
                  <Input
                    type="number"
                    value={form.banheiros}
                    onChange={(e) => setForm({ ...form, banheiros: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vagas</Label>
                  <Input
                    type="number"
                    value={form.vagas}
                    onChange={(e) => setForm({ ...form, vagas: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as StatusTipologia })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_TIPOLOGIA.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Salvando..." : "Adicionar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (tipologias ?? []).length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhuma tipologia cadastrada.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tipologias!.map((t) => {
            const meta = STATUS_TIPOLOGIA.find((s) => s.value === t.status);
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{t.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.valor ? formatBRL(t.valor) : "Valor sob consulta"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {meta && <Badge variant={meta.variant}>{meta.label}</Badge>}
                    <button
                      onClick={() =>
                        del.mutate({ id: t.id, empreendimentoId })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {t.area_privativa && (
                    <span className="flex items-center gap-1">
                      <Ruler className="h-3 w-3" /> {t.area_privativa} m²
                    </span>
                  )}
                  {t.quartos !== null && (
                    <span className="flex items-center gap-1">
                      <BedDouble className="h-3 w-3" /> {t.quartos}
                    </span>
                  )}
                  {t.banheiros !== null && (
                    <span className="flex items-center gap-1">
                      <Bath className="h-3 w-3" /> {t.banheiros}
                    </span>
                  )}
                  {t.vagas !== null && (
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" /> {t.vagas}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
