import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, FileText, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import { useTipologias } from "@/hooks/useTipologias";
import { useCondicoesPagamento } from "@/hooks/useCondicoesPagamento";
import { useLeads } from "@/hooks/useLeads";
import { useCreateAtividade } from "@/hooks/useAtividades";
import { useAuth } from "@/hooks/useAuth";
import { simular, type SistemaAmortizacao, formatPercent } from "@/lib/financing";
import { formatBRL } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/simulador")({
  component: Simulador,
});

function Simulador() {
  const { usuario } = useAuth();
  const { data: empreendimentos = [] } = useEmpreendimentos();
  const { data: leads = [] } = useLeads();

  const [empreendimentoId, setEmpreendimentoId] = useState<string>("");
  const [tipologiaId, setTipologiaId] = useState<string>("");
  const [condicaoId, setCondicaoId] = useState<string>("");
  const [leadId, setLeadId] = useState<string>("");

  const { data: tipologias = [] } = useTipologias(empreendimentoId || undefined);
  const { data: condicoes = [] } = useCondicoesPagamento(empreendimentoId || undefined);

  const [valorImovel, setValorImovel] = useState<number>(0);
  const [entrada, setEntrada] = useState<number>(0);
  const [prazoMeses, setPrazoMeses] = useState<number>(360);
  const [taxaAnual, setTaxaAnual] = useState<number>(10.5);
  const [sistema, setSistema] = useState<SistemaAmortizacao>("price");

  const empreendimento = empreendimentos.find((e) => e.id === empreendimentoId);
  const tipologia = tipologias.find((t) => t.id === tipologiaId);
  const condicao = condicoes.find((c) => c.id === condicaoId);

  function aplicarTipologia(id: string) {
    setTipologiaId(id);
    const t = tipologias.find((x) => x.id === id);
    if (t?.valor) setValorImovel(Number(t.valor));
  }

  function aplicarCondicao(id: string) {
    setCondicaoId(id);
    const c = condicoes.find((x) => x.id === id);
    if (c?.entrada_percentual && valorImovel > 0) {
      setEntrada(Math.round((valorImovel * Number(c.entrada_percentual)) / 100));
    }
    if (c?.parcelas_obra) setPrazoMeses(Number(c.parcelas_obra) + (c.parcelas_pos_chaves ?? 0));
  }

  const resultado = useMemo(
    () =>
      simular({
        valorImovel: Number(valorImovel) || 0,
        entrada: Number(entrada) || 0,
        prazoMeses: Number(prazoMeses) || 1,
        taxaAnual: Number(taxaAnual) || 0,
        sistema,
      }),
    [valorImovel, entrada, prazoMeses, taxaAnual, sistema],
  );

  const parcelasPreview = useMemo(() => {
    const p = resultado.parcelas;
    if (p.length <= 8) return p;
    return [...p.slice(0, 4), ...p.slice(-2)];
  }, [resultado.parcelas]);

  const criarAtividade = useCreateAtividade();

  async function salvarComoAtividade() {
    if (!leadId) {
      toast.error("Selecione um lead para vincular a simulação");
      return;
    }
    if (!usuario) return;

    const linhas = [
      empreendimento ? `Empreendimento: ${empreendimento.nome}` : null,
      tipologia ? `Tipologia: ${tipologia.nome}` : null,
      condicao ? `Condição: ${condicao.nome}` : null,
      `Valor do imóvel: ${formatBRL(valorImovel)}`,
      `Entrada: ${formatBRL(entrada)}`,
      `Financiado: ${formatBRL(resultado.valorFinanciado)}`,
      `Prazo: ${prazoMeses} meses`,
      `Taxa: ${taxaAnual}% a.a. (${formatPercent(resultado.taxaMensal, 3)} a.m.)`,
      `Sistema: ${sistema.toUpperCase()}`,
      `Primeira parcela: ${formatBRL(resultado.primeiraParcela)}`,
      `Última parcela: ${formatBRL(resultado.ultimaParcela)}`,
      `Total pago: ${formatBRL(resultado.totalPago)}`,
      `Juros totais: ${formatBRL(resultado.totalJuros)}`,
    ]
      .filter(Boolean)
      .join("\n");

    await criarAtividade.mutateAsync({
      lead_id: leadId,
      usuario_id: usuario.userId,
      tipo: "nota",
      titulo: `Simulação — ${empreendimento?.nome ?? "financiamento"}`,
      descricao: linhas,
      data: new Date().toISOString(),
      duracao_minutos: null,
      concluida: true,
    });
  }

  return (
    <div>
      <PageHeader
        title="Simulador de financiamento"
        description="Monte propostas rápidas para os leads com base em Price ou SAC."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Parâmetros */}
        <Card className="card-radius">
          <CardHeader>
            <CardTitle className="text-base">Parâmetros</CardTitle>
            <CardDescription>Selecione o empreendimento ou informe os valores livremente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Empreendimento</Label>
                <Select
                  value={empreendimentoId}
                  onValueChange={(v) => {
                    setEmpreendimentoId(v);
                    setTipologiaId("");
                    setCondicaoId("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {empreendimentos.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipologia</Label>
                <Select value={tipologiaId} onValueChange={aplicarTipologia} disabled={!empreendimentoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {tipologias.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} — {formatBRL(t.valor ?? 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Condição de pagamento</Label>
              <Select value={condicaoId} onValueChange={aplicarCondicao} disabled={!empreendimentoId}>
                <SelectTrigger><SelectValue placeholder="Opcional — preenche entrada e prazo" /></SelectTrigger>
                <SelectContent>
                  {condicoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Valor do imóvel (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={valorImovel || ""}
                  onChange={(e) => setValorImovel(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Entrada (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={entrada || ""}
                  onChange={(e) => setEntrada(Number(e.target.value))}
                />
                {valorImovel > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {((entrada / valorImovel) * 100).toFixed(1)}% do imóvel
                  </p>
                )}
              </div>
              <div>
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={420}
                  value={prazoMeses || ""}
                  onChange={(e) => setPrazoMeses(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Taxa de juros (% a.a.)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={taxaAnual || ""}
                  onChange={(e) => setTaxaAnual(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Sistema de amortização</Label>
              <RadioGroup
                value={sistema}
                onValueChange={(v) => setSistema(v as SistemaAmortizacao)}
                className="flex gap-6"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="price" /> Price (parcela fixa)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="sac" /> SAC (amortização constante)
                </label>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card className="card-radius">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-primary" />
              Resultado da simulação
            </CardTitle>
            <CardDescription>Valores estimados — não substituem análise de crédito bancário.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Financiado" value={formatBRL(resultado.valorFinanciado)} />
              <Metric label="1ª parcela" value={formatBRL(resultado.primeiraParcela)} highlight />
              <Metric label="Última parcela" value={formatBRL(resultado.ultimaParcela)} />
              <Metric label="Taxa mensal" value={formatPercent(resultado.taxaMensal, 3)} />
              <Metric label="Total pago" value={formatBRL(resultado.totalPago)} />
              <Metric label="Juros totais" value={formatBRL(resultado.totalJuros)} />
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prévia das parcelas
              </p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Juros</TableHead>
                      <TableHead>Amortização</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelasPreview.map((p, idx) => {
                      const isBreak = idx === 4 && resultado.parcelas.length > 8;
                      return (
                        <Fragment key={p.numero}>
                          {isBreak && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                                … {resultado.parcelas.length - 6} parcelas ocultas …
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell className="font-mono">{p.numero}</TableCell>
                            <TableCell>{formatBRL(p.parcela)}</TableCell>
                            <TableCell>{formatBRL(p.juros)}</TableCell>
                            <TableCell>{formatBRL(p.amortizacao)}</TableCell>
                            <TableCell className="text-right">{formatBRL(p.saldoDevedor)}</TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" /> Vincular a um lead
                </Label>
                <Select value={leadId} onValueChange={setLeadId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={salvarComoAtividade}
                disabled={!leadId || criarAtividade.isPending || resultado.valorFinanciado <= 0}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                {criarAtividade.isPending ? "Salvando..." : "Salvar simulação no lead"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight ? "border-primary/40 bg-primary/5" : "bg-muted/30"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
