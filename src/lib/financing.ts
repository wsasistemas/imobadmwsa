/**
 * Cálculos de financiamento imobiliário.
 * Suporta sistemas Price (parcelas fixas) e SAC (amortização constante).
 */

export type SistemaAmortizacao = "price" | "sac";

export interface SimulacaoInput {
  valorImovel: number;
  entrada: number;
  prazoMeses: number;
  taxaAnual: number; // % ao ano (ex: 10.5)
  sistema: SistemaAmortizacao;
}

export interface ParcelaCalculada {
  numero: number;
  amortizacao: number;
  juros: number;
  parcela: number;
  saldoDevedor: number;
}

export interface SimulacaoResultado {
  valorFinanciado: number;
  taxaMensal: number;
  totalPago: number;
  totalJuros: number;
  primeiraParcela: number;
  ultimaParcela: number;
  parcelas: ParcelaCalculada[];
}

export function taxaAnualParaMensal(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
}

export function simular(input: SimulacaoInput): SimulacaoResultado {
  const { valorImovel, entrada, prazoMeses, taxaAnual, sistema } = input;
  const valorFinanciado = Math.max(0, valorImovel - entrada);
  const i = taxaAnualParaMensal(taxaAnual);
  const n = Math.max(1, Math.floor(prazoMeses));
  const parcelas: ParcelaCalculada[] = [];

  if (sistema === "price") {
    const parcela =
      i === 0 ? valorFinanciado / n : (valorFinanciado * i) / (1 - Math.pow(1 + i, -n));
    let saldo = valorFinanciado;
    for (let k = 1; k <= n; k++) {
      const juros = saldo * i;
      const amortizacao = parcela - juros;
      saldo = Math.max(0, saldo - amortizacao);
      parcelas.push({ numero: k, amortizacao, juros, parcela, saldoDevedor: saldo });
    }
  } else {
    const amortizacao = valorFinanciado / n;
    let saldo = valorFinanciado;
    for (let k = 1; k <= n; k++) {
      const juros = saldo * i;
      const parcela = amortizacao + juros;
      saldo = Math.max(0, saldo - amortizacao);
      parcelas.push({ numero: k, amortizacao, juros, parcela, saldoDevedor: saldo });
    }
  }

  const totalPago = parcelas.reduce((acc, p) => acc + p.parcela, 0);
  return {
    valorFinanciado,
    taxaMensal: i,
    totalPago,
    totalJuros: totalPago - valorFinanciado,
    primeiraParcela: parcelas[0]?.parcela ?? 0,
    ultimaParcela: parcelas[parcelas.length - 1]?.parcela ?? 0,
    parcelas,
  };
}

export function formatPercent(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}
