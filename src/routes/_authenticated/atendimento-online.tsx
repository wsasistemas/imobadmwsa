import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { SeloTemperatura } from "@/components/adm/comercial";
import { Carregando, Cartao, Erro, Pagina, Selo, Vazio } from "@/components/adm/ui";
import { IconeColorido, type NomeIcone } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  mensagemErro,
  type AtendConversa,
  type SituacaoConversa,
  type AtendConfig,
  type AtendPainel,
  type AtendResposta,
  type AtendSistema,
  type Faixa,
  type Janela,
  type SimulacaoResposta,
  type Temperatura,
} from "@/lib/adm/api";
import { cn } from "@/lib/utils";

// Gestão Comercial › Atendimento ONLINE (mockup aprovado em 11/11/2026): robô Sophia no WhatsApp do ecossistema WSA.
// Fase 1: configuração pré-preenchida. Fase 2: simulador. Conversas e envio real chegam na Fase 3; o painel, na Fase 4.
export const Route = createFileRoute("/_authenticated/atendimento-online")({
  head: () => ({ meta: [{ title: "Atendimento ONLINE — ImobAdm WSA" }] }),
  component: AtendimentoOnline,
});

type Aba = "conversas" | "boasvindas" | "base" | "prompt" | "fila" | "painel" | "sim" | "whats";
const ABAS: [Aba, string, NomeIcone][] = [
  ["conversas", "Conversas", "fluent-color:chat-24"],
  ["boasvindas", "Boas-vindas e regras", "fluent-color:send-24"],
  ["base", "Base de conhecimento", "flat-color-icons:database"],
  ["prompt", "Prompt do atendimento", "flat-color-icons:rules"],
  ["fila", "Fila e horários", "fluent-color:clock-24"],
  ["painel", "Painel do robô", "fluent-color:poll-24"],
  ["sim", "Simulador do robô", "fluent-color:video-24"],
  ["whats", "WhatsApp", "flat-color-icons:phone"],
];
const ABAS_CONFIG = new Set<Aba>(["boasvindas", "prompt", "fila", "whats"]);

// Mesmo texto de supabase/ikvj/functions/_shared/atendimento.ts (REGRAS_FIXAS).
const REGRAS_FIXAS = [
  "Fala só dos sistemas da Base de conhecimento e do site www.imobsystems.com.br.",
  "Nunca inventa preço, desconto, prazo, funcionalidade nem integração.",
  'Funcionalidade "em validação" não é anunciada como pronta.',
  "Se o lead pedir para sair (PARAR, SAIR, NÃO QUERO), encerra na hora e marca no contato.",
  "Nunca pede senha, cartão, CPF ou documento.",
];
const PASSAR: [keyof AtendConfig["passar_consultor"], string][] = [
  ["pedido_humano", "O lead pedir para falar com uma pessoa"],
  ["preco", "Perguntar preço fechado, desconto ou contrato"],
  ["temperatura_80", "A nota do lead chegar a 80 (muito quente)"],
  ["nao_entendeu_2", "O robô não entender 2 vezes seguidas"],
  ["cliente_atual", "O lead já é cliente (tem empresa cadastrada)"],
];
const CATEGORIAS: Record<AtendResposta["categoria"], string> = {
  geral: "Geral",
  preco: "Preço",
  integracao: "Integração",
  seguranca: "Segurança",
  implantacao: "Implantação",
};
const SELECT = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

