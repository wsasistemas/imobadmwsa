import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro, type LoginAcesso } from "@/lib/adm/api";
import { dataHora } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Central de Acessos (schema acessos), a mesma tela do imobdocerias/Imobenviomassa: libera ou bloqueia cada login
// em cada aplicativo do login compartilhado. É por pessoa; a trava por empresa (pagamento) fica em Empresas.
export const Route = createFileRoute("/_authenticated/permissoes")({
  head: () => ({ meta: [{ title: "Permissões por aplicativo — ImobAdm WSA" }] }),
  component: Permissoes,
});

function Permissoes() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["pa-apps"], queryFn: api.listarAplicativos });
  const [app, setApp] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca.trim());
  useEffect(() => { if (!app && apps.data?.length) setApp(apps.data[0]!.schema_name); }, [apps.data, app]);
  const logins = useQuery({ queryKey: ["pa-logins", app, buscaAdiada], queryFn: () => api.listarLogins(app!, buscaAdiada), enabled: !!app });
  const atual = apps.data?.find((a) => a.schema_name === app);

  const controle = useMutation({
    mutationFn: (ativo: boolean) => api.definirControle(app!, ativo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pa-apps"] }); toast.success("Controle atualizado."); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const permissao = useMutation({
    mutationFn: ({ u, pode }: { u: LoginAcesso; pode: boolean | null }) => api.definirPermissao(app!, u.user_id, pode),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pa-logins"] }); qc.invalidateQueries({ queryKey: ["pa-apps"] }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Pagina titulo="Permissões por aplicativo" texto="Quem pode entrar em cada sistema do login compartilhado (Central de Acessos). Vale para todos os aplicativos.">
      {apps.isLoading ? <Carregando /> : apps.error ? <Erro erro={apps.error} /> : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Cartao titulo="Aplicativos" icone="fluent-color:apps-24" semPadding>
            <ul className="p-2">
              {apps.data!.map((a) => (
                <li key={a.schema_name}>
                  <button type="button" onClick={() => setApp(a.schema_name)}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", a.schema_name === app ? "menu-ativo" : "hover:bg-muted")}>
                    <span className="truncate font-semibold">{a.nome}</span>
                    <span className="text-xs opacity-80">{a.liberados}/{Number(a.liberados) + Number(a.bloqueados)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>

          {atual ? (
            <Cartao icone="fluent-color:lock-shield-24" titulo={atual.nome} semPadding
              extra={
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={atual.controle_ativo} disabled={controle.isPending} onCheckedChange={(v) => controle.mutate(v)} />
                  Controle {atual.controle_ativo ? "ligado" : "desligado"}
                </label>
              }>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  {atual.controle_ativo ? "Só entra quem estiver liberado." : "Controle desligado: todo login entra."} Novos logins:{" "}
                  <b>{atual.padrao_novos === "liberado" ? "liberados" : "bloqueados"}</b>. Última checagem do site: {atual.ultima_verificacao_em ? dataHora(atual.ultima_verificacao_em) : "nunca"}.
                </span>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar e-mail…" className="h-9 pl-9" />
                </div>
              </div>
              {logins.isLoading ? <Carregando /> : logins.error ? <div className="p-4"><Erro erro={logins.error} /></div> : (logins.data ?? []).length === 0 ? (
                <Vazio icone="fluent-color:people-24" titulo="Nenhum login" />
              ) : (
                <Tabela cabecalho={["Login", "Último acesso", "Situação", "Pode entrar"]}>
                  {logins.data!.map((u) => (
                    <tr key={u.user_id}>
                      <td className="px-4 py-3"><b>{u.email}</b><div className="text-xs text-muted-foreground">{u.proprietario ? "proprietário" : u.tem_cadastro ? "tem cadastro no sistema" : "sem cadastro no sistema"}</div></td>
                      <td className="px-4 py-3 text-xs">{dataHora(u.ultimo_login)}</td>
                      <td className="px-4 py-3">
                        {u.decisao === null ? <Selo tom="neu">automático</Selo> : <Selo tom={u.decisao ? "ok" : "err"}>{u.decisao ? "liberado à mão" : "bloqueado à mão"}</Selo>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={u.efetivo} disabled={u.proprietario || permissao.isPending} onCheckedChange={(v) => permissao.mutate({ u, pode: v })} />
                          {u.decisao !== null && !u.proprietario ? (
                            <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => permissao.mutate({ u, pode: null })}>voltar ao automático</button>
                          ) : null}
                        </div>
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
