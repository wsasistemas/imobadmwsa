import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { RegistrarPagamento } from "@/components/adm/dialogos";
import { Carregando, Cartao, Erro, Filtros, Kpi, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { api, type FaturaLista } from "@/lib/adm/api";
import { brl, competencia, data, SITUACAO_FATURA } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/mensalidades")({
  head: () => ({ meta: [{ title: "Mensalidades — ImobAdm WSA" }] }),
  component: Mensalidades,
});

type Filtro = "em_atraso" | "a_vencer" | "paga" | "cancelada";

const soma = (l: FaturaLista[]) => l.reduce((s, f) => s + Number(f.valor), 0);

function Mensalidades() {
  const [filtro, setFiltro] = useState<Filtro>("em_atraso");
  const q = useQuery({ queryKey: ["faturas"], queryFn: () => api.listarFaturas(null) });
  const todas = q.data ?? [];
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const mes = hoje.slice(0, 7);

  const grupos: Record<Filtro, FaturaLista[]> = {
    em_atraso: todas.filter((f) => f.dias_atraso > 0),
    a_vencer: todas.filter((f) => f.situacao === "a_vencer" && f.dias_atraso === 0),
    paga: todas.filter((f) => f.situacao === "paga").sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em))),
    cancelada: todas.filter((f) => f.situacao === "cancelada" || f.situacao === "estornada"),
  };
  const ate10 = grupos.em_atraso.filter((f) => f.dias_atraso <= 10);
  const mais10 = grupos.em_atraso.filter((f) => f.dias_atraso > 10);
  const recebidoMes = grupos.paga.filter((f) => (f.pago_em ?? "").slice(0, 7) === mes);
  const lista = filtro === "em_atraso" ? [...grupos.em_atraso].sort((a, b) => b.dias_atraso - a.dias_atraso) : grupos[filtro];
  const nomeMes = new Date().toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });

  return (
    <Pagina titulo="Mensalidades" texto="Uma fatura por empresa por mês (soma dos sistemas). As do Asaas chegam e são baixadas sozinhas pelo webhook.">
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi icone="flat-color-icons:calendar" tom="info" rotulo="A vencer" valor={brl(soma(grupos.a_vencer))} detalhe={`${grupos.a_vencer.length} faturas`} />
            <Kpi icone="fluent-color:clock-24" tom="war" rotulo="Atraso 1 a 10 dias" valor={brl(soma(ate10))} detalhe={`${ate10.length} faturas · ainda no ar`} />
            <Kpi icone="flat-color-icons:lock" tom="err" rotulo="Atraso +10 dias" valor={brl(soma(mais10))} detalhe={`${mais10.length} faturas · suspensas`} />
            <Kpi icone="flat-color-icons:currency-exchange" tom="ok" rotulo={`Recebido em ${nomeMes}`} valor={brl(soma(recebidoMes))} detalhe={`${recebidoMes.length} faturas`} />
          </div>

          <Filtros<Filtro> valor={filtro} onChange={setFiltro} opcoes={[
            { valor: "a_vencer", rotulo: "A vencer", total: grupos.a_vencer.length },
            { valor: "em_atraso", rotulo: "Em atraso", total: grupos.em_atraso.length },
            { valor: "paga", rotulo: "Pagas", total: grupos.paga.length },
            { valor: "cancelada", rotulo: "Canceladas", total: grupos.cancelada.length },
          ]} />

          <Cartao semPadding>
            {lista.length === 0 ? (
              <Vazio icone="fluent-color:receipt-24" titulo="Nenhuma fatura aqui" texto={filtro === "em_atraso" ? "Nenhuma mensalidade em atraso." : "As faturas aparecem quando o Asaas gera a cobrança de cada empresa."} />
            ) : (
              <Tabela cabecalho={["Empresa", "Competência", "Vencimento", "Valor", filtro === "paga" ? "Pago em" : "Atraso", "Acesso", ""]}>
                {lista.map((f) => {
                  const s = SITUACAO_FATURA[f.situacao];
                  return (
                    <tr key={f.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3"><Link to="/empresas/$id" params={{ id: f.empresa_id }} className="font-semibold hover:text-primary">{f.empresa}</Link></td>
                      <td className="px-4 py-3">{competencia(f.competencia)}</td>
                      <td className="px-4 py-3">{data(f.vencimento)}</td>
                      <td className="px-4 py-3 font-semibold">{brl(f.valor)}</td>
                      <td className="px-4 py-3">
                        {filtro === "paga" ? `${data(f.pago_em)}${f.forma ? ` · ${f.forma}` : ""}`
                          : f.dias_atraso > 0 ? <Selo tom={f.dias_atraso > 10 ? "err" : "war"}>{f.dias_atraso} {f.dias_atraso === 1 ? "dia" : "dias"}</Selo>
                          : <Selo tom={s.tom}>{s.rotulo}</Selo>}
                      </td>
                      <td className="px-4 py-3">
                        {f.empresa_liberada ? <Selo tom="ok">No ar</Selo> : <Selo tom="err">Suspenso</Selo>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {f.invoice_url ? <a href={f.invoice_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" title="Abrir fatura"><ExternalLink className="size-4" /></a> : null}
                          {f.situacao === "a_vencer" || f.situacao === "vencida" ? (
                            <RegistrarPagamento faturaId={f.id} valor={f.valor} empresa={f.empresa}
                              gatilho={<Button size="sm" className="h-7 bg-success text-xs text-success-foreground hover:bg-success/90">Registrar pagamento</Button>} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Tabela>
            )}
          </Cartao>
        </>
      )}
    </Pagina>
  );
}
