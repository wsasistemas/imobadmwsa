import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Play, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro, type Passo } from "@/lib/adm/api";
import { dataHora } from "@/lib/adm/formato";

export const Route = createFileRoute("/_authenticated/regua")({
  head: () => ({ meta: [{ title: "Régua de cobrança — ImobAdm WSA" }] }),
  component: Regua,
});

const DESCRICAO: Record<string, string> = {
  "d-3": "Lembrete com o link do boleto/PIX",
  "d+1": "1º aviso de atraso",
  "d+5": "2º aviso: faltam 5 dias para a suspensão",
  "d+8": "Último aviso, com a data da suspensão",
  "d+11": "Aviso de que o acesso foi suspenso",
};

function quandoPasso(d: number) {
  if (d < 0) return `${-d} ${d === -1 ? "dia" : "dias"} antes do vencimento`;
  if (d === 0) return "no vencimento";
  return `${d} ${d === 1 ? "dia" : "dias"} de atraso`;
}

function Regua() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["regua"], queryFn: api.regua });
  const pendentes = useQuery({ queryKey: ["regua-pendentes"], queryFn: api.avisosPendentes, retry: false });
  const [tol, setTol] = useState(10);
  const [reativar, setReativar] = useState(true);
  const [passos, setPassos] = useState<Passo[]>([]);

  useEffect(() => {
    if (!q.data) return;
    setTol(q.data.dias_tolerancia);
    setReativar(q.data.reativar_automatico);
    setPassos(q.data.passos);
  }, [q.data]);

  const salvar = useMutation({
    mutationFn: () => api.salvarRegua(tol, reativar, passos),
    onSuccess: () => { toast.success("Régua salva."); qc.invalidateQueries({ queryKey: ["regua"] }); qc.invalidateQueries({ queryKey: ["regua-pendentes"] }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const rodar = useMutation({
    mutationFn: api.rodarRegua,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["regua-pendentes"] });
      if (r.total === 0) toast.info("Nenhum aviso para hoje.");
      else toast.success(`${r.enviados} enviado(s), ${r.falhas} falha(s), ${r.sem_configuracao} sem canal configurado.`);
      r.erros.slice(0, 3).forEach((e) => toast.error(e));
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const muda = (i: number, p: Partial<Passo>) => setPassos((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const canal = (i: number, c: "whatsapp" | "email", lig: boolean) =>
    muda(i, { canais: lig ? [...new Set([...passos[i]!.canais, c])] : passos[i]!.canais.filter((x) => x !== c) });

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} />;

  return (
    <Pagina
      titulo="Régua de cobrança"
      texto="Roda todo dia às 00:05 (Brasília): recalcula a situação de todas as empresas e manda os avisos do dia. Cada aviso sai uma vez só."
      acoes={
        <>
          <Button variant="outline" className="gap-1.5" onClick={() => rodar.mutate()} disabled={rodar.isPending}>
            {rodar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Enviar avisos de hoje agora
          </Button>
          <Button className="gap-1.5" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Cartao icone="flat-color-icons:lock" titulo="Suspensão">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tol">Dias de tolerância depois do vencimento</Label>
              <Input id="tol" type="number" min={0} max={60} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-28" />
              <p className="text-xs text-muted-foreground">
                Com {tol} dias, a empresa é suspensa no {tol + 1}º dia de atraso, às 00:05. Vale para todos os sistemas dela ao mesmo tempo.
              </p>
            </div>
            <label className="flex items-start gap-3">
              <Switch checked={reativar} onCheckedChange={setReativar} className="mt-0.5" />
              <span className="text-sm"><b>Reativar sozinho quando pagar</b><br /><span className="text-xs text-muted-foreground">Pagamento confirmado pelo Asaas (ou registrado no painel) devolve o acesso na hora.</span></span>
            </label>
            {q.data?.atualizado_em ? <p className="text-xs text-muted-foreground">Última alteração: {dataHora(q.data.atualizado_em)}</p> : null}
          </div>
        </Cartao>

        <Cartao icone="flat-color-icons:timeline" titulo="Avisos" semPadding>
          <ul className="divide-y divide-border">
            {passos.map((p, i) => (
              <li key={p.passo} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Switch checked={p.ativo} onCheckedChange={(v) => muda(i, { ativo: v })} aria-label={`Ativar ${p.passo}`} />
                <div className="min-w-48 flex-1">
                  <b className="text-sm uppercase">{p.passo}</b> <span className="text-xs text-muted-foreground">· {quandoPasso(p.d)}</span>
                  <div className="text-xs text-muted-foreground">{DESCRICAO[p.passo] ?? ""}</div>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={p.canais.includes("whatsapp")} onChange={(e) => canal(i, "whatsapp", e.target.checked)} />WhatsApp
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={p.canais.includes("email")} onChange={(e) => canal(i, "email", e.target.checked)} />E-mail
                </label>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Não recebem aviso: cortesia, cancelada, fatura paga e empresa com prazo extra (menos o D-3). Os textos do WhatsApp são templates aprovados na Meta (docs/regua-templates.md).
          </p>
        </Cartao>
      </div>

      <Cartao icone="fluent-color:send-24" titulo="Avisos que saem hoje" semPadding
        extra={pendentes.data ? <Selo tom="info">{pendentes.data.pendentes.length} pendente(s)</Selo> : null}>
        {pendentes.isLoading ? <Carregando /> : pendentes.error ? <div className="p-4"><Erro erro={pendentes.error} /></div> : pendentes.data!.pendentes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum aviso pendente para hoje.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {pendentes.data!.pendentes.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span><b>{p.nome}</b> <span className="text-muted-foreground">· {p.passo.toUpperCase()} · {p.dias < 0 ? `vence em ${-p.dias} dia(s)` : `${p.dias} dia(s) de atraso`}</span></span>
                <span className="text-xs text-muted-foreground">{p.canal === "email" ? "E-mail" : "WhatsApp"} → {p.destino}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </Pagina>
  );
}
