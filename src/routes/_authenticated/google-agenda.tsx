import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro, type ConfigAgenda } from "@/lib/adm/api";
import { cn } from "@/lib/utils";

// Configurações › Google Agenda: conectar uma agenda por vendedor e regras do agendamento automático.
export const Route = createFileRoute("/_authenticated/google-agenda")({
  validateSearch: (s: Record<string, unknown>) => ({
    google_ok: typeof s.google_ok === "string" ? s.google_ok : undefined,
    google_erro: typeof s.google_erro === "string" ? s.google_erro : undefined,
  }),
  head: () => ({ meta: [{ title: "Google Agenda — ImobAdm WSA" }] }),
  component: GoogleAgenda,
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SELECT = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function GoogleAgenda() {
  const { google_ok, google_erro } = Route.useSearch();
  const navigate = useNavigate({ from: "/google-agenda" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agenda-painel"], queryFn: api.agendaPainel });
  const sit = useQuery({ queryKey: ["google-situacao"], queryFn: api.googleSituacao });
  const [vendedor, setVendedor] = useState("");
  const [cfg, setCfg] = useState<ConfigAgenda | null>(null);

  useEffect(() => { if (q.data) setCfg((c) => c ?? q.data.config); }, [q.data]);
  useEffect(() => {
    if (!google_ok && !google_erro) return;
    if (google_ok) toast.success(`Agenda ${google_ok} conectada.`);
    if (google_erro) toast.error(google_erro);
    navigate({ search: { google_ok: undefined, google_erro: undefined }, replace: true });
  }, [google_ok, google_erro, navigate]);

  const conectar = useMutation({
    mutationFn: () => api.googleInicio(window.location.origin, vendedor || null),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const desconectar = useMutation({
    mutationFn: api.googleDesconectar,
    onSuccess: () => { toast.success("Agenda desconectada."); return qc.invalidateQueries({ queryKey: ["agenda-painel"] }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const salvar = useMutation({
    mutationFn: () => api.agendaConfigSalvar(cfg!),
    onSuccess: () => { toast.success("Regras salvas."); return qc.invalidateQueries({ queryKey: ["agenda-painel"] }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const num = (k: "duracao_min" | "intervalo_min" | "antecedencia_min", v: string) => setCfg((c) => (c ? { ...c, [k]: Number(v) } : c));

  return (
    <Pagina voltar="Configurações › Google Agenda" titulo="Google Agenda e agendamento automático"
      texto="O lead recebe um link, vê só os horários livres e marca sozinho. A reunião entra na agenda com o Google Meet.">
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : q.data && cfg ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Cartao icone="fluent-color:calendar-sync-24" titulo="Agendas conectadas" semPadding>
            {sit.data && !sit.data.configurado ? (
              <p className="border-b border-border bg-warning-soft/60 px-4 py-3 text-xs text-warning-strong">
                Faltam os secrets ADM_GOOGLE_CLIENT_ID e ADM_GOOGLE_CLIENT_SECRET no Supabase. URL de retorno no Google Cloud: <code className="break-all">{sit.data.retorno_url}</code>
              </p>
            ) : null}
            {q.data.agendas.length === 0 ? (
              <Vazio icone="fluent-color:calendar-sync-24" titulo="Nenhuma agenda conectada" texto="Conecte a agenda de quem vai fazer as demonstrações." />
            ) : (
              <ul className="divide-y divide-border">
                {q.data.agendas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <b className="block truncate text-sm">{a.email}</b>
                      <span className="text-xs text-muted-foreground">{a.vendedor ?? "Sem vendedor"}{a.detalhe ? ` · ${a.detalhe}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.token_valido ? <Selo tom="ok">Conectada</Selo> : <Selo tom="err">Reconectar</Selo>}
                      <Button size="sm" variant="outline" disabled={desconectar.isPending} onClick={() => desconectar.mutate(a.id)}>Desconectar</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-border p-4">
              <div className="min-w-48 flex-1">
                <Label htmlFor="vendedor">Vendedor</Label>
                <select id="vendedor" className={cn(SELECT, "mt-1")} value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                  <option value="">Usar o e-mail da conta Google</option>
                  {q.data.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
              <Button disabled={conectar.isPending || sit.data?.configurado === false} onClick={() => conectar.mutate()}>
                {conectar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Conectar agenda Google"}
              </Button>
            </div>
          </Cartao>

          <Cartao icone="flat-color-icons:rules" titulo="Regras do agendamento">
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div><Label htmlFor="dur">Duração (min)</Label><Input id="dur" type="number" min={10} max={240} value={cfg.duracao_min} onChange={(e) => num("duracao_min", e.target.value)} /></div>
                <div><Label htmlFor="int">Intervalo (min)</Label><Input id="int" type="number" min={0} max={120} value={cfg.intervalo_min} onChange={(e) => num("intervalo_min", e.target.value)} /></div>
                <div><Label htmlFor="ant">Antecedência (min)</Label><Input id="ant" type="number" min={0} value={cfg.antecedencia_min} onChange={(e) => num("antecedencia_min", e.target.value)} /></div>
              </div>
              <div>
                <Label>Dias de atendimento</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DIAS.map((d, i) => {
                    const on = cfg.horario.dias.includes(i);
                    return (
                      <button key={d} type="button" aria-pressed={on} className={cn("min-h-9 rounded-full border px-3 text-[13px] font-semibold max-md:min-h-11", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
                        onClick={() => setCfg({ ...cfg, horario: { ...cfg.horario, dias: on ? cfg.horario.dias.filter((x) => x !== i) : [...cfg.horario.dias, i].sort() } })}>{d}</button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="ini">Início</Label><Input id="ini" type="time" value={cfg.horario.inicio} onChange={(e) => setCfg({ ...cfg, horario: { ...cfg.horario, inicio: e.target.value } })} /></div>
                <div><Label htmlFor="fim">Fim</Label><Input id="fim" type="time" value={cfg.horario.fim} onChange={(e) => setCfg({ ...cfg, horario: { ...cfg.horario, fim: e.target.value } })} /></div>
              </div>
              <div>
                <Label htmlFor="dist">Distribuição das reuniões</Label>
                <select id="dist" className={cn(SELECT, "mt-1")} value={cfg.distribuicao} onChange={(e) => setCfg({ ...cfg, distribuicao: e.target.value as ConfigAgenda["distribuicao"] })}>
                  <option value="rodizio">Rodízio entre as agendas</option>
                  <option value="primeiro_livre">Primeira agenda livre</option>
                </select>
              </div>
              {([
                ["Criar link do Google Meet", cfg.criar_meet, (v: boolean) => setCfg({ ...cfg, criar_meet: v })],
                ["Mover o card para Reunião agendada", cfg.mover_card, (v: boolean) => setCfg({ ...cfg, mover_card: v })],
                ["Lembrete 24 h antes no WhatsApp", cfg.lembretes.h24, (v: boolean) => setCfg({ ...cfg, lembretes: { ...cfg.lembretes, h24: v } })],
                ["Lembrete 1 h antes no WhatsApp", cfg.lembretes.h1, (v: boolean) => setCfg({ ...cfg, lembretes: { ...cfg.lembretes, h1: v } })],
              ] as [string, boolean, (v: boolean) => void][]).map(([r, v, f]) => (
                <label key={r} className="flex items-center justify-between gap-3"><span>{r}</span><Switch checked={v} onCheckedChange={f} aria-label={r} /></label>
              ))}
              <Button className="w-full" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar regras"}
              </Button>
            </div>
          </Cartao>
        </div>
      ) : null}
    </Pagina>
  );
}
