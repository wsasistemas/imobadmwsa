import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { NovaEmpresa } from "@/components/adm/dialogos";
import { Carregando, Cartao, Chip, Erro, Filtros, Pagina, SeloSituacao, Tabela, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Situacao } from "@/lib/adm/api";
import { brl, cnpj } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/empresas/")({
  head: () => ({ meta: [{ title: "Empresas — ImobAdm WSA" }] }),
  component: Empresas,
});

type Filtro = "todas" | Situacao;

function Empresas() {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca.trim());
  const q = useQuery({ queryKey: ["empresas", buscaAdiada], queryFn: () => api.listarEmpresas(null, buscaAdiada) });

  const todas = q.data ?? [];
  const conta = (s: Situacao) => todas.filter((e) => e.situacao === s).length;
  const lista = filtro === "todas" ? todas : todas.filter((e) => e.situacao === filtro);

  return (
    <Pagina
      titulo="Empresas"
      texto="Cada empresa é o cliente que paga. Ela pode estar vinculada a um ou mais sistemas (schemas)."
      acoes={<NovaEmpresa gatilho={<Button className="gap-1.5"><Plus className="size-4" />Nova empresa</Button>} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filtros<Filtro>
          valor={filtro}
          onChange={setFiltro}
          opcoes={[
            { valor: "todas", rotulo: "Todas", total: todas.length },
            { valor: "em_dia", rotulo: "Em dia", total: conta("em_dia") },
            { valor: "atraso", rotulo: "Em atraso", total: conta("atraso") },
            { valor: "suspensa", rotulo: "Suspensas", total: conta("suspensa") },
            { valor: "cortesia", rotulo: "Cortesia", total: conta("cortesia") },
            { valor: "cancelada", rotulo: "Canceladas", total: conta("cancelada") },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CNPJ…" className="bg-card pl-9" />
        </div>
      </div>

      <Cartao semPadding>
        {q.isLoading ? <Carregando /> : q.error ? <div className="p-4"><Erro erro={q.error} /></div> : lista.length === 0 ? (
          <Vazio
            icone="flat-color-icons:department"
            titulo={todas.length === 0 && !buscaAdiada ? "Nenhuma empresa cadastrada" : "Nada encontrado"}
            texto={todas.length === 0 && !buscaAdiada ? "Cadastre a primeira empresa cliente e vincule os sistemas que ela usa." : "Tente outro filtro ou outra busca."}
            acao={todas.length === 0 && !buscaAdiada ? <NovaEmpresa gatilho={<Button className="gap-1.5"><Plus className="size-4" />Nova empresa</Button>} /> : undefined}
          />
        ) : (
          <Tabela cabecalho={["Empresa", "Sistemas vinculados", "Mensalidade", "Vencimento", "Situação"]}>
            {lista.map((e) => (
              <tr key={e.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <Link to="/empresas/$id" params={{ id: e.id }} className="font-semibold hover:text-primary">{e.nome_fantasia || e.razao_social}</Link>
                  <div className="text-xs text-muted-foreground">{[cnpj(e.cnpj), e.dono_nome].filter(Boolean).join(" · ") || "—"}</div>
                </td>
                <td className="px-4 py-3">
                  {e.sistemas.length ? e.sistemas.filter((s) => s.ativo).map((s) => <Chip key={s.app} app={s.app} desligado={s.bloqueado} />) : <span className="text-xs text-muted-foreground">nenhum</span>}
                </td>
                <td className="px-4 py-3 font-semibold">{Number(e.mensalidade) > 0 ? brl(e.mensalidade) : "—"}</td>
                <td className="px-4 py-3">{e.dia_vencimento ? `dia ${e.dia_vencimento}` : "—"}</td>
                <td className="px-4 py-3"><SeloSituacao e={e} /></td>
              </tr>
            ))}
          </Tabela>
        )}
      </Cartao>
    </Pagina>
  );
}
