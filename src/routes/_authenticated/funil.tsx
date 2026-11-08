import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useState, type DragEvent } from "react";
import { toast } from "sonner";

import { FichaLead, NovoContato, PerderNegocio, RegrasClassificacao, SeloTemperatura, useRecarregarComercial } from "@/components/adm/comercial";
import { Carregando, Erro, Filtros, Pagina } from "@/components/adm/ui";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { api, mensagemErro, type CardNegocio } from "@/lib/adm/api";
import { brl, COR_ETAPA, dataHora, ha, ORIGEM, TEMPERATURA } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Gestão Comercial › Funil de Vendas (mockup v2). Arrastar o card muda a etapa; "Perdido" pede o motivo;
// "Ganho" cria a empresa em Empresas. Dentro da coluna, quentes primeiro.
export const Route = createFileRoute("/_authenticated/funil")({
  validateSearch: (s: Record<string, unknown>) => ({ negocio: typeof s.negocio === "string" ? s.negocio : undefined }),
  head: () => ({ meta: [{ title: "Funil de Vendas — ImobAdm WSA" }] }),
  component: Funil,
});

const SISTEMAS = ["imobsystem", "imobdoces", "imobenviomassa", "imobdesk", "imobpesagens", "imobeducacional", "suprimentos"];

