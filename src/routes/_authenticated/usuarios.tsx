import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  api,
  mensagemErro,
  type AvisosUsuario,
  type Usuario,
  type UsuarioSalvar,
} from "@/lib/adm/api";
import { cn } from "@/lib/utils";

// Configurações › Usuários (mockup aprovado em 13/11/2026). Usuário = consultor: entra no rodízio do Atendimento
// ONLINE, tem a agenda das demonstrações e recebe os avisos pelo WhatsApp (OpenWA).
export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — ImobAdm WSA" }] }),
  component: Usuarios,
});

const AVISOS: [keyof AvisosUsuario, string, string][] = [
  [
    "reuniao_marcada",
    "Demonstração marcada",
    "Quando o lead escolhe o horário com a Sophia ou pelo link.",
  ],
  [
    "pediu_consultor",
    "Lead pediu para falar com um consultor",
    "Também quando nenhum horário serviu ou a Sophia não soube responder.",
  ],
  [
    "lembrete_1h",
    "Lembrete 1 h antes da demonstração",
    "Com o nome do lead, a empresa e o link do Meet.",
  ],
  [
    "remarcada",
    "Demonstração remarcada ou cancelada",
    "Quando o lead muda o horário pelo WhatsApp ou pelo link.",
  ],
];
const AVISOS_PADRAO: AvisosUsuario = {
  reuniao_marcada: true,
  pediu_consultor: true,
  lembrete_1h: true,
  remarcada: false,
};
const NOVO: UsuarioSalvar = {
  nome: "",
  email: "",
  whatsapp: "",
  cargo: "",
  papel: "consultor",
  na_fila: true,
  apto: true,
  apps: [],
  avisos: AVISOS_PADRAO,
};

const digitos = (f: string | null | undefined) => (f ?? "").replace(/\D/g, "");
function foneBr(f: string | null | undefined): string {
  const d = digitos(f).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return f ?? "";
}

