import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useEmpreendimento } from "@/hooks/useEmpreendimentos";
import { useUnidades, useUnidadesRealtime, useReservarUnidade, type Unidade, type UnidadeStatus } from "@/hooks/useUnidades";
import { useLeads } from "@/hooks/useLeads";

export const Route = createFileRoute("/_authenticated/espelho/$id")({
  component: EspelhoDetalhe,
});

const STATUS_LABEL: Record<UnidadeStatus, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  vendida: "Vendida",
  bloqueada: "Bloqueada",
};

const STATUS_STYLE: Record<UnidadeStatus, string> = {
  disponivel: "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800",
  reservada: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
  vendida: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",
  bloqueada: "bg-muted text-muted-foreground border-border",
};

const brl = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

function EspelhoDetalhe() {
  const { id } = Route.useParams();
  const { data: emp } = useEmpreendimento(id);
  const { data: unidades, isLoading } = useUnidades(id);
  useUnidadesRealtime(id);
  const [sel, setSel] = useState<Unidade | null>(null);

  const byBloco = useMemo(() => {
    const map = new Map<string, Unidade[]>();
    for (const u of unidades ?? []) {
      const key = u.bloco ?? "Único";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [unidades]);

  const totals = useMemo(() => {
    const t = { disponivel: 0, reservada: 0, vendida: 0, bloqueada: 0 } as Record<UnidadeStatus, number>;
    for (const u of unidades ?? []) t[u.status]++;
    return t;
  }, [unidades]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/espelho">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader title={emp?.nome ?? "Espelho"} description={[emp?.bairro, emp?.cidade].filter(Boolean).join(" · ") || undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABEL) as UnidadeStatus[]).map((s) => (
          <Badge key={s} variant="outline" className={cn("border", STATUS_STYLE[s])}>
            {STATUS_LABEL[s]}: {totals[s]}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : byBloco.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma unidade cadastrada. Vá em{" "}
          <Link to="/admin/unidades" className="underline">Admin › Unidades</Link> para cadastrar.
        </div>
      ) : (
        <div className="space-y-6">
          {byBloco.map(([bloco, us]) => (
            <div key={bloco}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Bloco {bloco}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                {us.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSel(u)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-2 text-xs font-medium transition-transform hover:scale-105",
                      STATUS_STYLE[u.status],
                    )}
                    title={STATUS_LABEL[u.status]}
                  >
                    <span className="font-semibold">{u.numero}</span>
                    {u.andar != null && <span className="text-[10px] opacity-70">{u.andar}º</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <UnidadeSheet unidade={sel} onOpenChange={(o) => !o && setSel(null)} />
    </div>
  );
}

function UnidadeSheet({ unidade, onOpenChange }: { unidade: Unidade | null; onOpenChange: (o: boolean) => void }) {
  const { data: leads } = useLeads();
  const reservar = useReservarUnidade();
  const [leadId, setLeadId] = useState<string>("");
  const [horas, setHoras] = useState<number>(24);
  const [open, setOpen] = useState(false);

  const leadNome = leads?.find((l) => l.id === leadId)?.nome;

  const handleReservar = async () => {
    if (!unidade || !leadId) return;
    await reservar.mutateAsync({ unidadeId: unidade.id, leadId, horas });
    onOpenChange(false);
    setLeadId("");
  };

  return (
    <Sheet open={!!unidade} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        {unidade && (
          <>
            <SheetHeader>
              <SheetTitle>Unidade {unidade.numero}{unidade.bloco ? ` · Bloco ${unidade.bloco}` : ""}</SheetTitle>
              <SheetDescription>
                <Badge variant="outline" className={cn("mt-2 border", STATUS_STYLE[unidade.status])}>
                  {STATUS_LABEL[unidade.status]}
                </Badge>
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 p-4 text-sm">
              <Info label="Andar" value={unidade.andar != null ? `${unidade.andar}º` : "—"} />
              <Info label="Área" value={unidade.area_m2 != null ? `${unidade.area_m2} m²` : "—"} />
              <Info label="Preço" value={brl(unidade.preco)} />
              {unidade.observacoes && <Info label="Observações" value={unidade.observacoes} />}
            </div>

            {unidade.status === "disponivel" && (
              <div className="space-y-3 border-t p-4">
                <div className="space-y-2">
                  <Label>Lead</Label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between">
                        {leadNome ?? "Selecionar lead..."}
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar lead..." />
                        <CommandList>
                          <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                          <CommandGroup>
                            {(leads ?? []).map((l) => (
                              <CommandItem
                                key={l.id}
                                value={l.nome}
                                onSelect={() => {
                                  setLeadId(l.id);
                                  setOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", leadId === l.id ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span>{l.nome}</span>
                                  <span className="text-xs text-muted-foreground">{l.telefone ?? l.email ?? ""}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Validade (horas)</Label>
                  <Input type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(Number(e.target.value) || 24)} />
                </div>
                <SheetFooter>
                  <Button onClick={handleReservar} disabled={!leadId || reservar.isPending} className="w-full">
                    {reservar.isPending ? "Reservando..." : "Reservar unidade"}
                  </Button>
                </SheetFooter>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