function Funil() {
  const { negocio } = Route.useSearch();
  const navigate = useNavigate({ from: "/funil" });
  const [sistema, setSistema] = useState("todos");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [perder, setPerder] = useState<string | null>(null);
  const [regras, setRegras] = useState(false);
  const recarregar = useRecarregarComercial();

  const q = useQuery({ queryKey: ["funil", sistema], queryFn: () => api.funil(sistema === "todos" ? null : sistema) });
  const mover = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: string }) => api.moverEtapa(id, etapa),
    onSuccess: (r) => { toast.success(r.empresa_id ? "Ganho! A empresa foi criada em Empresas." : "Etapa alterada."); recarregar(); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const abrir = (id: string | undefined) => navigate({ search: { negocio: id }, replace: true });

  const soltar = (e: DragEvent, etapa: string) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/plain") || arrastando;
    setArrastando(null);
    if (!id) return;
    const atual = q.data?.find((c) => c.negocios.some((n) => n.negocio_id === id))?.chave;
    if (atual === etapa) return;
    if (etapa === "perdido") setPerder(id);
    else mover.mutate({ id, etapa });
  };

  return (
    <Pagina
      voltar="Gestão Comercial › Funil de Vendas"
      titulo="Funil de Vendas"
      texto="Arraste os cards entre as etapas. Lead quente entra direto em Qualificação; em cada coluna, os quentes ficam no topo."
      acoes={<>
        <Button variant="outline" className="gap-1.5" onClick={() => setRegras(true)}><SlidersHorizontal className="size-4" />Regras de classificação</Button>
        <NovoContato gatilho={<Button className="gap-1.5"><Plus className="size-4" />Novo contato</Button>} />
      </>}
    >
      <Filtros<string>
        valor={sistema}
        onChange={setSistema}
        opcoes={[{ valor: "todos", rotulo: "Todos os sistemas" }, ...SISTEMAS.map((s) => ({ valor: s, rotulo: s }))]}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["quente", "morno", "frio"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1"><IconeColorido nome={TEMPERATURA[t].icone} tamanho={14} />
            <b className="text-foreground">{TEMPERATURA[t].rotulo}</b> {TEMPERATURA[t].texto.toLowerCase()}</span>
        ))}
      </div>

      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {(q.data ?? []).map((col) => (
            <div
              key={col.chave}
              onDragOver={(e) => { e.preventDefault(); setSobre(col.chave); }}
              onDragLeave={() => setSobre((s) => (s === col.chave ? null : s))}
              onDrop={(e) => soltar(e, col.chave)}
              className={cn("flex w-[268px] shrink-0 flex-col rounded-xl border border-border bg-muted/40 transition-colors",
                sobre === col.chave && "border-primary bg-primary-soft")}
            >
              <div className="border-b border-border px-3 py-2.5">
                <div className={cn("mb-2 h-1 rounded-full", COR_ETAPA[col.cor]?.barra ?? "bg-primary")} />
                <h4 className="flex items-baseline justify-between gap-2 text-sm font-bold">
                  {col.nome}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {col.total}{col.final ? " em 30 dias" : ""}{Number(col.valor) > 0 ? ` · ${brl(col.valor)}` : ""}
                  </span>
                </h4>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {col.negocios.map((n) => (
                  <CardFunil key={n.negocio_id} n={n} onAbrir={() => abrir(n.negocio_id)}
                    onArrastar={(e) => { e.dataTransfer.setData("text/plain", n.negocio_id); setArrastando(n.negocio_id); }} />
                ))}
                {col.negocios.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Solte um card aqui</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-3 text-sm">
        <IconeColorido nome="fluent-color:trophy-24" tamanho={22} />
        <p><b>Ganho vira cliente:</b> ao mover para "Ganho", o sistema cria a <b>Empresa</b> com os dados do contato. Abra a empresa para completar o CNPJ, vincular os sistemas e criar a assinatura no Asaas.</p>
      </div>

      <PerderNegocio negocioId={perder} aberto={!!perder} setAberto={(v) => { if (!v) setPerder(null); }} />
      <RegrasClassificacao aberto={regras} setAberto={setRegras} />
      <FichaLead negocioId={negocio ?? null} onFechar={() => abrir(undefined)} />
    </Pagina>
  );
}

function CardFunil({ n, onAbrir, onArrastar }: { n: CardNegocio; onAbrir: () => void; onArrastar: (e: DragEvent) => void }) {
  const atrasado = n.prazo_em && new Date(n.prazo_em).getTime() < Date.now();
  const o = ORIGEM[n.origem];
  return (
    <button
      type="button"
      draggable
      onDragStart={onArrastar}
      onClick={onAbrir}
      className={cn("w-full cursor-grab rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:shadow-md active:cursor-grabbing",
        n.temperatura === "quente" ? "border-destructive/40" : "border-border")}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="line-clamp-1 text-[13.5px]">{n.nome}</b>
        <SeloTemperatura t={n.temperatura} compacto />
      </div>
      {n.empresa ? <p className="line-clamp-1 text-xs text-muted-foreground">{n.empresa}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {o ? <IconeColorido nome={o.icone} tamanho={14} /> : null}{o?.rotulo ?? n.origem} · {ha(n.criado_em)}
        </span>
        {n.valor ? <b>{brl(n.valor)}</b> : n.pontuacao != null ? <span className="text-muted-foreground">{n.pontuacao} pts</span> : null}
      </div>
      {n.reuniao ? (
        <div className="mt-2 flex items-center gap-1 rounded-md bg-info-soft px-2 py-1 text-[11.5px] font-semibold text-info">
          <IconeColorido nome="fluent-color:video-24" tamanho={13} />{dataHora(n.reuniao.inicio)}
        </div>
      ) : n.etapa === "perdido" && n.motivo_perda ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground">Motivo: {n.motivo_perda}</p>
      ) : n.etapa === "ganho" ? (
        <p className="mt-2 text-[11.5px] font-semibold text-success">{n.empresa_id ? "Empresa criada" : "Ganho"}</p>
      ) : n.proxima_acao ? (
        <p className={cn("mt-2 line-clamp-2 rounded-md px-2 py-1 text-[11.5px]", atrasado ? "bg-destructive/10 font-semibold text-destructive" : "bg-muted text-muted-foreground")}>
          {atrasado ? "Atrasado: " : ""}{n.proxima_acao}
        </p>
      ) : null}
    </button>
  );
}
