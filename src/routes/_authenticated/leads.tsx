import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { FichaLead, ImportarCsv, NovoContato, Origem, SeloTemperatura } from "@/components/adm/comercial";
import { Carregando, Cartao, Chip, Erro, Filtros, Kpi, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/adm/api";
import { COR_ETAPA, ha, telefone } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Gestão Comercial › Leads & Contatos (mockup v2). Clique numa linha abre a ficha do lead.
export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (s: Record<string, unknown>) => ({ negocio: typeof s.negocio === "string" ? s.negocio : undefined }),
  head: () => ({ meta: [{ title: "Leads & Contatos — ImobAdm WSA" }] }),
  component: Leads,
});

type FiltroOrigem = "todos" | "site" | "instagram" | "facebook" | "manual" | "importado" | "sem_resposta";
type FiltroTemp = "todas" | "quente" | "morno" | "frio";

function Leads() {
  const { negocio } = Route.useSearch();
  const navigate = useNavigate({ from: "/leads" });
  const [origem, setOrigem] = useState<FiltroOrigem>("todos");
  const [temp, setTemp] = useState<FiltroTemp>("todas");
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca.trim());

  const resumo = useQuery({ queryKey: ["leads-resumo"], queryFn: api.resumoLeads });
  const q = useQuery({
    queryKey: ["leads", temp, buscaAdiada],
    queryFn: () => api.leads(null, temp === "todas" ? null : temp, buscaAdiada),
  });

  const todos = q.data ?? [];
  const conta = (o: string) => todos.filter((l) => l.origem === o).length;
  const lista = origem === "todos" ? todos : origem === "sem_resposta" ? todos.filter((l) => l.sem_resposta_24h) : todos.filter((l) => l.origem === origem);
  const r = resumo.data;
  const variacao = r && r.novos_30d_antes > 0 ? Math.round(((r.novos_30d - r.novos_30d_antes) / r.novos_30d_antes) * 100) : null;
  const abrir = (id: string | undefined) => navigate({ search: { negocio: id }, replace: true });

  return (
    <Pagina
      voltar="Gestão Comercial › Leads & Contatos"
      titulo="Leads & Contatos"
      texto="Interessados nos sistemas WSA. Entram sozinhos pelo site, pelo Instagram e pelo Facebook e já chegam classificados (quente, morno ou frio)."
      acoes={<>
        <ImportarCsv gatilho={<Button variant="outline">Importar CSV</Button>} />
        <NovoContato gatilho={<Button className="gap-1.5"><Plus className="size-4" />Novo contato</Button>} />
      </>}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone="fluent-color:person-add-24" tom="info" rotulo="Leads novos (30 dias)" valor={r?.novos_30d ?? "—"}
          detalhe={variacao === null ? "sem base no mês anterior" : `${variacao >= 0 ? "+" : ""}${variacao}% vs. mês anterior`} />
        <Kpi icone="flat-color-icons:high-priority" tom="err" rotulo="Quentes em aberto" valor={r?.quentes_abertos ?? "—"}
          detalhe={r ? `${r.mornos_abertos} ${r.mornos_abertos === 1 ? "morno" : "mornos"} · ${r.frios_abertos} ${r.frios_abertos === 1 ? "frio" : "frios"}` : undefined} />
        <Kpi icone="logos:meta-icon" tom="info" rotulo="Instagram + Facebook (30 dias)" valor={r ? r.instagram_30d + r.facebook_30d : "—"}
          detalhe={r ? `${r.instagram_30d} Instagram · ${r.facebook_30d} Facebook · ${r.site_30d} site` : undefined} />
        <Kpi icone="fluent-color:alert-24" tom={r?.sem_resposta_24h ? "war" : "ok"} rotulo="Sem resposta há 24 h" valor={r?.sem_resposta_24h ?? "—"}
          detalhe="ainda em Novo lead" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filtros<FiltroOrigem>
          valor={origem}
          onChange={setOrigem}
          opcoes={[
            { valor: "todos", rotulo: "Todos", total: todos.length },
            { valor: "site", rotulo: "Site", total: conta("site") },
            { valor: "instagram", rotulo: "Instagram", total: conta("instagram") },
            { valor: "facebook", rotulo: "Facebook", total: conta("facebook") },
            { valor: "manual", rotulo: "Manual", total: conta("manual") },
            { valor: "importado", rotulo: "Importados", total: conta("importado") },
            { valor: "sem_resposta", rotulo: "Sem resposta 24h", total: todos.filter((l) => l.sem_resposta_24h).length },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, empresa, e-mail…" className="bg-card pl-9" />
        </div>
      </div>
      <Filtros<FiltroTemp>
        valor={temp}
        onChange={setTemp}
        opcoes={[
          { valor: "todas", rotulo: "Todas as temperaturas" },
          { valor: "quente", rotulo: "Quentes" },
          { valor: "morno", rotulo: "Mornos" },
          { valor: "frio", rotulo: "Frios" },
        ]}
      />

      <Cartao semPadding>
        {q.isLoading ? <Carregando /> : q.error ? <div className="p-4"><Erro erro={q.error} /></div> : lista.length === 0 ? (
          <Vazio icone="fluent-color:people-list-24" titulo={todos.length === 0 && !buscaAdiada ? "Nenhum lead ainda" : "Nada encontrado"}
            texto={todos.length === 0 && !buscaAdiada ? "Os leads do site e dos formulários do Facebook e do Instagram aparecem aqui sozinhos." : "Tente outro filtro ou outra busca."} />
        ) : (
          <Tabela cabecalho={["Contato", "Origem", "Temperatura", "Interesse", "Etapa do funil", "Próximo passo", "Entrou"]}>
            {lista.map((l) => {
              const atrasado = l.prazo_em && new Date(l.prazo_em).getTime() < Date.now();
              return (
                <tr key={l.negocio_id} onClick={() => abrir(l.negocio_id)} className="cursor-pointer hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <b className="font-semibold">{l.nome}</b>
                    <div className="text-xs text-muted-foreground">{[l.empresa, telefone(l.whatsapp) || l.email].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="max-w-56 px-4 py-3"><Origem origem={l.origem} detalhe={l.campanha || l.formulario} /></td>
                  <td className="px-4 py-3"><SeloTemperatura t={l.temperatura} pontos={l.pontuacao} /></td>
                  <td className="px-4 py-3">{l.sistemas.length ? l.sistemas.map((s) => <Chip key={s} app={s} />) : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3"><Selo tom={COR_ETAPA[l.etapa_cor]?.tom ?? "neu"}>{l.etapa_nome}</Selo></td>
                  <td className="max-w-60 px-4 py-3 text-xs">
                    {["ganho", "perdido"].includes(l.etapa) ? <span className="text-muted-foreground">{l.motivo_perda ? `Motivo: ${l.motivo_perda}` : "—"}</span> : (
                      <span className={cn(atrasado ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {l.proxima_acao ?? "—"}{atrasado ? " (atrasado)" : ""}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{ha(l.criado_em)}</td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Cartao>
      <p className="text-xs text-muted-foreground">
        Contato repetido (mesmo WhatsApp ou e-mail) não duplica: o lead novo vira uma anotação no negócio que já existe e nunca rebaixa a temperatura.
      </p>

      <FichaLead negocioId={negocio ?? null} onFechar={() => abrir(undefined)} />
    </Pagina>
  );
}
