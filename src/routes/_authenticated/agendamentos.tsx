import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Filtros, Pagina, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, mensagemErro, type Reuniao } from "@/lib/adm/api";
import { cn } from "@/lib/utils";

// Gestão Comercial › Agendamentos: semana e mês com as reuniões e os horários ocupados do Google.
export const Route = createFileRoute("/_authenticated/agendamentos")({
  head: () => ({ meta: [{ title: "Agendamentos — ImobAdm WSA" }] }),
  component: Agendamentos,
});

type Modo = "semana" | "mes";
type Item = { chave: string; inicio: string; fim: string; titulo: string; tipo: "lead" | "equipe" | "ocupado"; r?: Reuniao };

const COR: Record<Item["tipo"], string> = {
  lead: "bg-info-soft text-info",
  equipe: "bg-abobora-soft text-abobora-dark",
  ocupado: "bg-muted text-muted-foreground",
};
const LEGENDA: [Item["tipo"], string][] = [["lead", "Marcada pelo lead"], ["equipe", "Marcada pela equipe"], ["ocupado", "Ocupado no Google"]];
const TZ = "America/Sao_Paulo";
const dia = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const hora = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function periodo(modo: Modo, base: Date) {
  const ini = new Date(base.getFullYear(), modo === "mes" ? base.getMonth() : base.getMonth(), modo === "mes" ? 1 : base.getDate());
  ini.setDate(ini.getDate() - ini.getDay());
  const total = modo === "semana" ? 7 : 42;
  return Array.from({ length: total }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i));
}

