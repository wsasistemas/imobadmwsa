import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Loader2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro } from "@/lib/adm/api";
import { dataHora } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Fonte de leads › Facebook e Instagram (Lead Ads). Mesmo layout de Permissões: páginas à esquerda, detalhe à direita.
export const Route = createFileRoute("/_authenticated/fontes/meta")({
  validateSearch: (s: Record<string, unknown>) => ({
    meta_sessao: typeof s.meta_sessao === "string" ? s.meta_sessao : undefined,
    meta_erro: typeof s.meta_erro === "string" ? s.meta_erro : undefined,
  }),
  head: () => ({ meta: [{ title: "Facebook e Instagram — ImobAdm WSA" }] }),
  component: Meta,
});

const SELECT = "h-8 rounded-md border border-input bg-background px-2 text-xs";

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      onClick={async () => { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{ok ? "copiado" : "copiar"}
    </button>
  );
}

function EscolherPagina({ sessao, onFechar }: { sessao: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const paginas = useQuery({ queryKey: ["meta-paginas", sessao], queryFn: () => api.metaPaginas(sessao), retry: false });
  const conectar = useMutation({
    mutationFn: (paginaId: string) => api.metaConectar(sessao, paginaId),
    onSuccess: (r) => {
      toast.success(r.assinada ? `Página conectada. ${r.formularios ?? 0} formulário(s) encontrados.` : "Página conectada, mas a assinatura do webhook falhou. Use Verificar.");
      qc.invalidateQueries({ queryKey: ["meta-conexoes"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Escolha a página</DialogTitle>
          <DialogDescription>Os leads dos formulários desta página (e do Instagram ligado a ela) entram no funil.</DialogDescription>
        </DialogHeader>
        {paginas.isLoading ? <Carregando /> : paginas.error ? <Erro erro={paginas.error} /> : (paginas.data?.paginas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma página encontrada para esse login do Facebook.</p>
        ) : (
          <ul className="space-y-2">
            {paginas.data!.paginas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <b className="block truncate text-sm">{p.nome}</b>
                  <span className="text-xs text-muted-foreground">{p.instagramNome ?? "sem Instagram ligado"}{p.podeLeads ? "" : " · sem permissão de leads"}</span>
                </div>
                <Button size="sm" disabled={conectar.isPending || !p.podeLeads} onClick={() => conectar.mutate(p.id)}>
                  {conectar.isPending && conectar.variables === p.id ? <Loader2 className="size-4 animate-spin" /> : "Conectar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Meta() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { meta_sessao, meta_erro } = Route.useSearch();
  const situacao = useQuery({ queryKey: ["meta-situacao"], queryFn: api.metaSituacao, retry: false });
  const conexoes = useQuery({ queryKey: ["meta-conexoes"], queryFn: api.metaConexoes });
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas });
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!sel && conexoes.data?.length) setSel(conexoes.data[0]!.id); }, [conexoes.data, sel]);
  useEffect(() => { if (meta_erro) toast.error(meta_erro); }, [meta_erro]);
  const atual = conexoes.data?.find((c) => c.id === sel);
  const limparUrl = () => navigate({ to: "/fontes/meta", search: { meta_sessao: undefined, meta_erro: undefined }, replace: true });

  const iniciar = useMutation({
    mutationFn: () => api.metaInicio(window.location.origin),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["meta-conexoes"] });
  const verificar = useMutation({
    mutationFn: (id: string) => api.metaVerificar(id),
    onSuccess: (r) => { recarregar(); r.detalhe ? toast.warning(r.detalhe) : toast.success("Conexão funcionando: os leads chegam."); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const formularios = useMutation({
    mutationFn: (id: string) => api.metaFormularios(id),
    onSuccess: (r) => { recarregar(); toast.success(`${r.formularios} formulário(s) atualizados.`); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const desconectar = useMutation({
    mutationFn: (id: string) => api.metaDesconectar(id),
    onSuccess: () => { setSel(null); recarregar(); toast.success("Página desconectada."); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const salvarForm = useMutation({
    mutationFn: (p: { form: string; sistema: string | null; ativo: boolean }) => api.metaFormularioSalvar(p.form, p.sistema, p.ativo),
    onSuccess: recarregar,
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const s = situacao.data;
  const pronto = !!s?.configurado;

  return (
    <Pagina
      titulo="Facebook e Instagram"
      texto="Leads dos formulários do Lead Ads (anúncios do Facebook e do Instagram) entram sozinhos no funil, em Novo lead."
      acoes={
        <Button className="gap-1.5" disabled={!pronto || iniciar.isPending} onClick={() => iniciar.mutate()}>
          {iniciar.isPending ? <Loader2 className="size-4 animate-spin" /> : <IconeColorido nome="logos:facebook" tamanho={16} />}
          Conectar com Facebook
        </Button>
      }
    >
      {meta_sessao ? <EscolherPagina sessao={meta_sessao} onFechar={limparUrl} /> : null}

      {situacao.isLoading ? null : !pronto || !s?.webhook_configurado ? (
        <Cartao icone="fluent-color:settings-24" titulo="Configuração do app da Meta (uma vez só)">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              No app da Meta da WSA (developers.facebook.com), em Login do Facebook, cadastre a URL de redirecionamento:{" "}
              <code className="break-all rounded bg-muted px-1">{s?.retorno_url}</code> {s?.retorno_url ? <Copiar texto={s.retorno_url} /> : null}
            </li>
            <li>
              Em Webhooks, objeto <b>Page</b>, campo <b>leadgen</b>, URL de retorno{" "}
              <code className="break-all rounded bg-muted px-1">{s?.webhook_url}</code> {s?.webhook_url ? <Copiar texto={s.webhook_url} /> : null}
              {" "}e o mesmo token de verificação do secret <code>ADM_META_VERIFY_TOKEN</code>.
            </li>
            <li>
              No Supabase (Edge Functions → Secrets), cadastre <code>ADM_META_APP_ID</code>, <code>ADM_META_APP_SECRET</code>,{" "}
              <code>ADM_META_VERIFY_TOKEN</code> (texto aleatório com 32+ caracteres) e <code>ADM_APP_URLS</code> (endereço deste painel).
            </li>
            <li>Peça na Meta as permissões <code>leads_retrieval</code>, <code>pages_manage_metadata</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code> e <code>business_management</code>.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Selo tom={pronto ? "ok" : "war"}>{pronto ? "App cadastrado" : "App ainda não cadastrado"}</Selo>
            <Selo tom={s?.webhook_configurado ? "ok" : "war"}>{s?.webhook_configurado ? "Token do webhook cadastrado" : "Falta o token do webhook"}</Selo>
          </div>
        </Cartao>
      ) : null}

      {conexoes.isLoading ? <Carregando /> : conexoes.error ? <Erro erro={conexoes.error} /> : (conexoes.data ?? []).length === 0 ? (
        <Cartao>
          <Vazio icone="logos:meta-icon" titulo="Nenhuma página conectada"
            texto={pronto ? "Clique em Conectar com Facebook e escolha a página da WSA que roda os anúncios." : "Depois de configurar o app da Meta, conecte aqui a página da WSA."} />
        </Cartao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Cartao titulo="Páginas" icone="logos:meta-icon" semPadding>
            <ul className="p-2">
              {conexoes.data!.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSel(c.id)}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", c.id === sel ? "menu-ativo" : "hover:bg-muted")}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.page_nome ?? c.page_id}</span>
                      <span className={cn("block truncate text-[11px]", c.id === sel ? "text-white/80" : "text-muted-foreground")}>{c.ig_usuario ?? "sem Instagram"}</span>
                    </span>
                    <span className="shrink-0 text-xs opacity-80">{c.total_leads}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>

          {atual ? (
            <Cartao icone="logos:facebook" titulo={atual.page_nome ?? atual.page_id} semPadding
              extra={!atual.token_valido ? <Selo tom="err">Token recusado</Selo> : atual.detalhe ? <Selo tom="war">Atenção</Selo> : <Selo tom="ok">Recebendo leads</Selo>}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Instagram: <b className="text-foreground">{atual.ig_usuario ?? "não ligado"}</b> · {atual.total_leads} lead(s) · último {dataHora(atual.ultimo_lead_em)} ·
                  verificada {dataHora(atual.verificado_em)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={verificar.isPending} onClick={() => verificar.mutate(atual.id)}>
                    <ShieldCheck className="size-3.5" />Verificar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={formularios.isPending} onClick={() => formularios.mutate(atual.id)}>
                    <RefreshCw className="size-3.5" />Atualizar formulários
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5" disabled={desconectar.isPending}
                    onClick={() => { if (confirm("Desconectar esta página? Os leads dela param de chegar.")) desconectar.mutate(atual.id); }}>
                    <Unplug className="size-3.5" />Desconectar
                  </Button>
                </div>
              </div>
              {atual.detalhe ? <p className="border-b border-border bg-warning-soft/60 px-4 py-2 text-xs text-warning">{atual.detalhe}</p> : null}
              {atual.formularios.length === 0 ? (
                <Vazio icone="fluent-color:people-list-24" titulo="Nenhum formulário" texto="Crie um formulário de Lead Ads na página e clique em Atualizar formulários." />
              ) : (
                <Tabela cabecalho={["Formulário", "Situação na Meta", "Leads", "Sistema de interesse", "Recebendo"]}>
                  {atual.formularios.map((f) => (
                    <tr key={f.form_id}>
                      <td className="px-4 py-3"><b>{f.nome ?? f.form_id}</b><div className="text-xs text-muted-foreground">{f.form_id}</div></td>
                      <td className="px-4 py-3 text-xs">{f.situacao === "ACTIVE" ? <Selo tom="ok">ativo</Selo> : <Selo tom="neu">{(f.situacao ?? "—").toLowerCase()}</Selo>}</td>
                      <td className="px-4 py-3 font-semibold">{f.total_leads}</td>
                      <td className="px-4 py-3">
                        <select className={SELECT} value={f.sistema ?? ""} disabled={salvarForm.isPending}
                          onChange={(e) => salvarForm.mutate({ form: f.form_id, sistema: e.target.value || null, ativo: f.ativo })}>
                          <option value="">não definido</option>
                          {(sistemas.data ?? []).map((x) => <option key={x.app} value={x.app}>{x.app}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <Switch checked={f.ativo} disabled={salvarForm.isPending} onCheckedChange={(v) => salvarForm.mutate({ form: f.form_id, sistema: f.sistema, ativo: v })} />
                      </td>
                    </tr>
                  ))}
                </Tabela>
              )}
            </Cartao>
          ) : null}
        </div>
      )}
    </Pagina>
  );
}