// Só os campos que a tela edita (os que o robô muda sozinho, como o próximo envio, não contam como alteração).
const NAO_EDITAVEIS = new Set([
  "ligado",
  "simulado_em",
  "atualizado_em",
  "atualizado_por",
  "proximo_envio_em",
  "webhook_id",
  "webhook_vault_id",
  "id",
]);
const editavel = (c: AtendConfig) =>
  JSON.stringify(
    Object.entries(c)
      .filter(([k]) => !NAO_EDITAVEIS.has(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

function AtendimentoOnline() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["atend-painel"], queryFn: api.atendPainel });
  const [aba, setAba] = useState<Aba>("conversas");
  const [cfg, setCfg] = useState<AtendConfig | null>(null);
  useEffect(() => {
    if (q.data && !cfg) setCfg(q.data.config);
  }, [q.data, cfg]);

  const sujo = !!cfg && !!q.data && editavel(cfg) !== editavel(q.data.config);
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ["atend-painel"] });
    await qc.invalidateQueries({ queryKey: ["atend-fila"] });
  };
  const salvar = useMutation({
    mutationFn: () => api.atendConfigSalvar(cfg!),
    onSuccess: async () => {
      toast.success("Configuração salva.");
      await recarregar();
      setCfg(null);
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const ligar = useMutation({
    mutationFn: (v: boolean) => api.atendLigar(v),
    onSuccess: async (_, v) => {
      toast.success(v ? "Robô ligado." : "Robô pausado.");
      await recarregar();
      setCfg(null);
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const set = (p: Partial<AtendConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const ligado = q.data?.config.ligado ?? false;

  return (
    <Pagina
      voltar="Gestão Comercial › Atendimento ONLINE"
      titulo="Atendimento ONLINE"
      texto={
        <>
          WhatsApp do ecossistema WSA Sistemas IA. Recebe os contatos de <b>Leads &amp; Contatos</b>
          , envia a boas-vindas e conversa só com leads <b>Mornos</b> e <b>Quentes</b>.
        </>
      }
      acoes={
        q.data ? (
          <div className="flex items-center gap-2">
            {ligado ? (
              <Selo tom="ok">● Robô no ar · {q.data.config.agente_nome}</Selo>
            ) : (
              <Selo tom="neu">Robô desligado</Selo>
            )}
            <Button
              variant={ligado ? "outline" : "default"}
              disabled={ligar.isPending}
              onClick={() => ligar.mutate(!ligado)}
              title={
                !ligado && !q.data.config.simulado_em
                  ? "Faça 1 simulação completa antes de ligar"
                  : undefined
              }
            >
              {ligar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : ligado ? (
                "Pausar robô"
              ) : (
                "Ligar robô"
              )}
            </Button>
          </div>
        ) : null
      }
    >
      {q.isLoading || (q.data && !cfg) ? (
        <Carregando />
      ) : q.error ? (
        <Erro erro={q.error} />
      ) : q.data && cfg ? (
        <div className="space-y-4">
          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1">
            {ABAS.map(([k, r, i]) => (
              <button
                key={k}
                role="tab"
                aria-selected={aba === k}
                type="button"
                onClick={() => setAba(k)}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] whitespace-nowrap",
                  aba === k
                    ? "bg-card font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <IconeColorido nome={i} tamanho={16} />
                {r}
              </button>
            ))}
          </div>

          {aba === "conversas" && <AbaConversas agente={q.data.config.agente_nome} />}
          {aba === "boasvindas" && <AbaBoasVindas cfg={cfg} set={set} painel={q.data} />}
          {aba === "base" && <AbaBase painel={q.data} aoMudar={recarregar} />}
          {aba === "prompt" && <AbaPrompt cfg={cfg} set={set} />}
          {aba === "fila" && <AbaFila cfg={cfg} set={set} painel={q.data} aoMudar={recarregar} />}
          {aba === "painel" && <AbaPainel />}
          {aba === "sim" && (
            <AbaSimulador painel={q.data} cfg={q.data.config} aoTestar={recarregar} />
          )}
          {aba === "whats" && <AbaWhatsApp cfg={cfg} set={set} />}

          {sujo && ABAS_CONFIG.has(aba) ? (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-lg">
              <span className="text-sm font-semibold">Alterações não salvas</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCfg(q.data!.config)}>
                  Descartar
                </Button>
                <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                  {salvar.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Salvar configuração"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------------------------------
function Aviso({ children, tom = "war" }: { children: ReactNode; tom?: "war" | "info" }) {
  return (
    <p
      className={cn(
        "rounded-lg border-l-4 px-3 py-2 text-[13px]",
        tom === "war"
          ? "border-warning bg-warning-soft/60 text-warning-strong"
          : "border-primary bg-primary-soft/60",
      )}
    >
      {children}
    </p>
  );
}

function Campo({
  id,
  rotulo,
  dica,
  children,
}: {
  id?: string;
  rotulo: string;
  dica?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="mt-1">{children}</div>
      {dica ? <p className="mt-1 text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

function Pilulas<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: [T, string][];
  valor: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([k, r]) => {
        const on = valor.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? valor.filter((x) => x !== k) : [...valor, k])}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[13px] font-semibold max-md:min-h-11",
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
  );
}

function EditorJanela({
  valor,
  onChange,
  prefixo,
}: {
  valor: Janela;
  onChange: (v: Janela) => void;
  prefixo: string;
}) {
  const linha = (k: keyof Janela, r: string) => {
    const f: Faixa = valor[k];
    return (
      <div key={k} className="grid grid-cols-[110px_auto_1fr_1fr] items-center gap-2 text-sm">
        <span className="font-medium">{r}</span>
        <Switch
          checked={!!f}
          aria-label={`${r} aberto`}
          onCheckedChange={(v) => onChange({ ...valor, [k]: v ? ["09:00", "18:00"] : null })}
        />
        {f ? (
          <>
            <Input
              id={`${prefixo}-${k}-ini`}
              aria-label={`${r} início`}
              type="time"
              value={f[0]}
              onChange={(e) => onChange({ ...valor, [k]: [e.target.value, f[1]] })}
            />
            <Input
              aria-label={`${r} fim`}
              type="time"
              value={f[1]}
              onChange={(e) => onChange({ ...valor, [k]: [f[0], e.target.value] })}
            />
          </>
        ) : (
          <span className="col-span-2 text-xs text-muted-foreground">Fechado</span>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-2">
      {linha("seg_sex", "Seg a sex")}
      {linha("sab", "Sábado")}
      {linha("dom", "Domingo")}
    </div>
  );
}

function BolhaWhats({
  autor,
  nome,
  texto,
  botoes,
  onBotao,
}: {
  autor: "lead" | "robo";
  nome?: string;
  texto: string;
  botoes?: string[];
  onBotao?: (b: string) => void;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] shadow-sm",
        autor === "robo" ? "bg-card" : "ml-auto bg-[#d9fdd3] text-[#1f2937]",
      )}
    >
      {autor === "robo" && nome ? <b className="block text-[11.5px] text-primary">{nome}</b> : null}
      <span className="whitespace-pre-wrap break-words">{texto}</span>
      {botoes && botoes.length ? (
        <div className="mt-2 border-t border-border pt-1 text-center">
          {botoes.map((b) => (
            <button
              key={b}
              type="button"
              disabled={!onBotao}
              onClick={() => onBotao?.(b)}
              className="block w-full py-1 text-[13px] text-[#1a73e8] disabled:cursor-default"
            >
              {b}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const Whats = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("space-y-2 rounded-xl bg-[#efe7de] p-3", className)}>{children}</div>
);

function nomesSistemas(painel: AtendPainel, apps: string[]) {
  const n = apps
    .map((a) => painel.sistemas.find((s) => s.app === a)?.nome)
    .filter(Boolean) as string[];
  if (!n.length) return "nossos sistemas";
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}
const boasVindas = (painel: AtendPainel, texto: string, nome: string, apps: string[]) =>
  texto
    .replaceAll("{{nome}}", nome.trim().split(/\s+/)[0] || "tudo bem")
    .replaceAll("{{sistemas}}", nomesSistemas(painel, apps));

// Conversas -------------------------------------------------------------------------------------------
const SITUACAO: Record<SituacaoConversa, [string, "ok" | "war" | "err" | "info" | "neu"]> = {
  aguardando: ["Boas-vindas enviada", "info"],
  robo: ["Com a Sophia", "ok"],
  consultor: ["Com o consultor", "war"],
  encerrada: ["Encerrada", "neu"],
  saiu: ["Pediu para sair", "neu"],
  falhou: ["Não enviada", "err"],
};
const quando = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function AbaConversas({ agente }: { agente: string }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["atend-conversas", busca],
    queryFn: () => api.atendConversas(busca),
    refetchInterval: 15000,
  });
  const atual = lista.data?.find((c) => c.id === sel) ?? lista.data?.[0] ?? null;
  if (lista.isLoading) return <Carregando />;
  if (lista.error) return <Erro erro={lista.error} />;
  if (!busca && (lista.data ?? []).length === 0) {
    return (
      <div className="space-y-4">
        <Aviso tom="info">
          Nenhuma conversa ainda. Com o robô ligado e o webhook conectado (aba WhatsApp), a {agente}{" "}
          envia a boas-vindas para a fila abaixo, uma por vez.
        </Aviso>
        <FilaPrevia />
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-2">
          <Input
            aria-label="Buscar conversa"
            placeholder="Buscar nome ou telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <ul className="max-h-[620px] divide-y divide-border overflow-y-auto">
          {(lista.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSel(c.id)}
                className={cn(
                  "w-full px-3 py-2.5 text-left",
                  atual?.id === c.id ? "bg-primary-soft" : "hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <b className="truncate text-sm">{c.nome ?? c.whatsapp}</b>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {quando(c.ultima_msg_em)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Selo tom={SITUACAO[c.situacao][1]}>
                    {c.consultor && c.situacao === "consultor"
                      ? c.consultor
                      : SITUACAO[c.situacao][0]}
                  </Selo>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.ultima?.texto ?? c.bv_erro ?? ""}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {atual ? <Chat key={atual.id} c={atual} agente={agente} /> : null}
    </div>
  );
}

function Chat({ c, agente }: { c: AtendConversa; agente: string }) {
  const qc = useQueryClient();
  const msgs = useQuery({
    queryKey: ["atend-msgs", c.id],
    queryFn: () => api.atendMensagens(c.id),
    refetchInterval: 8000,
  });
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.data]);
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["atend-msgs", c.id] }),
      qc.invalidateQueries({ queryKey: ["atend-conversas"] }),
    ]);
  const assumir = useMutation({
    mutationFn: (v: boolean) => api.atendAssumir(c.id, v),
    onSuccess: async (_, v) => {
      toast.success(
        v ? "Conversa assumida: a Sophia pausou." : "Conversa devolvida para a Sophia.",
      );
      await recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const enviar = useMutation({
    mutationFn: () => api.atendEnviar(c.id, texto),
    onSuccess: async () => {
      setTexto("");
      await recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const comRobo = c.situacao === "robo" || c.situacao === "aguardando" || c.situacao === "falhou";
  return (
    <Cartao
      icone="fluent-color:chat-24"
      titulo={c.nome ?? c.whatsapp ?? "Conversa"}
      extra={
        c.situacao === "saiu" ? null : comRobo ? (
          <Button
            size="sm"
            variant="outline"
            disabled={assumir.isPending}
            onClick={() => assumir.mutate(true)}
          >
            Assumir conversa
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={assumir.isPending}
            onClick={() => assumir.mutate(false)}
          >
            Devolver para a {agente}
          </Button>
        )
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {c.whatsapp}
            {c.empresa ? ` · ${c.empresa}` : ""}
          </span>
          <SeloTemperatura t={c.temperatura} pontos={c.pontuacao} />
          <Selo tom={SITUACAO[c.situacao][1]}>
            {SITUACAO[c.situacao][0]}
            {c.consultor ? ` · ${c.consultor}` : ""}
          </Selo>
          {c.origem === "lead" ? <span>o lead escreveu primeiro</span> : null}
        </div>
        <Whats className="max-h-[480px] min-h-[300px] overflow-y-auto">
          {msgs.isLoading ? (
            <Carregando />
          ) : (
            (msgs.data ?? []).map((m) =>
              m.autor === "sistema" ? (
                <p
                  key={m.id}
                  className="mx-auto w-fit rounded-full bg-card/80 px-3 py-1 text-center text-[11.5px] text-muted-foreground"
                >
                  {m.texto}
                </p>
              ) : (
                <BolhaWhats
                  key={m.id}
                  autor={m.autor === "lead" ? "lead" : "robo"}
                  nome={
                    m.autor === "robo"
                      ? agente
                      : `Consultor${m.detalhe?.pelo === "celular" ? " · pelo celular" : ""}`
                  }
                  texto={m.texto}
                />
              ),
            )
          )}
          <div ref={fim} />
        </Whats>
        {c.situacao === "saiu" ? (
          <p className="text-xs text-muted-foreground">
            O lead pediu para não receber mais WhatsApp.
          </p>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (texto.trim()) enviar.mutate();
              }}
            >
              <Input
                aria-label="Responder como consultor"
                placeholder="Responder como consultor (a Sophia pausa nesta conversa)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <Button type="submit" className="gap-1" disabled={!texto.trim() || enviar.isPending}>
                {enviar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Enviar
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Você também pode responder direto no celular da sessão: a {agente} pausa sozinha nesta
              conversa.
            </p>
          </>
        )}
      </div>
    </Cartao>
  );
}

function FilaPrevia({ compacta }: { compacta?: boolean }) {
  const f = useQuery({ queryKey: ["atend-fila"], queryFn: api.atendFila });
  const [ver, setVer] = useState<"na_fila" | "conversa" | "fora">("na_fila");
  if (f.isLoading) return <Carregando />;
  if (f.error) return <Erro erro={f.error} />;
  const d = f.data!;
  const linhas = d.linhas.filter((l) => l.grupo === ver).slice(0, compacta ? 8 : 100);
  return (
    <Cartao
      icone="fluent-color:people-list-24"
      titulo="Fila de boas-vindas"
      semPadding
      extra={<span className="text-xs text-muted-foreground">prévia pelas regras atuais</span>}
    >
      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {(
          [
            ["na_fila", `Vão receber · ${d.resumo.na_fila}`],
            ["conversa", `Já receberam · ${d.resumo.conversas}`],
            ["fora", `Ficam de fora · ${d.resumo.fora}`],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            type="button"
            aria-pressed={ver === k}
            onClick={() => setVer(k)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[13px] font-semibold",
              ver === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      {linhas.length === 0 ? (
        <Vazio icone="fluent-color:people-list-24" titulo="Ninguém aqui" />
      ) : (
        <ul className="divide-y divide-border">
          {linhas.map((l) => (
            <li
              key={l.negocio_id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <b className="block truncate">{l.nome ?? "Sem nome"}</b>
                <span className="text-xs text-muted-foreground">
                  {[l.empresa, l.etapa, l.whatsapp ?? "sem telefone"].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SeloTemperatura t={l.temperatura} pontos={l.pontuacao} />
                <span className="text-xs text-muted-foreground">
                  {l.grupo === "fora"
                    ? l.motivo
                    : l.grupo === "conversa"
                      ? l.respondeu
                        ? "Respondeu"
                        : "Enviada · sem resposta"
                      : "Na fila"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

// Boas-vindas e regras ----------------------------------------------------------------------------------
function AbaBoasVindas({
  cfg,
  set,
  painel,
}: {
  cfg: AtendConfig;
  set: (p: Partial<AtendConfig>) => void;
  painel: AtendPainel;
}) {
  const previa = boasVindas(painel, cfg.bv_texto, "Iris", ["imobimoveis", "suprimentos"]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao icone="fluent-color:people-24" titulo="Quem recebe">
        <div className="space-y-4 text-sm">
          <Campo
            rotulo="1. Tem telefone válido"
            dica="O campo Telefone de Leads & Contatos (celular com DDD). Sem telefone, fica de fora."
          >
            <span />
          </Campo>
          <Campo
            rotulo="2. Temperatura"
            dica="Usa a classificação de Leads & Contatos. Se um lead frio esquentar, entra sozinho."
          >
            <Pilulas<Temperatura>
              opcoes={[
                ["quente", "Quente"],
                ["morno", "Morno"],
                ["frio", "Frio"],
              ]}
              valor={cfg.bv_temperaturas}
              onChange={(v) => set({ bv_temperaturas: v })}
            />
          </Campo>
          <Campo
            rotulo="3. Etapa do funil"
            dica="Depois dessas etapas um consultor já conduz o negócio. Ganho e Perdido nunca recebem."
          >
            <Pilulas
              opcoes={painel.etapas.map((e) => [e.chave, e.nome] as [string, string])}
              valor={cfg.bv_etapas}
              onChange={(v) => set({ bv_etapas: v })}
            />
          </Campo>
          <Campo
            rotulo="4. Uma vez só"
            dica="Cada telefone recebe a boas-vindas uma vez. Quem pediu para sair nunca mais recebe."
          >
            <span />
          </Campo>
        </div>
      </Cartao>

      <Cartao icone="fluent-color:send-24" titulo="Mensagem de boas-vindas">
        <div className="space-y-3 text-sm">
          <Aviso>
            Sai pelo número da sessão <b>wsa-admin</b> do OpeWA. Os botões vão como opções numeradas
            (1, 2, 3), que é o que o WhatsApp Web aceita.
          </Aviso>
          <Campo
            id="bv-texto"
            rotulo="Texto"
            dica="Variáveis: {{nome}} (primeiro nome) e {{sistemas}} (interesse do lead)."
          >
            <Textarea
              id="bv-texto"
              rows={4}
              value={cfg.bv_texto}
              onChange={(e) => set({ bv_texto: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Botões (até 3, 20 letras cada)">
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Input
                  key={i}
                  aria-label={`Botão ${i + 1}`}
                  maxLength={20}
                  value={cfg.bv_botoes[i] ?? ""}
                  placeholder={i === 0 ? "Obrigatório" : "Opcional"}
                  onChange={(e) => {
                    const b = [...cfg.bv_botoes];
                    b[i] = e.target.value;
                    set({
                      bv_botoes: b
                        .map((x) => x ?? "")
                        .filter((x, j) => x.trim() || j < i)
                        .slice(0, 3),
                    });
                  }}
                />
              ))}
            </div>
          </Campo>
          <Label>Prévia no WhatsApp</Label>
          <Whats>
            <BolhaWhats
              autor="robo"
              nome={`${cfg.agente_nome} · ${cfg.empresa_nome}`}
              texto={previa}
              botoes={cfg.bv_botoes.filter((b) => b.trim())}
            />
          </Whats>
        </div>
      </Cartao>

      <Cartao icone="fluent-color:clock-24" titulo="Quando e quanto envia">
        <div className="space-y-4 text-sm">
          <Campo rotulo="Janela de envio">
            <EditorJanela
              prefixo="bv"
              valor={cfg.bv_janela}
              onChange={(v) => set({ bv_janela: v })}
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id="bv-lim" rotulo="Limite por dia">
              <Input
                id="bv-lim"
                type="number"
                min={1}
                max={1000}
                value={cfg.bv_limite_dia}
                onChange={(e) => set({ bv_limite_dia: Number(e.target.value) })}
              />
            </Campo>
            <Campo id="bv-i1" rotulo="Intervalo mínimo (s)">
              <Input
                id="bv-i1"
                type="number"
                min={10}
                value={cfg.bv_intervalo[0]}
                onChange={(e) =>
                  set({ bv_intervalo: [Number(e.target.value), cfg.bv_intervalo[1]] })
                }
              />
            </Campo>
            <Campo id="bv-i2" rotulo="Intervalo máximo (s)">
              <Input
                id="bv-i2"
                type="number"
                min={10}
                value={cfg.bv_intervalo[1]}
                onChange={(e) =>
                  set({ bv_intervalo: [cfg.bv_intervalo[0], Number(e.target.value)] })
                }
              />
            </Campo>
          </div>
          <Campo id="bv-q" rotulo="Lead novo entra">
            <select
              id="bv-q"
              className={SELECT}
              value={cfg.bv_quando}
              onChange={(e) => set({ bv_quando: e.target.value as AtendConfig["bv_quando"] })}
            >
              <option value="na_hora">Na hora (dentro da janela)</option>
              <option value="diario_9h">Uma vez por dia, às 9h</option>
            </select>
          </Campo>
          <Aviso>
            Mandar muitas mensagens para quem não falou com a gente pode bloquear o número. Por
            isso: só Morno e Quente, uma vez por telefone, com limite por dia e intervalo aleatório.
          </Aviso>
        </div>
      </Cartao>

      <FilaPrevia compacta />
    </div>
  );
}

// Base de conhecimento -----------------------------------------------------------------------------------
function AbaBase({ painel, aoMudar }: { painel: AtendPainel; aoMudar: () => Promise<void> }) {
  const [sub, setSub] = useState<"sistemas" | "respostas">("sistemas");
  return (
    <div className="space-y-3">
      <div className="flex w-max gap-1 rounded-xl bg-muted/50 p-1">
        {(
          [
            ["sistemas", "Sistemas do ecossistema"],
            ["respostas", "Respostas prontas"],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            type="button"
            aria-pressed={sub === k}
            onClick={() => setSub(k)}
            className={cn(
              "min-h-9 rounded-lg px-3 text-[13px]",
              sub === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      {sub === "sistemas" ? (
        <BaseSistemas painel={painel} aoMudar={aoMudar} />
      ) : (
        <BaseRespostas painel={painel} aoMudar={aoMudar} />
      )}
    </div>
  );
}

const SISTEMA_NOVO: Partial<AtendSistema> = {
  nome: "",
  app: null,
  segmento: "",
  menu_nome: "",
  pagina_url: "",
  sistema_url: "",
  material_url: "",
  ativo: true,
  apresentacao: "",
  texto_material: "",
  para_quem: "",
  nao_para_quem: "",
  funcionalidades: [],
};

function BaseSistemas({ painel, aoMudar }: { painel: AtendPainel; aoMudar: () => Promise<void> }) {
  const [sel, setSel] = useState<string | "novo">(painel.sistemas[0]?.id ?? "novo");
  const atual =
    sel === "novo" ? SISTEMA_NOVO : (painel.sistemas.find((s) => s.id === sel) ?? SISTEMA_NOVO);
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="space-y-2">
        <ul className="space-y-1.5 rounded-xl border border-border bg-card p-2">
          {painel.sistemas.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSel(s.id)}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm",
                  sel === s.id
                    ? "border-primary/40 bg-primary-soft font-semibold"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <span className="truncate">{s.nome}</span>
                {!s.ativo ? (
                  <span className="text-[11px] text-muted-foreground">desligado</span>
                ) : null}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setSel("novo")}
              className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted"
            >
              <Plus className="size-4" />
              Novo sistema
            </button>
          </li>
        </ul>
        <p className="px-1 text-xs text-muted-foreground">
          Só os sistemas <b>ligados</b> entram no que a Sophia sabe. Textos pré-preenchidos com as
          páginas do site imobsystems.com.br.
        </p>
      </div>
      <EditorSistema
        key={sel}
        inicial={atual}
        apps={painel.apps}
        aoSalvar={async (id) => {
          await aoMudar();
          setSel(id);
        }}
        aoExcluir={async () => {
          await aoMudar();
          setSel(painel.sistemas.find((s) => s.id !== sel)?.id ?? "novo");
        }}
      />
    </div>
  );
}

function EditorSistema({
  inicial,
  apps,
  aoSalvar,
  aoExcluir,
}: {
  inicial: Partial<AtendSistema>;
  apps: AtendPainel["apps"];
  aoSalvar: (id: string) => Promise<void>;
  aoExcluir: () => Promise<void>;
}) {
  const [s, setS] = useState<Partial<AtendSistema>>(inicial);
  const up = (p: Partial<AtendSistema>) => setS((x) => ({ ...x, ...p }));
  const salvar = useMutation({
    mutationFn: () => api.atendSistemaSalvar(s),
    onSuccess: async (id) => {
      toast.success("Sistema salvo.");
      await aoSalvar(id);
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const excluir = useMutation({
    mutationFn: () => api.atendSistemaExcluir(s.id!),
    onSuccess: async () => {
      toast.success("Sistema excluído da Base.");
      await aoExcluir();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const funcs = s.funcionalidades ?? [];
  const setFunc = (i: number, p: Partial<AtendSistema["funcionalidades"][number]>) =>
    up({ funcionalidades: funcs.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const nome = s.nome?.trim() || "Novo sistema";

  return (
    <Cartao
      icone="fluent-color:apps-24"
      titulo={nome}
      extra={
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!!s.ativo}
            onCheckedChange={(v) => up({ ativo: v })}
            aria-label="Ligado no robô"
          />
          Ligado no robô
        </label>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Campo id="s-nome" rotulo="Nome">
            <Input
              id="s-nome"
              value={s.nome ?? ""}
              onChange={(e) => up({ nome: e.target.value })}
            />
          </Campo>
          <Campo id="s-seg" rotulo="Segmento">
            <Input
              id="s-seg"
              value={s.segmento ?? ""}
              onChange={(e) => up({ segmento: e.target.value })}
            />
          </Campo>
          <Campo
            id="s-menu"
            rotulo="Nome no menu do robô"
            dica="Até 24 letras, aparece no botão do WhatsApp."
          >
            <Input
              id="s-menu"
              maxLength={24}
              value={s.menu_nome ?? ""}
              onChange={(e) => up({ menu_nome: e.target.value.toUpperCase() })}
            />
          </Campo>
          <Campo
            id="s-app"
            rotulo="Sistema do cadastro"
            dica="Liga ao cadastro de Sistemas: o interesse do lead e o funil usam este código."
          >
            <select
              id="s-app"
              className={SELECT}
              value={s.app ?? ""}
              onChange={(e) => up({ app: e.target.value || null })}
            >
              <option value="">Sem vínculo</option>
              {apps.map((a) => (
                <option key={a.app} value={a.app}>
                  {a.nome} ({a.app})
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="s-pag" rotulo="Página no site">
            <Input
              id="s-pag"
              placeholder="https://www.imobsystems.com.br/produtos/…"
              value={s.pagina_url ?? ""}
              onChange={(e) => up({ pagina_url: e.target.value })}
            />
          </Campo>
          <Campo
            id="s-mat"
            rotulo="Material (link do PDF)"
            dica="Opcional. Sem ele, a Sophia manda a página do site."
          >
            <Input
              id="s-mat"
              placeholder="https://…"
              value={s.material_url ?? ""}
              onChange={(e) => up({ material_url: e.target.value })}
            />
          </Campo>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <Campo id="s-apr" rotulo="Texto de apresentação (a Sophia usa para explicar o sistema)">
              <Textarea
                id="s-apr"
                rows={4}
                value={s.apresentacao ?? ""}
                onChange={(e) => up({ apresentacao: e.target.value })}
              />
            </Campo>
            <Campo id="s-txm" rotulo="Texto que acompanha a página ou o material">
              <Textarea
                id="s-txm"
                rows={2}
                value={s.texto_material ?? ""}
                onChange={(e) => up({ texto_material: e.target.value })}
              />
            </Campo>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo id="s-pq" rotulo="Para quem é">
                <Textarea
                  id="s-pq"
                  rows={2}
                  value={s.para_quem ?? ""}
                  onChange={(e) => up({ para_quem: e.target.value })}
                />
              </Campo>
              <Campo
                id="s-npq"
                rotulo="Para quem não é"
                dica="Ajuda a Sophia a indicar outro sistema."
              >
                <Textarea
                  id="s-npq"
                  rows={2}
                  value={s.nao_para_quem ?? ""}
                  onChange={(e) => up({ nao_para_quem: e.target.value })}
                />
              </Campo>
            </div>
          </div>
          <div>
            <Label>Prévia no WhatsApp</Label>
            <Whats className="mt-1">
              <BolhaWhats
                autor="robo"
                nome="Sophia · WSA Sistemas IA"
                texto={s.apresentacao?.trim() || "Sem texto de apresentação."}
                botoes={["Ver a página", "Agendar demonstração", "Falar com um consultor"]}
              />
            </Whats>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Funcionalidades ({funcs.length})</Label>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() =>
                up({
                  funcionalidades: [...funcs, { titulo: "", descricao: "", status: "disponivel" }],
                })
              }
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            "Em validação" = ainda não pode ser anunciada como pronta; a Sophia avisa que está em
            validação.
          </p>
          <ul className="mt-2 space-y-2">
            {funcs.map((f, i) => (
              <li
                key={i}
                className="grid gap-2 rounded-lg border border-border p-2 md:grid-cols-[200px_1fr_150px_auto]"
              >
                <Input
                  aria-label="Funcionalidade"
                  placeholder="Título"
                  value={f.titulo}
                  onChange={(e) => setFunc(i, { titulo: e.target.value })}
                />
                <Input
                  aria-label="Descrição"
                  placeholder="Descrição"
                  value={f.descricao}
                  onChange={(e) => setFunc(i, { descricao: e.target.value })}
                />
                <select
                  aria-label="Situação"
                  className={SELECT}
                  value={f.status}
                  onChange={(e) =>
                    setFunc(i, { status: e.target.value as "disponivel" | "em_validacao" })
                  }
                >
                  <option value="disponivel">Disponível</option>
                  <option value="em_validacao">Em validação</option>
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover"
                  onClick={() => up({ funcionalidades: funcs.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
          {s.id ? (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={excluir.isPending}
              onClick={() => {
                if (window.confirm(`Excluir ${nome} da Base de conhecimento?`)) excluir.mutate();
              }}
            >
              Excluir da Base
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={salvar.isPending || !s.nome?.trim()} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar sistema"}
          </Button>
        </div>
      </div>
    </Cartao>
  );
}

function BaseRespostas({ painel, aoMudar }: { painel: AtendPainel; aoMudar: () => Promise<void> }) {
  const [nova, setNova] = useState(false);
  return (
    <div className="space-y-3">
      <Aviso tom="info">
        Quando a pergunta do lead tem o mesmo sentido de uma destas, a Sophia manda a resposta{" "}
        <b>palavra por palavra</b>. Pergunta de preço também passa a conversa para um consultor.
      </Aviso>
      {painel.respostas.map((r) => (
        <EditorResposta key={r.id} inicial={r} aoMudar={aoMudar} />
      ))}
      {nova ? (
        <EditorResposta
          inicial={{ categoria: "geral", pergunta: "", resposta: "", ativo: true }}
          aoMudar={async () => {
            setNova(false);
            await aoMudar();
          }}
        />
      ) : (
        <Button variant="outline" className="gap-1" onClick={() => setNova(true)}>
          <Plus className="size-4" />
          Nova resposta pronta
        </Button>
      )}
    </div>
  );
}

function EditorResposta({
  inicial,
  aoMudar,
}: {
  inicial: Partial<AtendResposta>;
  aoMudar: () => Promise<void>;
}) {
  const [r, setR] = useState(inicial);
  const mudou = JSON.stringify(r) !== JSON.stringify(inicial);
  const salvar = useMutation({
    mutationFn: () => api.atendRespostaSalvar(r),
    onSuccess: async () => {
      toast.success("Resposta salva.");
      await aoMudar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const excluir = useMutation({
    mutationFn: () => api.atendRespostaExcluir(r.id!),
    onSuccess: async () => {
      toast.success("Resposta excluída.");
      await aoMudar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-border bg-card p-3 text-sm",
        !r.ativo && "opacity-60",
      )}
    >
      <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
        <select
          aria-label="Categoria"
          className={SELECT}
          value={r.categoria}
          onChange={(e) => setR({ ...r, categoria: e.target.value as AtendResposta["categoria"] })}
        >
          {Object.entries(CATEGORIAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input
          aria-label="Pergunta"
          placeholder="Pergunta do lead"
          value={r.pergunta ?? ""}
          onChange={(e) => setR({ ...r, pergunta: e.target.value })}
        />
        <label className="flex items-center gap-2 whitespace-nowrap">
          <Switch
            checked={!!r.ativo}
            onCheckedChange={(v) => setR({ ...r, ativo: v })}
            aria-label="Ativa"
          />
          Ativa
        </label>
      </div>
      <Textarea
        aria-label="Resposta"
        rows={2}
        placeholder="Resposta enviada exatamente assim"
        value={r.resposta ?? ""}
        onChange={(e) => setR({ ...r, resposta: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        {r.id ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={excluir.isPending}
            onClick={() => {
              if (window.confirm("Excluir esta resposta pronta?")) excluir.mutate();
            }}
          >
            Excluir
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={
            (!mudou && !!r.id) || salvar.isPending || !r.pergunta?.trim() || !r.resposta?.trim()
          }
          onClick={() => salvar.mutate()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

// Prompt do atendimento ----------------------------------------------------------------------------------
function AbaPrompt({ cfg, set }: { cfg: AtendConfig; set: (p: Partial<AtendConfig>) => void }) {
  const passo = (i: number, p: Partial<AtendConfig["roteiro"][number]>) =>
    set({ roteiro: cfg.roteiro.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const mover = (i: number, d: -1 | 1) => {
    const r = [...cfg.roteiro];
    const j = i + d;
    if (j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]];
    set({ roteiro: r });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao icone="fluent-color:people-24" titulo="Identidade">
        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="p-nome" rotulo="Nome da atendente">
              <Input
                id="p-nome"
                value={cfg.agente_nome}
                onChange={(e) => set({ agente_nome: e.target.value })}
              />
            </Campo>
            <Campo id="p-emp" rotulo="Empresa">
              <Input
                id="p-emp"
                value={cfg.empresa_nome}
                onChange={(e) => set({ empresa_nome: e.target.value })}
              />
            </Campo>
            <Campo id="p-tom" rotulo="Tom">
              <select
                id="p-tom"
                className={SELECT}
                value={cfg.tom}
                onChange={(e) => set({ tom: e.target.value as AtendConfig["tom"] })}
              >
                <option value="consultivo">Consultivo e próximo</option>
                <option value="formal">Formal</option>
                <option value="descontraido">Descontraído</option>
              </select>
            </Campo>
            <Campo id="p-emo" rotulo="Emojis">
              <select
                id="p-emo"
                className={SELECT}
                value={cfg.emojis}
                onChange={(e) => set({ emojis: e.target.value as AtendConfig["emojis"] })}
              >
                <option value="poucos">Poucos</option>
                <option value="nenhum">Nenhum</option>
              </select>
            </Campo>
          </div>
          <Campo id="p-obj" rotulo="Objetivo principal">
            <Textarea
              id="p-obj"
              rows={3}
              value={cfg.objetivo}
              onChange={(e) => set({ objetivo: e.target.value })}
            />
          </Campo>
        </div>
      </Cartao>

      <Cartao
        icone="fluent-color:text-bullet-list-square-24"
        titulo="Roteiro da conversa"
        extra={<span className="text-xs text-muted-foreground">a Sophia segue esta ordem</span>}
      >
        <ol className="space-y-2 text-sm">
          {cfg.roteiro.map((p, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <Input
                  aria-label={`Passo ${i + 1}`}
                  value={p.titulo}
                  onChange={(e) => passo(i, { titulo: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Descer"
                  disabled={i === cfg.roteiro.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover"
                  onClick={() => set({ roteiro: cfg.roteiro.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Textarea
                aria-label={`Como conduzir o passo ${i + 1}`}
                rows={2}
                value={p.descricao}
                onChange={(e) => passo(i, { descricao: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={p.obrigatorio}
                  onCheckedChange={(v) => passo(i, { obrigatorio: v })}
                  aria-label="Obrigatório"
                />
                {p.obrigatorio ? "Obrigatório" : "Opcional"}
              </label>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 gap-1"
          onClick={() =>
            set({
              roteiro: [
                ...cfg.roteiro,
                { titulo: "Novo passo", descricao: "", obrigatorio: false },
              ],
            })
          }
        >
          <Plus className="size-3.5" />
          Adicionar passo
        </Button>
      </Cartao>

      <Cartao icone="fluent-color:people-list-24" titulo="Passar para um consultor quando">
        <div className="space-y-2.5 text-sm">
          {PASSAR.map(([k, r]) => (
            <label key={k} className="flex items-center justify-between gap-3">
              <span>{r}</span>
              <Switch
                checked={cfg.passar_consultor[k]}
                aria-label={r}
                onCheckedChange={(v) =>
                  set({ passar_consultor: { ...cfg.passar_consultor, [k]: v } })
                }
              />
            </label>
          ))}
        </div>
      </Cartao>

      <Cartao icone="flat-color-icons:lock" titulo="Regras fixas e comportamento">
        <div className="space-y-3 text-sm">
          <ul className="space-y-1.5 text-muted-foreground">
            {REGRAS_FIXAS.map((r) => (
              <li key={r} className="flex gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
          <Campo
            id="p-extra"
            rotulo="Regras da equipe (opcional)"
            dica='Somam às fixas. Ex.: "Não fale de concorrentes."'
          >
            <Textarea
              id="p-extra"
              rows={2}
              value={cfg.regras_extras}
              onChange={(e) => set({ regras_extras: e.target.value })}
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id="p-tam" rotulo="Tamanho da resposta">
              <select
                id="p-tam"
                className={SELECT}
                value={cfg.tamanho_resposta}
                onChange={(e) =>
                  set({ tamanho_resposta: e.target.value as AtendConfig["tamanho_resposta"] })
                }
              >
                <option value="curta">Curta</option>
                <option value="media">Média</option>
              </select>
            </Campo>
            <Campo id="p-ret" rotulo="Retomar sem resposta">
              <select
                id="p-ret"
                className={SELECT}
                value={cfg.retomar_horas}
                onChange={(e) => set({ retomar_horas: Number(e.target.value) })}
              >
                <option value={4}>1 lembrete em 4 h</option>
                <option value={24}>1 lembrete em 24 h</option>
                <option value={0}>Nunca</option>
              </select>
            </Campo>
            <Campo id="p-cri" rotulo="Criatividade">
              <Input id="p-cri" value="0,3 · fixa" disabled />
            </Campo>
          </div>
        </div>
      </Cartao>
    </div>
  );
}

// Fila e horários -------------------------------------------------------------------------------------------
function AbaFila({
  cfg,
  set,
  painel,
  aoMudar,
}: {
  cfg: AtendConfig;
  set: (p: Partial<AtendConfig>) => void;
  painel: AtendPainel;
  aoMudar: () => Promise<void>;
}) {
  const [lista, setLista] = useState(painel.consultores);
  useEffect(() => setLista(painel.consultores), [painel.consultores]);
  const mudou = JSON.stringify(lista) !== JSON.stringify(painel.consultores);
  const salvar = useMutation({
    mutationFn: () =>
      api.atendConsultoresSalvar(
        lista
          .filter((c) => c.na_fila)
          .map((c) => ({ vendedor_id: c.vendedor_id, apps: c.apps, apto: c.apto })),
      ),
    onSuccess: async () => {
      toast.success("Fila de consultores salva.");
      await aoMudar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const up = (id: string, p: Partial<(typeof lista)[number]>) =>
    setLista((l) => l.map((c) => (c.vendedor_id === id ? { ...c, ...p } : c)));
  const mover = (i: number, d: -1 | 1) =>
    setLista((l) => {
      const r = [...l];
      const j = i + d;
      if (j < 0 || j >= r.length) return l;
      [r[i], r[j]] = [r[j], r[i]];
      return r;
    });
  const appsBase = painel.sistemas
    .filter((s) => s.app)
    .map((s) => [s.app!, s.nome.split(" (")[0]] as [string, string]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao icone="fluent-color:people-24" titulo="Consultores (rodízio)" semPadding>
        {lista.length === 0 ? (
          <Vazio
            icone="fluent-color:people-24"
            titulo="Nenhum vendedor cadastrado"
            texto="Cadastre vendedores no Funil de Vendas."
          />
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((c, i) => (
              <li
                key={c.vendedor_id}
                className={cn("space-y-2 px-4 py-3 text-sm", !c.na_fila && "opacity-60")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1">{c.nome}</b>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={c.na_fila}
                      onCheckedChange={(v) =>
                        up(c.vendedor_id, { na_fila: v, apto: v ? true : c.apto })
                      }
                      aria-label="Na fila"
                    />
                    Na fila
                  </label>
                  {c.na_fila ? (
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch
                        checked={c.apto}
                        onCheckedChange={(v) => up(c.vendedor_id, { apto: v })}
                        aria-label="Apto agora"
                      />
                      Apto
                    </label>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Descer"
                    disabled={i === lista.length - 1}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
                {c.na_fila ? (
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Sistemas que atende ({c.apps.length ? "só os marcados" : "todos"}):
                    </span>
                    <div className="mt-1">
                      <Pilulas
                        opcoes={appsBase}
                        valor={c.apps}
                        onChange={(v) => up(c.vendedor_id, { apps: v })}
                      />
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
          <label className="flex items-center gap-2 text-sm">
            Consultor sem resposta em
            <Input
              aria-label="Minutos"
              type="number"
              min={1}
              max={240}
              className="w-20"
              value={cfg.consultor_espera_min}
              onChange={(e) => set({ consultor_espera_min: Number(e.target.value) })}
            />
            min → passa para o próximo
          </label>
          <Button disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar fila
          </Button>
        </div>
      </Cartao>

      <Cartao icone="fluent-color:clock-24" titulo="Horário dos consultores">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            A Sophia atende 24 h. Fora deste horário, ela avisa quando o consultor volta.
          </p>
          <EditorJanela
            prefixo="hc"
            valor={cfg.horario_consultores}
            onChange={(v) => set({ horario_consultores: v })}
          />
          <Campo id="f-fora" rotulo="Mensagem fora do horário dos consultores">
            <Textarea
              id="f-fora"
              rows={3}
              value={cfg.msg_fora_horario}
              onChange={(e) => set({ msg_fora_horario: e.target.value })}
            />
          </Campo>
        </div>
      </Cartao>
    </div>
  );
}

// Painel do robô --------------------------------------------------------------------------------------------
function AbaPainel() {
  const f = useQuery({ queryKey: ["atend-fila"], queryFn: api.atendFila });
  if (f.isLoading) return <Carregando />;
  if (f.error) return <Erro erro={f.error} />;
  const r = f.data!.resumo;
  const kpis: [string, number, string][] = [
    ["Vão receber a boas-vindas", r.na_fila, "pelas regras atuais"],
    ["Já receberam", r.conversas, "conversas abertas"],
    ["Ficam de fora", r.fora, "frio, etapa avançada, Ganho…"],
    ["Sem telefone", r.sem_telefone, "não têm WhatsApp no cadastro"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([t, v, d]) => (
          <div key={t} className="rounded-xl border border-border bg-card p-4">
            <span className="text-[12.5px] text-muted-foreground">{t}</span>
            <b className="block text-2xl tabular-nums">{v}</b>
            <span className="text-xs text-muted-foreground">{d}</span>
          </div>
        ))}
      </div>
      <Aviso tom="info">
        Respostas, demonstrações marcadas, quem foi ao consultor, onde a conversa parou e o sistema
        mais procurado entram aqui quando o WhatsApp estiver ligado (Fases 3 e 4).
      </Aviso>
    </div>
  );
}

// Simulador -------------------------------------------------------------------------------------------------
type Msg = { autor: "lead" | "robo"; texto: string; botoes?: string[] };

function AbaSimulador({
  painel,
  cfg,
  aoTestar,
}: {
  painel: AtendPainel;
  cfg: AtendConfig;
  aoTestar: () => Promise<void>;
}) {
  const fila = useQuery({ queryKey: ["atend-fila"], queryFn: api.atendFila });
  const testes = useMemo(() => {
    const base = [
      {
        id: "teste",
        nome: "Iris (teste)",
        empresa: "",
        temperatura: "morno" as Temperatura,
        pontuacao: 50,
        sistemas: ["imobimoveis", "suprimentos"],
      },
      {
        id: "quente",
        nome: "Carlos (teste)",
        empresa: "Construtora Alfa",
        temperatura: "quente" as Temperatura,
        pontuacao: 70,
        sistemas: ["suprimentos"],
      },
    ];
    const reais = (fila.data?.linhas ?? [])
      .filter((l) => l.temperatura && l.temperatura !== "frio")
      .slice(0, 15)
      .map((l) => ({
        id: l.negocio_id,
        nome: l.nome ?? "Lead",
        empresa: l.empresa ?? "",
        temperatura: l.temperatura!,
        pontuacao: l.pontuacao ?? 50,
        sistemas: l.sistemas,
      }));
    return [...base, ...reais];
  }, [fila.data]);
  const [leadId, setLeadId] = useState("teste");
  const lead = testes.find((t) => t.id === leadId) ?? testes[0];
  const [fora, setFora] = useState(false);
  const inicio = (): Msg[] => [
    {
      autor: "robo",
      texto: boasVindas(painel, cfg.bv_texto, lead.nome, lead.sistemas),
      botoes: cfg.bv_botoes.filter((b) => b.trim()),
    },
  ];
  const [msgs, setMsgs] = useState<Msg[]>(inicio);
  const [texto, setTexto] = useState("");
  const [ultima, setUltima] = useState<SimulacaoResposta | null>(null);
  const [nota, setNota] = useState(lead.pontuacao);
  const fim = useRef<HTMLDivElement>(null);

  const recomecar = () => {
    setMsgs(inicio());
    setUltima(null);
    setNota(lead.pontuacao);
    setTexto("");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(recomecar, [leadId]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  const enviar = useMutation({
    mutationFn: (historico: Msg[]) =>
      api.atendSimular({
        mensagens: historico.map((m) => ({ autor: m.autor, texto: m.texto })),
        lead: {
          nome: lead.nome,
          empresa: lead.empresa || undefined,
          temperatura: lead.temperatura,
          pontuacao: nota,
          sistemas: lead.sistemas,
        },
        fora_do_horario: fora,
      }),
    onSuccess: async (r) => {
      setMsgs((m) => [...m, { autor: "robo", texto: r.resposta, botoes: r.botoes }]);
      setUltima(r);
      setNota(r.acoes.temperatura);
      if (r.simulado && !cfg.simulado_em) {
        toast.success("Robô testado: já pode ser ligado.");
        await aoTestar();
      }
    },
    onError: (e) => {
      toast.error(mensagemErro(e));
      setMsgs((m) => m.slice(0, -1));
    },
  });
  const mandar = (t: string) => {
    if (!t.trim() || enviar.isPending) return;
    const h = [...msgs, { autor: "lead" as const, texto: t.trim() }];
    setMsgs(h);
    setTexto("");
    enviar.mutate(h);
  };
  const etapaNome = (k: string | null) =>
    k ? (painel.etapas.find((e) => e.chave === k)?.nome ?? k) : null;
  const a = ultima?.acoes;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Cartao
        icone="fluent-color:video-24"
        titulo="Simulador do robô"
        extra={
          <Button size="sm" variant="outline" className="gap-1" onClick={recomecar}>
            <RotateCcw className="size-3.5" />
            Recomeçar
          </Button>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Sem enviar nada a ninguém e sem gravar no Funil de Vendas. Usa a configuração salva.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="sim-lead" rotulo="Lead de teste">
              <select
                id="sim-lead"
                className={SELECT}
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                {testes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.temperatura} {t.pontuacao}
                  </option>
                ))}
              </select>
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2">
              <Switch checked={fora} onCheckedChange={setFora} aria-label="Fora do horário" />
              Simular fora do horário dos consultores
            </label>
          </div>
          <Whats className="max-h-[480px] min-h-[300px] overflow-y-auto">
            {msgs.map((m, i) => (
              <BolhaWhats
                key={i}
                autor={m.autor}
                nome={`${cfg.agente_nome} · simulação`}
                texto={m.texto}
                botoes={m.botoes}
                onBotao={i === msgs.length - 1 && m.autor === "robo" ? mandar : undefined}
              />
            ))}
            {enviar.isPending ? (
              <div className="w-fit rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
                {cfg.agente_nome} está digitando…
              </div>
            ) : null}
            <div ref={fim} />
          </Whats>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              mandar(texto);
            }}
          >
            <Input
              aria-label="Mensagem do lead"
              placeholder="Escreva como se fosse o lead"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Button type="submit" disabled={!texto.trim() || enviar.isPending} className="gap-1">
              <Send className="size-4" />
              Enviar
            </Button>
          </form>
        </div>
      </Cartao>

      <Cartao icone="flat-color-icons:rules" titulo="O que o robô faria">
        <div className="space-y-2.5 text-sm">
          {!a ? (
            <p className="text-muted-foreground">
              Responda a boas-vindas como se fosse o lead para ver as decisões da {cfg.agente_nome}.
            </p>
          ) : (
            <ul className="space-y-2">
              <li>
                📌 Regra usada: <b>{a.regra ?? "—"}</b>
              </li>
              {a.passo_roteiro ? (
                <li>
                  🧭 Passo do roteiro:{" "}
                  <b>
                    {a.passo_roteiro}. {cfg.roteiro[a.passo_roteiro - 1]?.titulo ?? ""}
                  </b>
                </li>
              ) : null}
              <li>
                🌡 Nota do lead: <b>{nota}</b>
              </li>
              {a.etapa ? (
                <li>
                  📋 Funil: <b>{etapaNome(a.etapa)}</b>
                </li>
              ) : null}
              {a.resposta_pronta ? (
                <li>
                  💬 Resposta pronta: <b>{a.resposta_pronta}</b>
                </li>
              ) : null}
              {a.sistema_indicado ? (
                <li>
                  🧩 Sistema indicado:{" "}
                  <b>
                    {painel.sistemas.find((s) => s.app === a.sistema_indicado)?.nome ??
                      a.sistema_indicado}
                  </b>
                  {a.enviar_pagina ? " · mandou a página" : ""}
                </li>
              ) : null}
              {a.oferecer_agenda ? <li>📅 Ofereceu o link de agendamento</li> : null}
              {a.passar_consultor ? (
                <li className="font-semibold text-warning-strong">
                  👤 Passa para um consultor: {a.motivo_consultor ?? "regra marcada"}
                </li>
              ) : null}
            </ul>
          )}
          <Aviso tom="info">
            {cfg.simulado_em
              ? "Robô já testado: pode ser ligado no topo da página."
              : "O robô só pode ser ligado depois de 1 simulação com pelo menos 2 respostas do lead."}
          </Aviso>
        </div>
      </Cartao>
    </div>
  );
}

// WhatsApp --------------------------------------------------------------------------------------------------
function AbaWhatsApp({ cfg, set }: { cfg: AtendConfig; set: (p: Partial<AtendConfig>) => void }) {
  const [palavra, setPalavra] = useState("");
  const [fone, setFone] = useState("");
  const qc = useQueryClient();
  const sessao = useQuery({ queryKey: ["atend-sessao"], queryFn: api.atendSessao });
  const info = useQuery({
    queryKey: ["atend-whats-info"],
    queryFn: api.atendWhatsInfo,
    refetchInterval: 30000,
  });
  const conectar = useMutation({
    mutationFn: api.atendConectarWebhook,
    onSuccess: async () => {
      toast.success("Webhook conectado: as respostas dos leads chegam na Sophia.");
      await qc.invalidateQueries({ queryKey: ["atend-whats-info"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const teste = useMutation({
    mutationFn: () => api.atendTeste(fone),
    onSuccess: () => toast.success("Mensagem de teste enviada. Confira no celular."),
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const s = sessao.data?.sessao;
  const pronta = s?.ok && s.status === "ready";
  const i = info.data;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao icone="flat-color-icons:phone" titulo="WhatsApp pelo OpeWA">
        <div className="space-y-3 text-sm">
          {sessao.isLoading ? (
            <Carregando />
          ) : sessao.data && !sessao.data.configurado ? (
            <Aviso>{sessao.data.erro}</Aviso>
          ) : (
            <ul className="space-y-1.5">
              <li className="flex flex-wrap items-center gap-2">
                Sessão <b>wsa-admin</b>:
                {pronta ? (
                  <Selo tom="ok">Conectada</Selo>
                ) : (
                  <Selo tom="err">{s?.status || "sem resposta"}</Selo>
                )}
                {s?.telefone ? <span className="text-muted-foreground">+{s.telefone}</span> : null}
              </li>
              {s?.erro ? <li className="text-destructive">{s.erro}</li> : null}
              <li className="flex flex-wrap items-center gap-2">
                Webhook (respostas dos leads):
                {i?.webhook_conectado ? (
                  <Selo tom="ok">Conectado</Selo>
                ) : (
                  <Selo tom="war">Não conectado</Selo>
                )}
              </li>
              {i ? (
                <li>
                  Boas-vindas hoje: <b>{i.enviadas_hoje}</b> de {i.limite_dia}
                  {i.falhas_hoje ? ` · ${i.falhas_hoje} não saíram` : ""} ·{" "}
                  {i.na_janela ? "dentro da janela de envio" : "fora da janela de envio"}
                </li>
              ) : null}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={conectar.isPending || !sessao.data?.configurado}
              onClick={() => conectar.mutate()}
            >
              {conectar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : i?.webhook_conectado ? (
                "Reconectar webhook"
              ) : (
                "Conectar webhook"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void sessao.refetch();
                void info.refetch();
              }}
            >
              Atualizar
            </Button>
          </div>
          <form
            className="flex gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              teste.mutate();
            }}
          >
            <Input
              aria-label="Telefone para teste"
              placeholder="Teste: 5521999999999"
              value={fone}
              onChange={(e) => setFone(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={teste.isPending || fone.replace(/\D/g, "").length < 12}
            >
              Enviar teste
            </Button>
          </form>
          <Aviso>
            O OpeWA usa o WhatsApp Web, não a API oficial. Mandar para quem nunca falou com o número
            pode bloqueá-lo: comece com até 30 boas-vindas por dia e mantenha o intervalo.
          </Aviso>
        </div>
      </Cartao>
      <Cartao icone="flat-color-icons:cancel" titulo="Saída do lead">
        <div className="space-y-3 text-sm">
          <p>
            Respeito à LGPD e às regras da Meta. Quem manda uma destas palavras sai da lista e é
            marcado em Leads &amp; Contatos como <b>"Não enviar WhatsApp"</b>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cfg.palavras_sair.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold"
              >
                {p}
                <button
                  type="button"
                  aria-label={`Remover ${p}`}
                  onClick={() => set({ palavras_sair: cfg.palavras_sair.filter((x) => x !== p) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const p = palavra.trim().toUpperCase();
              if (p && !cfg.palavras_sair.includes(p))
                set({ palavras_sair: [...cfg.palavras_sair, p] });
              setPalavra("");
            }}
          >
            <Input
              aria-label="Nova palavra"
              placeholder="Nova palavra"
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Adicionar
            </Button>
          </form>
        </div>
      </Cartao>
    </div>
  );
}
