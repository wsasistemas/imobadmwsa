import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { BotaoAcesso, SituacaoAcesso } from "@/components/adm/acesso";
import { AdicionarSistema } from "@/components/adm/dialogos";
import { Carregando, Cartao, Erro, Pagina, Selo, SeloSituacao, Tabela, Vazio } from "@/components/adm/ui";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro } from "@/lib/adm/api";
import { brl, cnpj, data, dataHora } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Mesmo layout da tela "Permissões por aplicativo": sistemas à esquerda, empresas do sistema à direita.
export const Route = createFileRoute("/_authenticated/sistemas")({
  head: () => ({ meta: [{ title: "Sistemas e schemas — ImobAdm WSA" }] }),
  component: Sistemas,
});

/** A verificação conta como instalada se o site consultou nos últimos 30 dias (mesma regra da Central de Acessos). */
const instalada = (d: string | null) => !!d && Date.now() - new Date(d).getTime() < 30 * 86_400_000;

function Sistemas() {
  const qc = useQueryClient();
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas });
  const [app, setApp] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca.trim());
  useEffect(() => { if (!app && sistemas.data?.length) setApp(sistemas.data[0]!.app); }, [sistemas.data, app]);
  const empresas = useQuery({
    queryKey: ["sistemas", "empresas", app, buscaAdiada],
    queryFn: () => api.empresasDoSistema(app!, buscaAdiada),
    enabled: !!app,
  });
  const atual = sistemas.data?.find((s) => s.app === app);
  const acessos = useQuery({ queryKey: ["acessos-comprador", "app", app], queryFn: () => api.acessosComprador(null, app), enabled: !!app });

  const acesso = useMutation({
    mutationFn: (p: { id: string; acesso_manual?: string; ativo?: boolean }) => api.salvarVinculo(p),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Vínculo atualizado."); },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Pagina
      titulo="Sistemas e schemas"
      texto={<>Os aplicativos no Supabase central (<code>ikvjaowvpvxojvcfwnct</code>) e as empresas vinculadas a cada um.</>}
      acoes={<AdicionarSistema gatilho={<Button className="gap-1.5"><Plus className="size-4" />Adicionar sistema</Button>} />}
    >
      {sistemas.isLoading ? <Carregando /> : sistemas.error ? <Erro erro={sistemas.error} /> : (sistemas.data ?? []).length === 0 ? (
        <Vazio icone="flat-color-icons:data-configuration" titulo="Nenhum sistema" texto="Use Adicionar sistema para cadastrar um schema do banco." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Cartao titulo="Sistemas" icone="fluent-color:apps-24" semPadding>
            <ul className="p-2">
              {sistemas.data!.map((s) => (
                <li key={s.app}>
                  <button type="button" onClick={() => { setApp(s.app); setBusca(""); }}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", s.app === app ? "menu-ativo" : "hover:bg-muted")}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.app}</span>
                      <span className={cn("block truncate text-[11px]", s.app === app ? "text-white/80" : "text-muted-foreground")}>{s.nome}</span>
                    </span>
                    <span className="shrink-0 text-xs opacity-80" title="empresas · suspensas">
                      {s.empresas}{Number(s.suspensas) > 0 ? <span className={s.app === app ? "" : "text-destructive"}> · {s.suspensas}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>

          {atual ? (
            <Cartao icone="flat-color-icons:data-configuration" titulo={<span>{atual.app} <span className="font-normal text-muted-foreground">· {atual.nome}</span></span>} semPadding
              extra={instalada(atual.ultima_verificacao_em) ? <Selo tom="ok">Verificação instalada</Selo> : <Selo tom="war">Sem verificação</Selo>}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Schema <code className="rounded bg-muted px-1">{atual.app === "imobsystem" ? "public" : atual.app}</code> ·{" "}
                  {atual.descricao_ref ?? (atual.tipo_ref === "schema" ? "um schema por empresa" : "várias empresas no mesmo schema")}. {atual.cobra ? "Cobra mensalidade." : "Não cobra."}{" "}
                  Última checagem do site: {atual.ultima_verificacao_em ? dataHora(atual.ultima_verificacao_em) : "nunca"}.
                </span>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, CNPJ ou schema…" className="h-9 pl-9" />
                </div>
              </div>

              {empresas.isLoading ? <Carregando /> : empresas.error ? <div className="p-4"><Erro erro={empresas.error} /></div> : (empresas.data ?? []).length === 0 ? (
                <Vazio icone="flat-color-icons:department" titulo={buscaAdiada ? "Nada encontrado" : "Nenhuma empresa vinculada"}
                  texto={buscaAdiada ? "Tente outra busca." : "Abra a ficha de uma empresa e use Vincular sistema para ligá-la a este schema."}
                  acao={buscaAdiada ? undefined : <Button asChild variant="outline"><Link to="/empresas">Ir para Empresas</Link></Button>} />
              ) : (
                <Tabela cabecalho={["Empresa", "Onde estão os dados", "Mensalidade", "Situação", "Pode entrar", "Comprador", ""]}>
                  {empresas.data!.map((v) => (
                    <tr key={v.vinculo_id} className={v.ativo ? "" : "opacity-55"}>
                      <td className="px-4 py-3">
                        <Link to="/empresas/$id" params={{ id: v.empresa_id }} className="font-semibold hover:text-primary">{v.empresa}</Link>
                        <div className="text-xs text-muted-foreground">{[cnpj(v.cnpj), `desde ${data(v.desde)}`].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5">{v.schema_ref ?? v.tenant_ref}</code>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{v.schema_ref ? "schema próprio" : "tenant"}</div>
                      </td>
                      <td className="px-4 py-3"><b>{brl(v.valor_mensal)}</b><div className="text-xs text-muted-foreground">{v.plano ?? "—"}</div></td>
                      <td className="px-4 py-3">{v.ativo ? <SeloSituacao e={v} /> : <Selo tom="neu">desligado</Selo>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={v.liberado} disabled={acesso.isPending || !v.ativo}
                            onCheckedChange={(lig) => acesso.mutate({ id: v.vinculo_id, acesso_manual: lig ? "liberado" : "bloqueado" })} />
                          {v.acesso_manual ? (
                            <button type="button" className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => acesso.mutate({ id: v.vinculo_id, acesso_manual: "" })}>voltar ao automático</button>
                          ) : <span className="text-[11px] text-muted-foreground">automático</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3"><SituacaoAcesso a={acessos.data?.find((a) => a.vinculo_id === v.vinculo_id)} /></td>
                      <td className="px-4 py-3 text-right"><BotaoAcesso a={acessos.data?.find((a) => a.vinculo_id === v.vinculo_id)} /></td>
                    </tr>
                  ))}
                </Tabela>
              )}

              {!instalada(atual.ultima_verificacao_em) ? (
                <p className="flex gap-2 border-t border-border bg-warning-soft/60 px-4 py-3 text-xs text-warning-strong">
                  <IconeColorido nome="fluent-color:warning-24" tamanho={16} />
                  O site deste sistema não consultou a Central nos últimos 30 dias. A trava por empresa (empresa_liberada) entra em cada site na Fase 9: sem ela a suspensão não tira o sistema do ar.
                </p>
              ) : null}
            </Cartao>
          ) : null}
        </div>
      )}
    </Pagina>
  );
}
