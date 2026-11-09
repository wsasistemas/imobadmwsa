import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";

import { Origem } from "@/components/adm/comercial";
import { Carregando, Cartao, Chip, Erro, Filtros, Kpi, Pagina, Tabela, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Relatorio } from "@/lib/adm/api";
import { brl, data, TEMPERATURA } from "@/lib/adm/formato";

// Gestão Comercial › Relatórios Comerciais (mockup v2): de onde vêm os leads e quanto cada fonte converte
// (lead → qualificado → reunião → ganho → receita nova), funil do período, perdas e exportação em CSV.
export const Route = createFileRoute("/_authenticated/relatorios-comerciais")({
  head: () => ({ meta: [{ title: "Relatórios Comerciais — ImobAdm WSA" }] }),
  component: Relatorios,
});

type Periodo = "30" | "90" | "mes" | "ano" | "livre";

const hojeBr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const menosDias = (n: number) => { const d = new Date(`${hojeBr()}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function intervalo(p: Periodo, ini: string, fim: string): [string, string] {
  const hoje = hojeBr();
  if (p === "30") return [menosDias(29), hoje];
  if (p === "90") return [menosDias(89), hoje];
  if (p === "mes") return [`${hoje.slice(0, 8)}01`, hoje];
  if (p === "ano") return [`${hoje.slice(0, 4)}-01-01`, hoje];
  return [ini || menosDias(29), fim || hoje];
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

function baixarCsv(r: Relatorio) {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ["entrou", "nome", "empresa", "whatsapp", "email", "origem", "temperatura", "etapa", "sistemas", "valor", "motivo_perda"];
  const linhas = [cols.join(";"), ...r.linhas.map((l) => cols.map((c) => esc(l[c])).join(";"))];
  linhas.push("", ["origem", "leads", "qualificados", "reunioes", "ganhos", "perdidos", "receita"].join(";"));
  for (const f of r.por_fonte) linhas.push([f.origem, f.leads, f.qualificados, f.reunioes, f.ganhos, f.perdidos, f.receita].join(";"));
  const blob = new Blob([`﻿${linhas.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `relatorio-comercial_${r.periodo.inicio}_${r.periodo.fim}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Barra({ rotulo, valor, max, detalhe }: { rotulo: React.ReactNode; valor: number; max: number; detalhe?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate">{rotulo}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? Math.max(2, (valor / max) * 100) : 0}%` }} />
      </div>
      <span className="w-20 text-right font-semibold tabular-nums">{valor}{detalhe ? <span className="ml-1 text-xs font-normal text-muted-foreground">{detalhe}</span> : null}</span>
    </div>
  );
}

