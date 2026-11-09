import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { BotaoAcesso, SituacaoAcesso } from "@/components/adm/acesso";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { CobrancaAvulsa, ConcederPrazo, NovaEmpresa, RegistrarPagamento, SuspenderManual, VincularSistema, ExcluirEmpresa } from "@/components/adm/dialogos";
import { Carregando, Cartao, Erro, Pagina, Selo, SeloSituacao, Tabela, Vazio } from "@/components/adm/ui";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro, type FichaEmpresa, type Vinculo, type AcessoComprador } from "@/lib/adm/api";
import { brl, cnpj, competencia, data, dataHora, diasAte, SITUACAO_FATURA, telefone, textoEvento } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/empresas/$id")({
  head: () => ({ meta: [{ title: "Empresa — ImobAdm WSA" }] }),
  component: Ficha,
});

function Ficha() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["empresa", id], queryFn: () => api.empresa(id) });

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} />;
  if (!q.data) return <Vazio icone="flat-color-icons:department" titulo="Empresa não encontrada" acao={<Button asChild variant="outline"><Link to="/empresas">Voltar</Link></Button>} />;
  return <Conteudo f={q.data} />;
}

function Faixa({ f }: { f: FichaEmpresa }) {
  const s = f.situacao;
  const aberta = f.faturas.find((x) => x.id === s.fatura_id);
  const sistemas = f.vinculos.filter((v) => v.ativo).length;
  if (f.empresa.modalidade !== "pagante") return null;
  if (s.situacao === "atraso" && aberta) {
    return (
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
        <IconeColorido nome="fluent-color:warning-24" tamanho={24} />
        <div>
          <b>Fatura de {competencia(aberta.competencia)} vencida há {s.dias_atraso} {s.dias_atraso === 1 ? "dia" : "dias"} ({brl(aberta.valor)}).</b>{" "}
          Se não for paga, {sistemas === 1 ? "o sistema" : `os ${sistemas} sistemas`} desta empresa saem do ar em <b>{data(s.suspende_em)} às 00:05</b>.
          Ao registrar o pagamento (ou o Asaas confirmar), o acesso volta na hora.
          {f.empresa.prazo_extra_ate ? <> Prazo extra combinado até <b>{data(f.empresa.prazo_extra_ate)}</b>.</> : null}
        </div>
      </div>
    );
  }
  if (s.situacao === "suspensa") {
    return (
      <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <IconeColorido nome="flat-color-icons:lock" tamanho={24} />
        <div>
          <b>Acesso suspenso em todos os sistemas.</b>{" "}
          {f.empresa.suspensa_manual ? "Suspensão feita à mão pelo painel." : `Fatura vencida há ${s.dias_atraso} dias.`} Para reativar, registre o pagamento
          {f.empresa.suspensa_manual ? " ou retire a suspensão manual" : ""}.
        </div>
      </div>
    );
  }
  return null;
}

