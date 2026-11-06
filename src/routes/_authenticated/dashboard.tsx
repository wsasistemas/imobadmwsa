import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { NovaEmpresa } from "@/components/adm/dialogos";
import { Carregando, Cartao, Chip, Erro, Kpi, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { IconeColorido, type NomeIcone } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/adm/api";
import { brl, cnpj, data, quando } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel — ImobAdm WSA" }] }),
  component: Painel,
});

const PASSOS_VISUAIS: { rotulo: string; texto: string; icone: NomeIcone; fim?: boolean }[] = [
  { rotulo: "D-3", texto: "Lembrete com o link do boleto/PIX", icone: "flat-color-icons:calendar" },
  { rotulo: "D0 · vencimento", texto: "A fatura vence", icone: "fluent-color:receipt-24" },
  { rotulo: "D+1", texto: "Aviso no WhatsApp e faixa amarela no sistema", icone: "fluent-color:send-24" },
  { rotulo: "D+5", texto: "2º aviso: faltam 5 dias para a suspensão", icone: "fluent-color:chat-24" },
  { rotulo: "D+8", texto: "Último aviso ao dono da empresa", icone: "fluent-color:alert-24" },
  { rotulo: "D+11 · suspensão", texto: "Depois de 10 dias de tolerância o acesso cai em todos os sistemas da empresa", icone: "flat-color-icons:lock", fim: true },
];

function proximaRodada() {
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const alvo = new Date(agora);
  alvo.setHours(0, 5, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  const min = Math.round((alvo.getTime() - agora.getTime()) / 60000);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

const CORES = ["var(--primary)", "var(--abobora)", "var(--info)", "var(--success)", "var(--chart-4)", "var(--chart-5)"];

function Painel() {
  const q = useQuery({ queryKey: ["painel"], queryFn: api.painel });
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <Pagina
      titulo="Painel de assinaturas"
      texto={`Todas as empresas de todos os sistemas WSA · hoje, ${hoje}`}
      acoes={<NovaEmpresa gatilho={<Button className="gap-1.5"><Plus className="size-4" />Nova empresa</Button>} />}
    >
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : q.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="flat-color-icons:bullish" tom="info" rotulo="Receita mensal (MRR)" valor={brl(q.data.mrr)} detalhe={`${q.data.com_assinatura} empresas com assinatura`} />
            <Kpi icone="flat-color-icons:ok" tom="ok" rotulo="Empresas em dia" valor={q.data.em_dia} detalhe={`de ${q.data.com_assinatura} com assinatura`} />
            <Kpi icone="fluent-color:warning-24" tom="war" rotulo="Em atraso (1 a 10 dias)" valor={q.data.em_atraso} detalhe={`${brl(q.data.em_atraso_valor)} em aberto`} />
            <Kpi icone="flat-color-icons:cancel" tom="err" rotulo="Suspensas (+10 dias)" valor={q.data.suspensas} detalhe="sistema fora do ar" />
          </div>

          <Cartao icone="flat-color-icons:timeline" titulo="Régua automática de cobrança" extra={<span className="text-xs text-muted-foreground">Roda todo dia às 00:05 · próxima em {proximaRodada()}</span>}>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {PASSOS_VISUAIS.map((p) => (
                <li key={p.rotulo} className="flex flex-col items-center text-center">
                  <span className={`flex size-12 items-center justify-center rounded-full border-2 ${p.fim ? "border-destructive/40 bg-destructive/5" : "border-primary/25 bg-primary-soft"}`}>
                    <IconeColorido nome={p.icone} tamanho={24} />
                  </span>
                  <b className={`mt-2 text-[13px] ${p.fim ? "text-destructive" : ""}`}>{p.rotulo}</b>
                  <span className="text-xs text-muted-foreground">{p.texto}</span>
                </li>
              ))}
            </ol>
          </Cartao>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Cartao icone="fluent-color:alert-24" titulo="Vão ser suspensas nos próximos dias" semPadding
              extra={<Button asChild size="sm" variant="outline"><Link to="/mensalidades">Ver todas</Link></Button>}>
              {q.data.vao_suspender.length === 0 ? (
                <Vazio icone="flat-color-icons:ok" titulo="Nenhuma empresa em atraso" texto="Quando uma mensalidade vencer sem pagamento, a empresa aparece aqui com a data da suspensão." />
              ) : (
                <Tabela cabecalho={["Empresa", "Sistemas", "Atraso", "Suspende em"]}>
                  {q.data.vao_suspender.map((v) => (
                    <tr key={v.empresa_id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link to="/empresas/$id" params={{ id: v.empresa_id }} className="font-semibold hover:text-primary">{v.empresa}</Link>
                        <div className="text-xs text-muted-foreground">{cnpj(v.cnpj)}</div>
                      </td>
                      <td className="px-4 py-3">{(v.sistemas ?? []).map((s) => <Chip key={s} app={s} />)}</td>
                      <td className="px-4 py-3"><Selo tom={v.dias_atraso >= 8 ? "err" : "war"}>{v.dias_atraso} {v.dias_atraso === 1 ? "dia" : "dias"}</Selo></td>
                      <td className="px-4 py-3 font-semibold" title={data(v.suspende_em)}>{quando(v.suspende_em)}</td>
                    </tr>
                  ))}
                </Tabela>
              )}
            </Cartao>

            <Cartao icone="fluent-color:apps-24" titulo="Receita por sistema">
              {q.data.receita_por_sistema.length === 0 ? (
                <Vazio icone="fluent-color:apps-24" titulo="Nenhum sistema vinculado" texto="Cadastre uma empresa e vincule os sistemas que ela usa." />
              ) : (
                <ul className="space-y-4">
                  {(() => {
                    const max = Math.max(...q.data.receita_por_sistema.map((r) => Number(r.valor)), 1);
                    return q.data.receita_por_sistema.map((r, i) => (
                      <li key={r.app} className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <b className="text-sm">{r.nome}</b>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                            <i className="block h-full rounded-full" style={{ width: `${(Number(r.valor) / max) * 100}%`, background: CORES[i % CORES.length] }} />
                          </div>
                        </div>
                        <div className="text-right">
                          <b className="text-sm">{brl(r.valor)}</b>
                          <div className="text-xs text-muted-foreground">{r.empresas} {Number(r.empresas) === 1 ? "empresa" : "empresas"}</div>
                        </div>
                      </li>
                    ));
                  })()}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      ) : null}
    </Pagina>
  );
}