function Usuarios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["usuarios"], queryFn: api.usuarios });
  const base = useQuery({ queryKey: ["atend-painel"], queryFn: api.atendPainel });
  const sessao = useQuery({
    queryKey: ["atend-sessao"],
    queryFn: api.atendSessao,
    staleTime: 60_000,
  });
  const [sel, setSel] = useState<string | "novo" | null>(null);
  const lista = q.data ?? [];
  const atual = sel === "novo" ? NOVO : (lista.find((u) => u.id === sel) ?? lista[0] ?? NOVO);
  const chave = sel === "novo" ? "novo" : ((atual as Usuario).id ?? "novo");
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["usuarios"] }),
      qc.invalidateQueries({ queryKey: ["atend-painel"] }),
    ]);
  const ativos = lista.filter((u) => u.ativo);
  const foneSessao = digitos(sessao.data?.sessao?.telefone);
  const apps = (base.data?.sistemas ?? [])
    .filter((s) => s.app)
    .map((s) => [s.app!, s.nome.split(" (")[0]] as [string, string]);

  return (
    <Pagina
      voltar="Configurações › Usuários"
      titulo="Usuários e consultores"
      texto={
        <>
          Quem atende as vendas. Cada usuário é um consultor: entra no rodízio do Atendimento
          ONLINE, tem a agenda das demonstrações e recebe pelo <b>WhatsApp (OpenWA)</b> os avisos de
          reunião marcada e de lead que pediu para falar com alguém.
        </>
      }
      acoes={
        <Button className="gap-1.5" onClick={() => setSel("novo")}>
          <Plus className="size-4" />
          Novo usuário
        </Button>
      }
    >
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <Erro erro={q.error} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Numero
              rotulo="Consultores na fila"
              valor={ativos.filter((u) => u.na_fila).length}
              detalhe="rodízio do Atendimento ONLINE"
            />
            <Numero
              rotulo="Agendas Google"
              valor={ativos.filter((u) => u.agenda?.conectada).length}
              detalhe="conectadas"
            />
            <Numero
              rotulo="Sem WhatsApp"
              valor={ativos.filter((u) => !u.whatsapp).length}
              detalhe="não recebem avisos"
              alerta
            />
            <Numero
              rotulo="Demonstrações marcadas"
              valor={ativos.reduce((s, u) => s + Number(u.reunioes_futuras || 0), 0)}
              detalhe="próximas, nas agendas"
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_440px]">
            <Cartao icone="fluent-color:people-24" titulo="Usuários" semPadding>
              {lista.length === 0 ? (
                <Vazio
                  icone="fluent-color:people-24"
                  titulo="Nenhum usuário ainda"
                  texto="Cadastre quem atende as vendas."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">USUÁRIO</th>
                        <th className="px-3">WHATSAPP</th>
                        <th className="px-3">PAPEL</th>
                        <th className="px-3">AGENDA</th>
                        <th className="px-3">ATENDIMENTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((u) => (
                        <tr
                          key={u.id}
                          onClick={() => setSel(u.id)}
                          className={cn(
                            "cursor-pointer border-b border-border align-top hover:bg-muted/50",
                            chave === u.id && "bg-primary-soft/60",
                            !u.ativo && "opacity-55",
                          )}
                        >
                          <td className="px-4 py-3">
                            <b>{u.nome}</b>
                            <div className="text-xs text-muted-foreground">
                              {u.email ?? "sem e-mail"}
                              {u.cargo ? ` · ${u.cargo}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {u.whatsapp ? foneBr(u.whatsapp) : <Selo tom="err">Sem WhatsApp</Selo>}
                            {u.whatsapp && digitos(u.whatsapp) === foneSessao ? (
                              <div className="text-xs text-muted-foreground">número da sessão</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <Selo tom={u.papel === "administrador" ? "info" : "neu"}>
                              {u.papel === "administrador" ? "Administrador" : "Consultor"}
                            </Selo>
                          </td>
                          <td className="px-3 py-3">
                            {u.agenda?.conectada ? (
                              <Selo tom="ok">Conectada</Selo>
                            ) : (
                              <Selo tom="war">Não conectada</Selo>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {!u.ativo ? (
                              <Selo tom="neu">Desativado</Selo>
                            ) : u.na_fila ? (
                              <Selo tom={u.apto ? "ok" : "war"}>
                                {u.apto ? "Na fila · apto" : "Na fila · pausado"}
                              </Selo>
                            ) : (
                              <Selo tom="neu">Fora da fila</Selo>
                            )}
                            {u.na_fila ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {u.apps.length
                                  ? u.apps
                                      .map((a) => apps.find(([k]) => k === a)?.[1] ?? a)
                                      .join(", ")
                                  : "todos os sistemas"}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Desativar tira da fila e pausa a agenda, mas mantém o histórico de leads e reuniões.
                Não existe excluir.
              </p>
            </Cartao>

            <EditorUsuario
              key={chave}
              inicial={atual}
              apps={apps}
              foneSessao={foneSessao}
              aoSalvar={async (id) => {
                await recarregar();
                setSel(id);
              }}
              aoMudar={recarregar}
            />
          </div>
        </div>
      )}
    </Pagina>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="text-[12.5px] text-muted-foreground">{rotulo}</span>
      <b className={cn("block text-2xl tabular-nums", alerta && valor > 0 && "text-destructive")}>
        {valor}
      </b>
      <span className="text-xs text-muted-foreground">{detalhe}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h4 className="text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h4>
      {children}
    </div>
  );
}

function EditorUsuario({
  inicial,
  apps,
  foneSessao,
  aoSalvar,
  aoMudar,
}: {
  inicial: UsuarioSalvar | Usuario;
  apps: [string, string][];
  foneSessao: string;
  aoSalvar: (id: string) => Promise<void>;
  aoMudar: () => Promise<unknown>;
}) {
  const u0 = inicial as Partial<Usuario>;
  const [u, setU] = useState<UsuarioSalvar>({
    id: u0.id,
    nome: u0.nome ?? "",
    email: u0.email ?? "",
    whatsapp: u0.whatsapp ? foneBr(u0.whatsapp) : "",
    cargo: u0.cargo ?? "",
    papel: u0.papel ?? "consultor",
    na_fila: u0.na_fila ?? true,
    apto: u0.id ? (u0.apto ?? true) : true,
    apps: u0.apps ?? [],
    avisos: { ...AVISOS_PADRAO, ...(u0.avisos ?? {}) },
  });
  const up = (p: Partial<UsuarioSalvar>) => setU((x) => ({ ...x, ...p }));
  const avisos = u.avisos ?? AVISOS_PADRAO;
  const ativo = u0.ativo ?? true;
  const mesmoDaSessao = !!foneSessao && digitos(u.whatsapp).replace(/^(?!55)/, "55") === foneSessao;

  const salvar = useMutation({
    mutationFn: () => api.usuarioSalvar(u),
    onSuccess: async (id) => {
      toast.success("Usuário salvo.");
      await aoSalvar(id);
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const alternar = useMutation({
    mutationFn: () => api.usuarioAtivo(u.id!, !ativo),
    onSuccess: async () => {
      toast.success(ativo ? "Usuário desativado." : "Usuário reativado.");
      await aoMudar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const teste = useMutation({
    mutationFn: () => api.atendTeste(digitos(u.whatsapp).replace(/^(?!55)/, "55")),
    onSuccess: () => toast.success("Mensagem de teste enviada. Confira no WhatsApp."),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Cartao
      icone="fluent-color:people-24"
      titulo={u.id ? `Editar · ${u0.nome}` : "Novo usuário"}
      extra={u.id ? ativo ? <Selo tom="ok">Ativo</Selo> : <Selo tom="neu">Desativado</Selo> : null}
    >
      <div className="space-y-4 text-sm">
        <Secao titulo="Dados">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="u-nome">Nome (aparece para o lead)</Label>
              <Input
                id="u-nome"
                className="mt-1"
                value={u.nome ?? ""}
                onChange={(e) => up({ nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="u-cargo">Cargo</Label>
              <Input
                id="u-cargo"
                className="mt-1"
                value={u.cargo ?? ""}
                onChange={(e) => up({ cargo: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="u-email">E-mail</Label>
              <Input
                id="u-email"
                className="mt-1"
                type="email"
                value={u.email ?? ""}
                onChange={(e) => up({ email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="u-whats">WhatsApp (recebe os avisos)</Label>
              <Input
                id="u-whats"
                className="mt-1"
                inputMode="tel"
                placeholder="(21) 9 9999-9999"
                value={u.whatsapp ?? ""}
                onChange={(e) => up({ whatsapp: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={teste.isPending || digitos(u.whatsapp).length < 10}
              onClick={() => teste.mutate()}
            >
              {teste.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Enviar mensagem de teste"
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              sai pelo OpenWA (sessão wsa-admin)
            </span>
          </div>
          {mesmoDaSessao ? (
            <p className="rounded-lg border-l-4 border-primary bg-primary-soft/60 px-3 py-2 text-[13px]">
              Este é o <b>mesmo número da sessão wsa-admin</b>. Você já vê as conversas dos leads no
              celular; os avisos chegam no seu chat <b>"Você" (mensagem para mim)</b> do WhatsApp.
            </p>
          ) : null}
        </Secao>

        <Secao titulo="Papel">
          {(
            [
              [
                "administrador",
                "Administrador",
                "Entra no painel ImobAdm (super admin) e também atende como consultor.",
              ],
              [
                "consultor",
                "Consultor",
                "Não entra no painel: atende pelo WhatsApp, recebe os avisos e as reuniões na agenda dele.",
              ],
            ] as const
          ).map(([k, t, d]) => (
            <button
              key={k}
              type="button"
              onClick={() => up({ papel: k })}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left",
                u.papel === k
                  ? "border-primary bg-primary-soft/60"
                  : "border-border hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 size-4 shrink-0 rounded-full border-2",
                  u.papel === k ? "border-[5px] border-primary" : "border-muted-foreground/50",
                )}
              />
              <span>
                <b>{t}</b>
                <span className="block text-xs text-muted-foreground">{d}</span>
              </span>
            </button>
          ))}
        </Secao>

        <Secao titulo="Atendimento ONLINE (Sophia)">
          <label className="flex items-start justify-between gap-3">
            <span>
              <b>Na fila do rodízio</b>
              <span className="block text-xs text-muted-foreground">
                Recebe os leads que a Sophia passa para um consultor. Exige WhatsApp.
              </span>
            </span>
            <Switch
              checked={!!u.na_fila}
              onCheckedChange={(v) => up({ na_fila: v })}
              aria-label="Na fila do rodízio"
            />
          </label>
          {u.na_fila ? (
            <>
              <label className="flex items-start justify-between gap-3">
                <span>
                  <b>Apto agora</b>
                  <span className="block text-xs text-muted-foreground">
                    Desligue em férias ou folga: sai do rodízio sem perder a configuração.
                  </span>
                </span>
                <Switch
                  checked={!!u.apto}
                  onCheckedChange={(v) => up({ apto: v })}
                  aria-label="Apto agora"
                />
              </label>
              <div>
                <b>Sistemas que atende</b>{" "}
                <span className="text-xs text-muted-foreground">(nenhum marcado = todos)</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {apps.map(([k, r]) => {
                    const on = (u.apps ?? []).includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          up({
                            apps: on
                              ? (u.apps ?? []).filter((x) => x !== k)
                              : [...(u.apps ?? []), k],
                          })
                        }
                        className={cn(
                          "min-h-8 rounded-full border px-3 text-[12.5px] font-semibold",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </Secao>

        <Secao titulo="Agenda das demonstrações">
          {u0.agenda?.conectada ? (
            <div className="flex flex-wrap items-center gap-2">
              <Selo tom="ok">Google conectado</Selo>
              <span className="text-xs text-muted-foreground">{u0.agenda.email}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Selo tom="war">Sem agenda</Selo>
              <span className="text-xs text-muted-foreground">
                Não aparece nos horários que a Sophia oferece.
              </span>
            </div>
          )}
          <Link
            to="/google-agenda"
            search={{ google_ok: undefined, google_erro: undefined }}
            className="text-xs font-semibold text-primary"
          >
            {u0.agenda?.conectada ? "Trocar agenda" : "Conectar agenda"} em Configurações › Google
            Agenda
          </Link>
        </Secao>

        <Secao titulo="Avisos pelo WhatsApp (OpenWA)">
          {AVISOS.map(([k, t, d]) => (
            <label
              key={k}
              className="flex items-start justify-between gap-3 border-b border-dashed border-border pb-2"
            >
              <span>
                <b>{t}</b>
                <span className="block text-xs text-muted-foreground">{d}</span>
              </span>
              <Switch
                checked={avisos[k]}
                onCheckedChange={(v) => up({ avisos: { ...avisos, [k]: v } })}
                aria-label={t}
              />
            </label>
          ))}
          {!digitos(u.whatsapp) ? (
            <p className="text-xs text-destructive">Sem WhatsApp, nenhum aviso é enviado.</p>
          ) : null}
        </Secao>

        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
          {u.id ? (
            <Button
              variant="outline"
              disabled={alternar.isPending}
              onClick={() => {
                if (
                  !ativo ||
                  window.confirm(`Desativar ${u0.nome}? Sai da fila e a agenda fica pausada.`)
                )
                  alternar.mutate();
              }}
            >
              {ativo ? "Desativar" : "Reativar"}
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={salvar.isPending || !u.nome?.trim()} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar usuário"}
          </Button>
        </div>
      </div>
    </Cartao>
  );
}