function LinhaVinculo({ v, acesso }: { v: Vinculo; acesso?: AcessoComprador }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.salvarVinculo({ id: v.id, ...p }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Vínculo atualizado."); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const manual = v.acesso_manual;
  return (
    <tr className={v.ativo ? "" : "opacity-55"}>
      <td className="px-4 py-3"><b>{v.sistema}</b><div className="text-xs text-muted-foreground">desde {data(v.criado_em)}</div></td>
      <td className="px-4 py-3 text-xs"><code className="rounded bg-muted px-1.5 py-0.5">{v.schema_ref ? `schema ${v.schema_ref}` : `tenant ${v.tenant_ref}`}</code></td>
      <td className="px-4 py-3">{v.plano ?? "—"}</td>
      <td className="px-4 py-3 font-semibold">{brl(v.valor_mensal)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={v.liberado}
            disabled={m.isPending || !v.ativo}
            onCheckedChange={(lig) => m.mutate({ acesso_manual: lig ? "liberado" : "bloqueado" })}
            aria-label="Acesso"
          />
          {manual ? (
            <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => m.mutate({ acesso_manual: "" })}>
              manual · voltar ao automático
            </button>
          ) : <span className="text-[11px] text-muted-foreground">automático</span>}
        </div>
      </td>
      <td className="px-4 py-3"><SituacaoAcesso a={acesso} /></td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1"><BotaoAcesso a={acesso} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 max-md:size-11" aria-label={`Mais ações de ${v.sistema}`}><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => m.mutate({ ativo: !v.ativo })}>{v.ativo ? "Desligar vínculo" : "Religar vínculo"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu></div>
      </td>
    </tr>
  );
}

function Conteudo({ f }: { f: FichaEmpresa }) {
  const e = f.empresa;
  const qc = useQueryClient();
  const acessos = useQuery({ queryKey: ["acessos-comprador", "empresa", e.id], queryFn: () => api.acessosComprador(e.id) });
  const total = f.vinculos.filter((v) => v.ativo).reduce((s, v) => s + Number(v.valor_mensal), 0);
  const asaas = useMutation({
    mutationFn: () => api.sincronizarAsaas(e.id),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast.success(`Assinatura no Asaas (${r.ambiente === "production" ? "produção" : "teste"}): ${brl(r.valor)}/mês, 1º vencimento ${data(r.proximo_vencimento)}.`);
    },
    onError: (err) => toast.error(mensagemErro(err)),
  });

  const contato = [cnpj(e.cnpj) && `CNPJ ${cnpj(e.cnpj)}`, e.dono_nome && `${e.dono_nome} (dono)`, telefone(e.whatsapp), e.email_financeiro].filter(Boolean).join(" · ");

  return (
    <Pagina
      voltar={<><Link to="/empresas" className="hover:text-foreground">Empresas</Link> › {e.nome_fantasia || e.razao_social}</>}
      titulo={e.nome_fantasia || e.razao_social}
      texto={<span className="flex flex-wrap items-center gap-2">{contato || e.razao_social} <SeloSituacao e={f.situacao} /></span>}
      acoes={
        <>
          <NovaEmpresa empresa={e} gatilho={<Button variant="outline" size="sm" className="gap-1.5"><Pencil className="size-3.5" />Editar</Button>} />
          <ExcluirEmpresa empresa={e} gatilho={<Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Trash2 className="size-3.5" />Excluir</Button>} />
          <ConcederPrazo empresaId={e.id} atual={e.prazo_extra_ate} gatilho={<Button variant="outline" size="sm">Conceder prazo</Button>} />
          <SuspenderManual empresaId={e.id} suspensa={e.suspensa_manual}
            gatilho={<Button variant="outline" size="sm" className={e.suspensa_manual ? "" : "border-destructive/40 text-destructive hover:bg-destructive/5"}>{e.suspensa_manual ? "Retirar suspensão" : "Suspender agora"}</Button>} />
          {f.situacao.fatura_id ? (
            <RegistrarPagamento faturaId={f.situacao.fatura_id} valor={f.faturas.find((x) => x.id === f.situacao.fatura_id)?.valor ?? 0} empresa={e.nome_fantasia || e.razao_social}
              gatilho={<Button size="sm" className="bg-success text-success-foreground hover:bg-success/90">Registrar pagamento</Button>} />
          ) : null}
        </>
      }
    >
      <Faixa f={f} />

      <div className="grid gap-4 2xl:grid-cols-[1.5fr_1fr]">
        <Cartao icone="fluent-color:link-24" titulo="Sistemas vinculados" semPadding
          extra={<VincularSistema empresaId={e.id} compradorEmail={e.comprador_email} gatilho={<Button size="sm" variant="outline">+ Vincular sistema</Button>} />}>
          {f.vinculos.length === 0 ? (
            <Vazio icone="fluent-color:link-24" titulo="Nenhum sistema vinculado" texto="Vincule o schema ou o tenant da empresa em cada sistema que ela usa. O valor da mensalidade é a soma dos vínculos." />
          ) : (
            <>
              <Tabela cabecalho={["Sistema", "Onde estão os dados", "Plano", "Valor", "Acesso", "Comprador", ""]}>
                {f.vinculos.map((v) => <LinhaVinculo key={v.id} v={v} acesso={acessos.data?.find((a) => a.vinculo_id === v.id)} />)}
              </Tabela>
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                O normal é o acesso seguir a situação financeira: em dia ou até 10 dias de atraso, liga; suspensa, desliga todos. O switch é exceção (fica marcado como manual).
              </p>
            </>
          )}
        </Cartao>

        <Cartao icone="flat-color-icons:money-transfer" titulo="Cobrança no Asaas">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Mensalidade (soma)</span><b>{brl(total)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vencimento</span><b>{e.dia_vencimento ? `todo dia ${e.dia_vencimento}` : "dia 10 (padrão)"}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Assinatura</span>
              {e.asaas_subscription_id ? <code className="text-xs">{e.asaas_subscription_id}</code> : <span className="text-muted-foreground">ainda não criada</span>}</div>
            {e.modalidade !== "pagante" ? (
              <p className="rounded-lg bg-info-soft p-3 text-xs text-info">Empresa em {e.modalidade}: não gera cobrança.</p>
            ) : (
              <Button className="w-full gap-1.5" onClick={() => asaas.mutate()} disabled={asaas.isPending || total <= 0}>
                {asaas.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {e.asaas_subscription_id ? "Atualizar valor no Asaas" : "Criar assinatura no Asaas"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              O cliente escolhe PIX, boleto ou cartão no link da fatura. O pagamento confirmado pelo Asaas baixa a fatura e reativa o acesso sozinho.
            </p>
          </div>
        </Cartao>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.5fr_1fr]">
        <Cartao icone="fluent-color:receipt-24" titulo="Mensalidades" semPadding
          extra={<CobrancaAvulsa empresaId={e.id} valorPadrao={total} gatilho={<Button size="sm" variant="outline">Fatura manual</Button>} />}>
          {f.faturas.length === 0 ? (
            <Vazio icone="fluent-color:receipt-24" titulo="Nenhuma fatura ainda" texto="As faturas chegam do Asaas depois que a assinatura é criada." />
          ) : (
            <Tabela cabecalho={["Competência", "Vencimento", "Valor", "Pago em", "Situação", ""]}>
              {f.faturas.map((x) => {
                const atraso = (x.situacao === "a_vencer" || x.situacao === "vencida") ? -diasAte(x.vencimento) : 0;
                const s = SITUACAO_FATURA[x.situacao];
                return (
                  <tr key={x.id}>
                    <td className="px-4 py-3">{competencia(x.competencia)}</td>
                    <td className="px-4 py-3">{data(x.vencimento)}</td>
                    <td className="px-4 py-3 font-semibold">{brl(x.valor)}</td>
                    <td className="px-4 py-3">{x.pago_em ? `${data(x.pago_em)}${x.forma ? ` · ${x.forma}` : ""}` : "—"}</td>
                    <td className="px-4 py-3">{atraso > 0 ? <Selo tom={atraso > 10 ? "err" : "war"}>Atraso {atraso} {atraso === 1 ? "dia" : "dias"}</Selo> : <Selo tom={s.tom}>{s.rotulo}</Selo>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {x.invoice_url ? <a href={x.invoice_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" title="Abrir fatura no Asaas"><ExternalLink className="size-4" /></a> : null}
                        {x.situacao === "a_vencer" || x.situacao === "vencida" ? (
                          <RegistrarPagamento faturaId={x.id} valor={x.valor} empresa={e.nome_fantasia || e.razao_social}
                            gatilho={<Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Check className="size-3.5" />Dar baixa</Button>} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          )}
        </Cartao>

        <Cartao icone="fluent-color:history-24" titulo="Histórico">
          {f.eventos.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos.</p> : (
            <ol className="relative space-y-3 border-l-2 border-border pl-4">
              {f.eventos.slice(0, 30).map((ev) => {
                const cor = ev.tipo === "situacao"
                  ? (ev.detalhe.para === "suspensa" ? "bg-destructive" : ev.detalhe.para === "em_dia" ? "bg-success" : "bg-warning")
                  : ev.tipo === "aviso" ? "bg-warning" : ev.tipo.startsWith("pagamento") || ev.tipo === "asaas" ? "bg-success" : "bg-primary";
                return (
                  <li key={ev.id} className="relative">
                    <span className={`absolute -left-[23px] top-1.5 size-2.5 rounded-full ring-4 ring-card ${cor}`} />
                    <b className="text-[13px]">{textoEvento(ev.tipo, ev.detalhe)}</b>
                    <div className="text-xs text-muted-foreground">{dataHora(ev.criado_em)} · {ev.autor === "sistema" ? "automático" : ev.autor === "asaas" ? "Asaas" : "painel"}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>
      </div>
    </Pagina>
  );
}