function Relatorios() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [a, b] = intervalo(periodo, ini, fim);
  const q = useQuery({ queryKey: ["relatorio", a, b], queryFn: () => api.relatorio(a, b) });
  const r = q.data;
  const t = r?.totais;
  const maxEtapa = Math.max(0, ...(r?.por_etapa ?? []).map((e) => e.total));
  const maxSis = Math.max(0, ...(r?.por_sistema ?? []).map((s) => s.leads));
  const maxPerda = Math.max(0, ...(r?.motivos_perda ?? []).map((m) => m.total));

  return (
    <Pagina
      voltar="Gestão Comercial › Relatórios Comerciais"
      titulo="Relatórios Comerciais"
      texto="De onde vêm os leads e quanto cada fonte vira reunião, cliente e receita nova. Conta os negócios que entraram no período."
      acoes={r ? <Button variant="outline" className="gap-1.5" onClick={() => baixarCsv(r)}><Download className="size-4" />Exportar CSV</Button> : null}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Filtros<Periodo>
          valor={periodo}
          onChange={setPeriodo}
          opcoes={[
            { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }, { valor: "mes", rotulo: "Este mês" },
            { valor: "ano", rotulo: "Este ano" }, { valor: "livre", rotulo: "Escolher datas" },
          ]}
        />
        {periodo === "livre" ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="h-9 w-40 bg-card" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 w-40 bg-card" />
          </div>
        ) : <span className="text-sm text-muted-foreground">{data(a)} a {data(b)}</span>}
      </div>

      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !r || !t ? null : t.leads === 0 ? (
        <Cartao><Vazio icone="fluent-color:chart-multiple-24" titulo="Nenhum lead no período" texto="Escolha outro período." /></Cartao>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi icone="fluent-color:person-add-24" tom="info" rotulo="Leads" valor={t.leads} />
            <Kpi icone="fluent-color:poll-24" tom="info" rotulo="Qualificados" valor={t.qualificados} detalhe={`${pct(t.qualificados, t.leads)} dos leads`} />
            <Kpi icone="fluent-color:calendar-checkmark-24" tom="war" rotulo="Reuniões" valor={t.reunioes} detalhe={`${pct(t.reunioes, t.leads)} dos leads`} />
            <Kpi icone="fluent-color:trophy-24" tom="ok" rotulo="Ganhos" valor={t.ganhos} detalhe={`${pct(t.ganhos, t.leads)} dos leads · ${t.perdidos} perdidos`} />
            <Kpi icone="flat-color-icons:bullish" tom="ok" rotulo="Receita nova (mensal)" valor={brl(t.receita)} />
          </div>

          <Cartao icone="fluent-color:chart-multiple-24" titulo="Conversão por fonte" semPadding>
            <Tabela cabecalho={["Fonte", "Leads", "Qualificados", "Reuniões", "Ganhos", "Perdidos", "Receita nova"]}>
              {r.por_fonte.map((f) => (
                <tr key={f.origem}>
                  <td className="px-4 py-3"><Origem origem={f.origem} /></td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{f.leads}</td>
                  <td className="px-4 py-3 tabular-nums">{f.qualificados} <span className="text-xs text-muted-foreground">{pct(f.qualificados, f.leads)}</span></td>
                  <td className="px-4 py-3 tabular-nums">{f.reunioes} <span className="text-xs text-muted-foreground">{pct(f.reunioes, f.leads)}</span></td>
                  <td className="px-4 py-3 tabular-nums">{f.ganhos} <span className="text-xs text-muted-foreground">{pct(f.ganhos, f.leads)}</span></td>
                  <td className="px-4 py-3 tabular-nums">{f.perdidos}</td>
                  <td className="px-4 py-3 font-semibold">{Number(f.receita) > 0 ? brl(f.receita) : "—"}</td>
                </tr>
              ))}
            </Tabela>
          </Cartao>

          <div className="grid gap-4 xl:grid-cols-2">
            <Cartao icone="fluent-color:board-24" titulo="Onde estão os negócios do período">
              <div className="space-y-2.5">
                {r.por_etapa.map((e) => <Barra key={e.chave} rotulo={e.nome} valor={e.total} max={maxEtapa} />)}
              </div>
            </Cartao>
            <Cartao icone="flat-color-icons:high-priority" titulo="Temperatura × ganho">
              <div className="space-y-2.5">
                {(["quente", "morno", "frio"] as const).map((k) => {
                  const x = r.por_temperatura.find((p) => p.temperatura === k);
                  return <Barra key={k} rotulo={TEMPERATURA[k].rotulo} valor={x?.leads ?? 0} max={t.leads} detalhe={x ? `${x.ganhos} ganho(s)` : undefined} />;
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Se os frios ganham tanto quanto os quentes, vale ajustar as Regras de classificação no Funil.</p>
            </Cartao>
            <Cartao icone="fluent-color:apps-24" titulo="Interesse por sistema">
              <div className="space-y-2.5">
                {r.por_sistema.map((s) => (
                  <Barra key={s.sistema} rotulo={s.sistema === "sem sistema" ? <span className="text-muted-foreground">sem sistema</span> : <Chip app={s.sistema} />}
                    valor={s.leads} max={maxSis} detalhe={s.ganhos ? `${s.ganhos} ganho(s)` : undefined} />
                ))}
              </div>
            </Cartao>
            <Cartao icone="flat-color-icons:cancel" titulo="Por que perdemos">
              {r.motivos_perda.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum negócio perdido no período.</p> : (
                <div className="space-y-2.5">
                  {r.motivos_perda.map((m) => <Barra key={m.motivo} rotulo={m.motivo} valor={m.total} max={maxPerda} />)}
                </div>
              )}
            </Cartao>
          </div>

          <Cartao icone="flat-color-icons:timeline" titulo="Leads por semana">
            <div className="flex h-40 items-end gap-2">
              {r.por_semana.map((s) => {
                const max = Math.max(...r.por_semana.map((x) => x.leads));
                return (
                  <div key={s.semana} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Semana de ${data(s.semana)}: ${s.leads} lead(s), ${s.ganhos} ganho(s)`}>
                    <span className="text-xs font-semibold tabular-nums">{s.leads}</span>
                    <div className="w-full max-w-12 rounded-t-md bg-primary" style={{ height: `${max > 0 ? Math.max(4, (s.leads / max) * 110) : 0}px` }} />
                    <span className="truncate text-[11px] text-muted-foreground">{data(s.semana).slice(0, 5)}</span>
                  </div>
                );
              })}
            </div>
          </Cartao>
        </>
      )}
    </Pagina>
  );
}
