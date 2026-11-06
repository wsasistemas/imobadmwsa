import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import { useCorretores } from "@/hooks/useCorretores";
import { useCreateVisita, useUpdateVisita } from "@/hooks/useVisitas";
import { STATUS_VISITA } from "@/lib/visitasMeta";
import type { Visita } from "@/types";
import { toast } from "sonner";

type Props = {
  visita?: Visita;
  leadId?: string;
  empreendimentoId?: string;
  trigger: React.ReactNode;
};

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function VisitaFormDialog({ visita, leadId, empreendimentoId, trigger }: Props) {
  const { usuario } = useAuth();
  const { data: leads } = useLeads();
  const { data: empreendimentos } = useEmpreendimentos();
  const { data: corretores } = useCorretores();
  const create = useCreateVisita();
  const update = useUpdateVisita();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    lead_id: leadId ?? "",
    empreendimento_id: empreendimentoId ?? "",
    corretor_id: "",
    data_hora: toLocalInput(),
    duracao_min: "60",
    status: "agendada" as Visita["status"],
    observacoes: "",
    feedback: "",
  });

  useEffect(() => {
    if (visita) {
      setForm({
        lead_id: visita.lead_id,
        empreendimento_id: visita.empreendimento_id ?? "",
        corretor_id: visita.corretor_id,
        data_hora: toLocalInput(visita.data_hora),
        duracao_min: String(visita.duracao_min),
        status: visita.status,
        observacoes: visita.observacoes ?? "",
        feedback: visita.feedback ?? "",
      });
    } else if (usuario) {
      setForm((f) => ({ ...f, corretor_id: f.corretor_id || usuario.userId }));
    }
  }, [visita, usuario, open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    if (!form.lead_id) return toast.error("Selecione um lead");
    if (!form.corretor_id) return toast.error("Selecione um corretor");

    const payload = {
      imobiliaria_id: usuario.imobiliariaId,
      lead_id: form.lead_id,
      empreendimento_id: form.empreendimento_id || null,
      corretor_id: form.corretor_id,
      data_hora: new Date(form.data_hora).toISOString(),
      duracao_min: Number(form.duracao_min) || 60,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
      feedback: form.feedback.trim() || null,
    };

    if (visita) {
      await update.mutateAsync({ id: visita.id, patch: payload });
    } else {
      await create.mutateAsync(payload);
    }
    setOpen(false);
  }

  const busy = create.isPending || update.isPending;
  const isGestor = usuario?.role === "gestor";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{visita ? "Editar visita" : "Agendar visita"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Lead *</Label>
            <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })} disabled={!!leadId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(leads ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Empreendimento</Label>
            <Select
              value={form.empreendimento_id || "none"}
              onValueChange={(v) => setForm({ ...form, empreendimento_id: v === "none" ? "" : v })}
              disabled={!!empreendimentoId}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(empreendimentos ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isGestor && (
            <div className="space-y-2">
              <Label>Corretor *</Label>
              <Select value={form.corretor_id} onValueChange={(v) => setForm({ ...form, corretor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(corretores ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="dh">Data e hora *</Label>
              <Input
                id="dh"
                type="datetime-local"
                value={form.data_hora}
                onChange={(e) => setForm({ ...form, data_hora: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dur">Duração (min)</Label>
              <Input
                id="dur"
                type="number"
                min="15"
                step="15"
                value={form.duracao_min}
                onChange={(e) => setForm({ ...form, duracao_min: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Visita["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_VISITA.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>

          {form.status === "realizada" && (
            <div className="space-y-2">
              <Label>Feedback pós-visita</Label>
              <Textarea
                rows={2}
                value={form.feedback}
                onChange={(e) => setForm({ ...form, feedback: e.target.value })}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
