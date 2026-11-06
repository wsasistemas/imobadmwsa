import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Upload, Download, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import {
  useUnidades,
  useCreateUnidade,
  useUpdateUnidade,
  useDeleteUnidade,
  useBulkInsertUnidades,
  type Unidade,
  type UnidadeInsert,
  type UnidadeStatus,
} from "@/hooks/useUnidades";
import { downloadCSV, toCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/unidades")({
  component: AdminUnidades,
});

const STATUS_BADGE: Record<UnidadeStatus, string> = {
  disponivel: "bg-emerald-100 text-emerald-900",
  reservada: "bg-amber-100 text-amber-900",
  vendida: "bg-rose-100 text-rose-900",
  bloqueada: "bg-muted text-muted-foreground",
};

function AdminUnidades() {
  const { usuario } = useAuth();
  const isGestor = usuario?.role === "gestor";
  const { data: emps } = useEmpreendimentos();
  const [empId, setEmpId] = useState<string>("");
  const { data: unidades, isLoading } = useUnidades(empId || undefined);
  const del = useDeleteUnidade();
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const empSel = emps?.find((e) => e.id === empId);

  if (!isGestor) {
    return (
      <div className="p-6">
        <EmptyState title="Acesso restrito" description="Apenas gestores podem gerenciar unidades." />
      </div>
    );
  }

  const handleExport = () => {
    if (!unidades?.length) return;
    const csv = toCSV(unidades, [
      { key: "bloco", label: "bloco" },
      { key: "numero", label: "numero" },
      { key: "andar", label: "andar" },
      { key: "area_m2", label: "area_m2" },
      { key: "preco", label: "preco" },
      { key: "status", label: "status" },
      { key: "observacoes", label: "observacoes" },
    ]);
    downloadCSV(`unidades-${empSel?.nome ?? empId}.csv`, csv);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Admin › Unidades" description="Gerencie o espelho de vendas por empreendimento" />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Label>Empreendimento</Label>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {emps?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {empId && (
          <>
            <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Nova unidade</Button>
            <Button variant="outline" onClick={() => setImporting(true)}><Upload className="mr-2 h-4 w-4" />Importar CSV</Button>
            <Button variant="outline" onClick={handleExport} disabled={!unidades?.length}><Download className="mr-2 h-4 w-4" />Exportar</Button>
          </>
        )}
      </div>

      {!empId ? (
        <EmptyState title="Escolha um empreendimento" description="Selecione acima para ver as unidades." />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bloco</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Andar</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(unidades ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.bloco ?? "—"}</TableCell>
                  <TableCell className="font-medium">{u.numero}</TableCell>
                  <TableCell>{u.andar ?? "—"}</TableCell>
                  <TableCell>{u.area_m2 ?? "—"}</TableCell>
                  <TableCell>{u.preco != null ? u.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</TableCell>
                  <TableCell><Badge className={cn(STATUS_BADGE[u.status])} variant="outline">{u.status}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Excluir unidade ${u.numero}?`) && del.mutate(u.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {unidades?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma unidade cadastrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {(creating || editing) && empSel && usuario && (
        <UnidadeDialog
          key={editing?.id ?? "new"}
          empreendimentoId={empSel.id}
          imobiliariaId={usuario.imobiliariaId}
          unidade={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {importing && empSel && usuario && (
        <ImportDialog
          empreendimentoId={empSel.id}
          imobiliariaId={usuario.imobiliariaId}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function UnidadeDialog({
  empreendimentoId,
  imobiliariaId,
  unidade,
  onClose,
}: {
  empreendimentoId: string;
  imobiliariaId: string;
  unidade: Unidade | null;
  onClose: () => void;
}) {
  const create = useCreateUnidade();
  const update = useUpdateUnidade();
  const [form, setForm] = useState({
    bloco: unidade?.bloco ?? "",
    numero: unidade?.numero ?? "",
    andar: unidade?.andar?.toString() ?? "",
    area_m2: unidade?.area_m2?.toString() ?? "",
    preco: unidade?.preco?.toString() ?? "",
    status: (unidade?.status ?? "disponivel") as UnidadeStatus,
    observacoes: unidade?.observacoes ?? "",
  });

  const submit = async () => {
    if (!form.numero.trim()) return toast.error("Número é obrigatório");
    const patch: Partial<UnidadeInsert> = {
      bloco: form.bloco || null,
      numero: form.numero,
      andar: form.andar ? Number(form.andar) : null,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      preco: form.preco ? Number(form.preco) : null,
      status: form.status,
      observacoes: form.observacoes || null,
    };
    if (unidade) await update.mutateAsync({ id: unidade.id, patch });
    else await create.mutateAsync({ ...patch, empreendimento_id: empreendimentoId, imobiliaria_id: imobiliariaId, numero: form.numero } as UnidadeInsert);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unidade ? "Editar unidade" : "Nova unidade"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bloco"><Input value={form.bloco} onChange={(e) => setForm({ ...form, bloco: e.target.value })} /></Field>
          <Field label="Número *"><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></Field>
          <Field label="Andar"><Input type="number" value={form.andar} onChange={(e) => setForm({ ...form, andar: e.target.value })} /></Field>
          <Field label="Área (m²)"><Input type="number" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} /></Field>
          <Field label="Preço (R$)"><Input type="number" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as UnidadeStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="reservada">Reservada</SelectItem>
                <SelectItem value="vendida">Vendida</SelectItem>
                <SelectItem value="bloqueada">Bloqueada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Observações"><Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ParsedRow = { row: number; data: UnidadeInsert; error?: string };

function ImportDialog({
  empreendimentoId,
  imobiliariaId,
  onClose,
}: {
  empreendimentoId: string;
  imobiliariaId: string;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const bulk = useBulkInsertUnidades();

  const validCount = useMemo(() => parsed.filter((p) => !p.error).length, [parsed]);
  const errorCount = parsed.length - validCount;

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error("CSV vazio");
    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const iNum = idx("numero");
    if (iNum < 0) return toast.error("Coluna 'numero' obrigatória");

    const rows: ParsedRow[] = lines.slice(1).map((line, i) => {
      const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const numero = cells[iNum];
      const statusRaw = idx("status") >= 0 ? cells[idx("status")] : "disponivel";
      const validStatus = ["disponivel", "reservada", "vendida", "bloqueada"].includes(statusRaw);
      const data: UnidadeInsert = {
        empreendimento_id: empreendimentoId,
        imobiliaria_id: imobiliariaId,
        numero,
        bloco: idx("bloco") >= 0 ? cells[idx("bloco")] || null : null,
        andar: idx("andar") >= 0 && cells[idx("andar")] ? Number(cells[idx("andar")]) : null,
        area_m2: idx("area_m2") >= 0 && cells[idx("area_m2")] ? Number(cells[idx("area_m2")]) : null,
        preco: idx("preco") >= 0 && cells[idx("preco")] ? Number(cells[idx("preco")]) : null,
        status: (validStatus ? statusRaw : "disponivel") as UnidadeStatus,
        observacoes: idx("observacoes") >= 0 ? cells[idx("observacoes")] || null : null,
      };
      const errs: string[] = [];
      if (!numero) errs.push("numero vazio");
      if (data.andar != null && Number.isNaN(data.andar)) errs.push("andar inválido");
      if (data.preco != null && Number.isNaN(data.preco)) errs.push("preço inválido");
      return { row: i + 2, data, error: errs.join(", ") || undefined };
    });
    setParsed(rows);
  };

  const confirmImport = async () => {
    const valid = parsed.filter((p) => !p.error).map((p) => p.data);
    if (!valid.length) return;
    await bulk.mutateAsync(valid);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar unidades (CSV)</DialogTitle>
          <DialogDescription>
            Colunas aceitas: <code>numero</code> (obrigatório), <code>bloco</code>, <code>andar</code>, <code>area_m2</code>, <code>preco</code>, <code>status</code>, <code>observacoes</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {parsed.length > 0 && (
            <>
              <div className="flex gap-3 text-sm">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-900">Válidas: {validCount}</Badge>
                {errorCount > 0 && <Badge variant="outline" className="bg-rose-100 text-rose-900">Erros: {errorCount}</Badge>}
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Bloco</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 100).map((p) => (
                      <TableRow key={p.row} className={p.error ? "bg-rose-50 dark:bg-rose-950/20" : ""}>
                        <TableCell>{p.row}</TableCell>
                        <TableCell>{p.data.numero}</TableCell>
                        <TableCell>{p.data.bloco ?? "—"}</TableCell>
                        <TableCell>{p.data.status}</TableCell>
                        <TableCell className="text-xs text-rose-700">{p.error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmImport} disabled={!validCount || bulk.isPending}>
            Importar {validCount} unidades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
