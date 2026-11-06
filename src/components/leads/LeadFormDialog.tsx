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
import { Checkbox } from "@/components/ui/checkbox";
import { ORIGENS, ESTAGIOS, SCORES } from "@/lib/leadsMeta";
import { useCreateLead, useUpdateLead, type LeadInput } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import type { Lead } from "@/types";
import { toast } from "sonner";

type Props = {
  lead?: Lead;
  trigger: React.ReactNode;
};

export function LeadFormDialog({ lead, trigger }: Props) {
  const { usuario } = useAuth();
  const create = useCreateLead();
  const update = useUpdateLead();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    origem: "outro",
    score: "novo",
    estagio: "novo_lead",
    observacoes: "",
    consentimento_lgpd: false,
    orcamento_max: "",
  });

  useEffect(() => {
    if (open && lead) {
      setForm({
        nome: lead.nome,
        email: lead.email ?? "",
        telefone: lead.telefone ?? "",
        origem: lead.origem,
        score: lead.score,
        estagio: lead.estagio,
        observacoes: lead.observacoes ?? "",
        consentimento_lgpd: lead.consentimento_lgpd,
        orcamento_max: lead.orcamento_max?.toString() ?? "",
      });
    } else if (open) {
      setForm({
        nome: "", email: "", telefone: "", origem: "outro",
        score: "novo", estagio: "novo_lead", observacoes: "",
        consentimento_lgpd: false, orcamento_max: "",
      });
    }
  }, [open, lead]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!usuario) {
      toast.error("Sessão inválida");
      return;
    }

    const payload: Partial<Lead> = {
      nome: form.nome.trim(),
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      origem: form.origem as Lead["origem"],
      score: form.score as Lead["score"],
      estagio: form.estagio as Lead["estagio"],
      observacoes: form.observacoes.trim() || null,
      consentimento_lgpd: form.consentimento_lgpd,
      consentimento_data: form.consentimento_lgpd ? new Date().toISOString() : null,
      orcamento_max: form.orcamento_max ? Number(form.orcamento_max) : null,
    };

    if (lead) {
      await update.mutateAsync({ id: lead.id, patch: payload });
    } else {
      const input: LeadInput = {
        ...payload,
        nome: payload.nome!,
        imobiliaria_id: usuario.imobiliariaId,
        corretor_id: usuario.userId,
      };
      await create.mutateAsync(input);
    }
    setOpen(false);
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Score</Label>
              <Select value={form.score} onValueChange={(v) => setForm({ ...form, score: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCORES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estágio</Label>
              <Select value={form.estagio} onValueChange={(v) => setForm({ ...form, estagio: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTAGIOS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orc">Orçamento máximo (R$)</Label>
            <Input id="orc" type="number" min="0" value={form.orcamento_max}
              onChange={(e) => setForm({ ...form, orcamento_max: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" rows={3} value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="lgpd" checked={form.consentimento_lgpd}
              onCheckedChange={(v) => setForm({ ...form, consentimento_lgpd: v === true })} />
            <Label htmlFor="lgpd" className="text-sm font-normal">
              Lead consentiu com o tratamento de dados (LGPD)
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando..." : lead ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