function NovaReuniao({ aoCriar }: { aoCriar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [negocio, setNegocio] = useState<{ id: string; nome: string; email: string | null } | null>(null);
  const [inicio, setInicio] = useState("");
  const leads = useQuery({ queryKey: ["agenda-leads", busca], queryFn: () => api.leads(null, null, busca), enabled: aberto && busca.trim().length >= 2 });
  const criar = useMutation({
    mutationFn: () => api.googleNovaReuniao(negocio!.id, new Date(inicio).toISOString(), `Reunião WSA · ${negocio!.nome}`, negocio!.email),
    onSuccess: () => { toast.success("Reunião criada no Google Agenda."); setAberto(false); setNegocio(null); setBusca(""); setInicio(""); aoCriar(); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild><Button className="gap-1.5"><Plus className="size-4" />Nova reunião</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova reunião</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lead">Lead</Label>
            {negocio ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><b>{negocio.nome}</b>
                <button type="button" className="text-xs font-semibold text-primary" onClick={() => setNegocio(null)}>Trocar</button></div>
            ) : (
              <>
                <Input id="lead" className="mt-1" placeholder="Buscar nome, empresa ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <ul className="mt-1 max-h-44 overflow-y-auto">
                  {(leads.data ?? []).slice(0, 8).map((l) => (
                    <li key={l.negocio_id}><button type="button" className="min-h-10 w-full rounded-md px-2 text-left text-sm hover:bg-muted" onClick={() => setNegocio({ id: l.negocio_id, nome: l.nome, email: l.email })}>{l.nome}{l.empresa ? ` · ${l.empresa}` : ""}</button></li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div><Label htmlFor="ini">Início</Label><Input id="ini" className="mt-1" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <Button className="w-full" disabled={!negocio || !inicio || criar.isPending} onClick={() => criar.mutate()}>
            {criar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Criar no Google Agenda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Agendamentos() {
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("semana");
  const [base, setBase] = useState(() => new Date());
  const dias = useMemo(() => periodo(modo, base), [modo, base]);
  const de = dias[0]!.toISOString();
  const ate = new Date(dias[dias.length - 1]!.getTime() + 86_400_000).toISOString();

  const reunioes = useQuery({ queryKey: ["reunioes", de, ate], queryFn: () => api.reunioes(de, ate) });
  const ocupados = useQuery({ queryKey: ["ocupados", de, ate], queryFn: () => api.googleOcupados(de, ate), retry: false });
  const situacao = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api.reuniaoSituacao(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reunioes"] }),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const itens = useMemo<Item[]>(() => {
    const rs = reunioes.data ?? [];
    const proprias = rs.map((r): Item => ({ chave: r.id, inicio: r.inicio, fim: r.fim, titulo: r.empresa || r.lead || "Reunião", tipo: r.origem, r }));
    // O ocupado do Google inclui as nossas próprias reuniões; aqui só fica o que veio de fora.
    const fora = (ocupados.data?.ocupados ?? [])
      .filter((o) => !rs.some((r) => new Date(r.inicio).getTime() === new Date(o.inicio).getTime()))
      .map((o, i): Item => ({ chave: `o${i}`, inicio: o.inicio, fim: o.fim, titulo: "Ocupado", tipo: "ocupado" }));
    return [...proprias, ...fora].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [reunioes.data, ocupados.data]);

  const porDia = (d: Date) => itens.filter((i) => dia(i.inicio) === dia(d));
  const andar = (n: number) => setBase((b) => (modo === "semana" ? new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7 * n) : new Date(b.getFullYear(), b.getMonth() + n, 1)));
  const titulo = modo === "mes"
    ? base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : `${dias[0]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} a ${dias[6]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  const hoje = dia(new Date());
  const proximas = (reunioes.data ?? []).filter((r) => r.situacao === "marcada");

  return (
    <Pagina voltar="Gestão Comercial › Agendamentos" titulo="Agendamentos" texto="Reuniões marcadas pelos leads e pela equipe, junto dos horários ocupados no Google."
      acoes={<NovaReuniao aoCriar={() => qc.invalidateQueries({ queryKey: ["reunioes"] })} />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filtros<Modo> valor={modo} onChange={setModo} opcoes={[{ valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }]} />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => andar(-1)}><ChevronLeft className="size-4" /></Button>
          <b className="min-w-36 text-center text-sm first-letter:uppercase">{titulo}</b>
          <Button variant="outline" size="icon" aria-label="Próximo" onClick={() => andar(1)}><ChevronRight className="size-4" /></Button>
          <Button variant="outline" onClick={() => setBase(new Date())}>Hoje</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {LEGENDA.map(([t, r]) => <span key={t} className={cn("rounded-full px-2 py-0.5 font-semibold", COR[t])}>{r}</span>)}
      </div>
      {ocupados.error ? <p className="rounded-lg bg-warning-soft p-3 text-xs text-warning-strong">Não foi possível ler os horários ocupados do Google: {mensagemErro(ocupados.error)}</p> : null}

      {reunioes.isLoading ? <Carregando /> : reunioes.error ? <Erro erro={reunioes.error} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <div className="grid min-w-[760px] grid-cols-7">
            {SEMANA.map((s) => <div key={s} className="border-b border-border px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">{s}</div>)}
            {dias.map((d) => (
              <div key={d.toISOString()} className={cn("border-b border-r border-border p-1.5", modo === "semana" ? "min-h-64" : "min-h-24", modo === "mes" && d.getMonth() !== base.getMonth() && "bg-muted/40")}>
                <span className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold", dia(d) === hoje && "bg-primary text-primary-foreground")}>{d.getDate()}</span>
                <div className="space-y-1">
                  {porDia(d).map((i) => (
                    <div key={i.chave} title={`${hora(i.inicio)} às ${hora(i.fim)} · ${i.titulo}`} className={cn("truncate rounded px-1.5 py-1 text-[11.5px] font-semibold", COR[i.tipo], i.r?.situacao === "nao_compareceu" && "line-through opacity-60")}>
                      {hora(i.inicio)} {i.titulo}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Cartao icone="fluent-color:calendar-checkmark-24" titulo="Reuniões a confirmar neste período" semPadding>
        {proximas.length === 0 ? <Vazio icone="fluent-color:calendar-24" titulo="Nenhuma reunião marcada" texto="As reuniões marcadas pelo link ou pela equipe aparecem aqui." /> : (
          <ul className="divide-y divide-border">
            {proximas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link to="/funil" search={{ negocio: r.negocio_id }} className="font-semibold hover:text-primary">{r.lead || "Lead"}{r.empresa ? ` · ${r.empresa}` : ""}</Link>
                  <div className="text-xs text-muted-foreground">{new Date(r.inicio).toLocaleDateString("pt-BR", { timeZone: TZ })} às {hora(r.inicio)}{r.vendedor ? ` · ${r.vendedor}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {r.meet_url ? <a href={r.meet_url} target="_blank" rel="noreferrer" aria-label="Abrir Google Meet" className="text-muted-foreground hover:text-primary"><ExternalLink className="size-4" /></a> : null}
                  <Button size="sm" variant="outline" disabled={situacao.isPending} onClick={() => situacao.mutate({ id: r.id, s: "realizada" })}>Realizada</Button>
                  <Button size="sm" variant="outline" disabled={situacao.isPending} onClick={() => situacao.mutate({ id: r.id, s: "nao_compareceu" })}>Não compareceu</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </Pagina>
  );
}
