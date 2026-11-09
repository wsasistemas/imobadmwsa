import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { IconeColorido, type NomeIcone } from "@/components/icones/icone-colorido";
import type { Tom } from "@/lib/adm/formato";
import { nomeSistema, quando, SITUACAO } from "@/lib/adm/formato";
import type { EmpresaLista } from "@/lib/adm/api";
import { cn } from "@/lib/utils";

export function Pagina({ titulo, texto, acoes, voltar, children }: {
  titulo: string; texto?: ReactNode; acoes?: ReactNode; voltar?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {voltar ? <div className="mb-1 text-xs text-muted-foreground">{voltar}</div> : null}
          <h1 className="font-display text-2xl tracking-tight sm:text-[1.75rem]">{titulo}</h1>
          {texto ? <p className="mt-1 text-sm text-muted-foreground">{texto}</p> : null}
        </div>
        {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
      </div>
      {children}
    </div>
  );
}

const TILE: Record<Tom, string> = {
  ok: "bg-success-soft", war: "bg-warning-soft", err: "bg-destructive/10", info: "bg-primary-soft", neu: "bg-muted",
};

export function Kpi({ icone, tom, rotulo, valor, detalhe }: { icone: NomeIcone; tom: Tom; rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm sm:gap-3.5 sm:p-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-12", TILE[tom])}>
        <IconeColorido nome={icone} tamanho={26} />
      </span>
      <div className="min-w-0">
        <small className="block truncate text-xs font-medium text-muted-foreground">{rotulo}</small>
        <b className="block truncate text-lg font-extrabold tracking-tight sm:text-xl">{valor}</b>
        {detalhe ? <span className="hidden truncate text-xs text-muted-foreground sm:block">{detalhe}</span> : null}
      </div>
    </div>
  );
}

export function Cartao({ icone, titulo, extra, children, className, semPadding }: {
  icone?: NomeIcone; titulo?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; semPadding?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      {titulo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            {icone ? <IconeColorido nome={icone} tamanho={20} /> : null}
            {titulo}
          </h3>
          {extra}
        </div>
      ) : null}
      <div className={semPadding ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const SELO: Record<Tom, string> = {
  ok: "bg-success-soft text-success",
  war: "bg-warning-soft text-warning-strong",
  err: "bg-destructive/10 text-destructive",
  info: "bg-info-soft text-info",
  neu: "bg-muted text-muted-foreground",
};

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", SELO[tom])}>{children}</span>;
}

export function Chip({ app, desligado }: { app: string; desligado?: boolean }) {
  return (
    <span className={cn(
      "mr-1 inline-flex rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold",
      desligado ? "border-destructive/30 bg-destructive/5 text-destructive line-through" : "border-primary/20 bg-primary-soft text-primary-dark",
    )}>
      {nomeSistema(app)}
    </span>
  );
}

export function Filtros<T extends string>({ opcoes, valor, onChange }: {
  opcoes: { valor: T; rotulo: string; total?: number }[]; valor: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors max-md:min-h-11",
            o.valor === valor ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
          )}
        >
          {o.rotulo}
          {o.total !== undefined ? <em className="ml-1.5 not-italic opacity-75">{o.total}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function Carregando() {
  return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-primary" /></div>;
}

export function Vazio({ icone, titulo, texto, acao }: { icone: NomeIcone; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-muted"><IconeColorido nome={icone} tamanho={34} /></span>
      <b className="mt-3 text-[15px]">{titulo}</b>
      {texto ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{texto}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function Erro({ erro }: { erro: unknown }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {(erro as { message?: string })?.message ?? "Não foi possível carregar."}
    </div>
  );
}

/** Tabela com rolagem horizontal no celular. */
export function Tabela({ cabecalho, children }: { cabecalho: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
            {cabecalho.map((c, i) => <th key={i} className="px-4 py-2.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function SeloSituacao({ e }: { e: Pick<EmpresaLista, "situacao" | "dias_atraso" | "suspende_em"> }) {
  const s = SITUACAO[e.situacao];
  if (e.situacao === "atraso") {
    return <Selo tom={e.dias_atraso >= 8 ? "err" : "war"}>Atraso {e.dias_atraso} {e.dias_atraso === 1 ? "dia" : "dias"}{e.suspende_em && quando(e.suspende_em) === "hoje, 00:05" ? " · suspende hoje" : ""}</Selo>;
  }
  if (e.situacao === "suspensa" && e.dias_atraso > 0) return <Selo tom="err">Suspensa · {e.dias_atraso} dias</Selo>;
  return <Selo tom={s.tom}>{s.rotulo}</Selo>;
}
