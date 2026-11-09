import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { api, mensagemErro } from "@/lib/adm/api";
import { cn } from "@/lib/utils";

// Página pública (sem login) onde o lead marca, remarca ou cancela a demonstração. A proteção é o token do link.
export const Route = createFileRoute("/agendar/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agendar demonstração — WSA Sistemas" }, { name: "robots", content: "noindex" }] }),
  component: Agendar,
});

const TZ = "America/Sao_Paulo";
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const diaLongo = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" });
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center gap-2.5">
          <img src="/logo-wsa-128.png" alt="" className="size-10 rounded-full bg-card shadow-sm" />
          <strong className="text-[15px] font-extrabold">WSA Sistemas</strong>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

function Agendar() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agendar", token], queryFn: () => api.agendaHorarios(token), retry: false });
  const [dia, setDia] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [remarcando, setRemarcando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const dias = useMemo(() => {
    const m = new Map<string, { inicio: string; fim: string }[]>();
    for (const h of q.data?.horarios ?? []) m.set(chaveDia(h.inicio), [...(m.get(chaveDia(h.inicio)) ?? []), h]);
    return [...m.entries()];
  }, [q.data]);

  const atualizar = () => {
    setEscolhido(null);
    setRemarcando(false);
    return qc.invalidateQueries({ queryKey: ["agendar", token] });
  };
  const marcar = useMutation({
    mutationFn: () => api.agendaMarcar(token, remarcando ? "remarcar" : "marcar", escolhido!),
    onSuccess: () => { setAviso(null); return atualizar(); },
    onError: (e) => { setAviso(mensagemErro(e)); return atualizar(); },
  });
  const cancelar = useMutation({
    mutationFn: () => api.agendaMarcar(token, "cancelar"),
    onSuccess: () => { setAviso("Reunião cancelada."); return atualizar(); },
    onError: (e) => setAviso(mensagemErro(e)),
  });

  if (q.isLoading) return <Moldura><div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-primary" /></div></Moldura>;
  if (q.error || !q.data) {
    return (
      <Moldura>
        <h1 className="font-display text-xl">Link indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">{q.error ? mensagemErro(q.error) : "Peça um novo link para a equipe WSA."}</p>
      </Moldura>
    );
  }

  const { minha, nome, duracao_min } = q.data;
  if (minha && !remarcando) {
    return (
      <Moldura>
        <div className="flex items-center gap-2"><IconeColorido nome="fluent-color:calendar-checkmark-24" tamanho={24} /><h1 className="font-display text-xl">Reunião marcada</h1></div>
        {aviso ? <p role="status" className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{aviso}</p> : null}
        <p className="mt-3 text-[15px] font-semibold first-letter:uppercase">{diaLongo(minha.inicio)}, às {hora(minha.inicio)}</p>
        <p className="text-sm text-muted-foreground">Duração de {duracao_min} minutos. O convite foi enviado para o seu e-mail.</p>
        {minha.meet_url ? <Button asChild className="mt-4 w-full"><a href={minha.meet_url} target="_blank" rel="noreferrer">Entrar no Google Meet</a></Button> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => { setAviso(null); setRemarcando(true); }}>Remarcar</Button>
          <Button variant="outline" className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/5" disabled={cancelar.isPending} onClick={() => cancelar.mutate()}>
            {cancelar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Cancelar"}
          </Button>
        </div>
      </Moldura>
    );
  }

  const diaAtual = dia && dias.some(([d]) => d === dia) ? dia : dias[0]?.[0] ?? null;
  const horarios = dias.find(([d]) => d === diaAtual)?.[1] ?? [];

  return (
    <Moldura>
      <h1 className="font-display text-xl">{remarcando ? "Escolha o novo horário" : `Olá${nome ? `, ${nome}` : ""}! Escolha o melhor horário`}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Demonstração de {duracao_min} minutos por Google Meet. Horários de Brasília.</p>
      {aviso ? <p role="status" className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{aviso}</p> : null}

      {dias.length === 0 ? (
        <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">Nenhum horário disponível agora. A equipe WSA vai entrar em contato com você.</p>
      ) : (
        <>
          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {dias.map(([d, l]) => (
              <button key={d} type="button" onClick={() => { setDia(d); setEscolhido(null); }}
                className={cn("min-h-11 shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-semibold capitalize", d === diaAtual ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                {diaCurto(l[0]!.inicio)}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horarios.map((h) => (
              <button key={h.inicio} type="button" aria-pressed={escolhido === h.inicio} onClick={() => setEscolhido(h.inicio)}
                className={cn("min-h-11 rounded-lg border text-sm font-semibold", escolhido === h.inicio ? "border-primary bg-primary-soft text-primary-dark" : "border-border hover:bg-muted")}>
                {hora(h.inicio)}
              </button>
            ))}
          </div>
          <Button className="mt-4 min-h-11 w-full" disabled={!escolhido || marcar.isPending} onClick={() => marcar.mutate()}>
            {marcar.isPending ? <Loader2 className="size-4 animate-spin" /> : remarcando ? "Confirmar novo horário" : "Confirmar reunião"}
          </Button>
        </>
      )}
      {remarcando ? <Button variant="ghost" className="mt-2 min-h-11 w-full" onClick={() => setRemarcando(false)}>Voltar</Button> : null}
    </Moldura>
  );
}
