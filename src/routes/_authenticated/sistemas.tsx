import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Plus } from "lucide-react";

import { AdicionarSistema } from "@/components/adm/dialogos";
import { Carregando, Cartao, Erro, Pagina, Selo, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import type { NomeIcone } from "@/components/icones/icone-colorido";
import { api } from "@/lib/adm/api";
import { dataHora } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/sistemas")({
  head: () => ({ meta: [{ title: "Sistemas e schemas — ImobAdm WSA" }] }),
  component: Sistemas,
});

const ICONE: Record<string, NomeIcone> = {
  imobsystem: "fluent-color:building-multiple-24", imobdoces: "fluent-color:building-store-24",
  imobenviomassa: "fluent-color:send-24", imobdesk: "fluent-color:chat-24", suprimentos: "flat-color-icons:database",
  imobimoveis: "fluent-color:globe-24",
};

/** A verificação conta como instalada se o site consultou nos últimos 30 dias (mesma regra da Central de Acessos). */
const instalada = (d: string | null) => !!d && Date.now() - new Date(d).getTime() < 30 * 86_400_000;

function Sistemas() {
  const q = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas });
  return (
    <Pagina titulo="Sistemas e schemas" texto={<>Os aplicativos no Supabase central (<code>ikvjaowvpvxojvcfwnct</code>) e como cada um separa as empresas.</>}
      acoes={<AdicionarSistema gatilho={<Button className="gap-1.5"><Plus className="size-4" />Adicionar sistema</Button>} />}>
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : (q.data ?? []).length === 0 ? (
        <Vazio icone="flat-color-icons:data-configuration" titulo="Nenhum sistema" texto="Os sistemas vêm da Central de Acessos (acessos.aplicativos)." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((s) => (
            <Cartao key={s.app} icone={ICONE[s.app] ?? "fluent-color:apps-24"} titulo={s.nome}
              extra={instalada(s.ultima_verificacao_em) ? <Selo tom="ok">Verificação instalada</Selo> : <Selo tom="war">Sem verificação</Selo>}>
              <dl className="divide-y divide-border text-sm">
                <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Schema</dt><dd><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.app === "imobsystem" ? "public" : s.app}</code></dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Separação da empresa</dt><dd className="text-right">{s.descricao_ref ?? (s.tipo_ref === "schema" ? "um schema por empresa" : "tenant")}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Empresas</dt><dd><b>{s.empresas}</b>{Number(s.suspensas) > 0 ? <span className="text-destructive"> · {s.suspensas} suspensa(s)</span> : null}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Última checagem do site</dt><dd>{s.ultima_verificacao_em ? dataHora(s.ultima_verificacao_em) : "nunca"}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Cobra mensalidade</dt><dd>{s.cobra ? "sim" : "não"}</dd></div>
              </dl>
              {!instalada(s.ultima_verificacao_em) ? (
                <p className="mt-3 rounded-lg bg-warning-soft p-3 text-xs text-warning">
                  O site deste sistema não consultou a Central de Acessos nos últimos 30 dias. A trava por empresa
                  (<code>empresa_liberada</code>) é instalada em cada site na Fase 9: sem ela a suspensão não tira o sistema do ar.
                </p>
              ) : null}
            </Cartao>
          ))}
        </div>
      )}
    </Pagina>
  );
}
