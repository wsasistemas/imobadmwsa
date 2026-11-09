// Peças da Gestão Comercial (Fase 8): selo de temperatura, origem, ficha do lead (gaveta), novo contato,
// motivo da perda e regras de classificação.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Carregando, Chip, Erro, Selo } from "@/components/adm/ui";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, mensagemErro, type FichaNegocio, type RegrasQualificacao, type Temperatura } from "@/lib/adm/api";
import { brl, dataHora, ha, ORIGEM, pergunta, telefone, TEMPERATURA } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const ETAPAS = [
  { chave: "novo_lead", nome: "Novo lead" }, { chave: "qualificacao", nome: "Qualificação" },
  { chave: "reuniao_agendada", nome: "Reunião agendada" }, { chave: "demonstracao", nome: "Demonstração feita" },
  { chave: "proposta", nome: "Proposta enviada" }, { chave: "negociacao", nome: "Negociação" },
  { chave: "ganho", nome: "Ganho" }, { chave: "perdido", nome: "Perdido" },
];

/** Recarrega tudo o que mostra leads e funil. */
export function useRecarregarComercial() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => ["leads", "leads-resumo", "funil", "negocio", "regras"].includes(String(q.queryKey[0])) });
}

export function SeloTemperatura({ t, pontos, compacto }: { t: Temperatura | null; pontos?: number | null; compacto?: boolean }) {
  if (!t) return <Selo tom="neu">sem classificação</Selo>;
  const x = TEMPERATURA[t];
  return (
    <Selo tom={x.tom}>
      <IconeColorido nome={x.icone} tamanho={13} />
      <span className="ml-1">{x.rotulo}{!compacto && pontos != null ? ` · ${pontos}` : ""}</span>
    </Selo>
  );
}

export function Origem({ origem, detalhe }: { origem: string; detalhe?: string | null }) {
  const o = ORIGEM[origem] ?? { rotulo: origem, icone: "fluent-color:globe-24" as const };
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px]">
      <IconeColorido nome={o.icone} tamanho={16} />
      <span className="truncate">{o.rotulo}{detalhe ? <span className="text-muted-foreground"> · {detalhe}</span> : null}</span>
    </span>
  );
}

const linkWhats = (w: string) => `https://wa.me/${w.replace(/\D/g, "")}`;

// ------------------------------------------------------------------ Motivo da perda
export function PerderNegocio({ negocioId, aberto, setAberto, onFeito }: {
  negocioId: string | null; aberto: boolean; setAberto: (v: boolean) => void; onFeito?: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const recarregar = useRecarregarComercial();
  useEffect(() => { if (aberto) setMotivo(""); }, [aberto]);
  const m = useMutation({
    mutationFn: () => api.moverEtapa(negocioId!, "perdido", motivo),
    onSuccess: () => { toast.success("Negócio marcado como perdido."); recarregar(); setAberto(false); onFeito?.(); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const MOTIVOS = ["Preço", "Escolheu outro sistema", "Sem resposta", "Sem orçamento agora", "Não era o público", "Contato inválido"];
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Por que foi perdido?</DialogTitle>
          <DialogDescription>O motivo é obrigatório e aparece nos Relatórios Comerciais.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((x) => (
              <button key={x} type="button" onClick={() => setMotivo(x)}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold", motivo === x ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                {x}
              </button>
            ))}
          </div>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo…" required />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={m.isPending || !motivo.trim()} className="min-w-32">
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Marcar como perdido"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Ganho → cliente (empresa + vínculos + Asaas)
interface LinhaSistema { app: string; ref: string; plano: string; valor_mensal: string }

export function GanharNegocio({ negocio, aberto, setAberto }: {
  negocio: { negocio_id: string; nome: string; empresa: string | null; email: string | null; whatsapp: string | null; sistemas: string[] } | null;
  aberto: boolean; setAberto: (v: boolean) => void;
}) {
  const recarregar = useRecarregarComercial();
  const qc = useQueryClient();
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas, enabled: aberto });
  const [f, setF] = useState({ razao_social: "", cnpj: "", dia_vencimento: "10", email_financeiro: "" });
  const [linhas, setLinhas] = useState<LinhaSistema[]>([]);
  const [asaas, setAsaas] = useState(true);
  const [resultado, setResultado] = useState<{ empresa_id: string; texto: string } | null>(null);

  useEffect(() => {
    if (aberto && negocio) {
      setF({ razao_social: negocio.empresa ?? "", cnpj: "", dia_vencimento: "10", email_financeiro: negocio.email ?? "" });
      setLinhas((negocio.sistemas.length ? negocio.sistemas : [""]).map((app) => ({ app, ref: "", plano: "", valor_mensal: "" })));
      setResultado(null);
    }
  }, [aberto, negocio]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setLinha = (i: number, k: keyof LinhaSistema, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const tipo = (app: string) => sistemas.data?.find((s) => s.app === app);

  const m = useMutation({
    mutationFn: async () => {
      const r = await api.ganhar(negocio!.negocio_id, {
        ...f, whatsapp: negocio!.whatsapp ?? "",
        sistemas: linhas.filter((l) => l.app).map((l) => ({ ...l, valor_mensal: l.valor_mensal.replace(/\./g, "").replace(",", ".") })),
      });
      let asaasTexto = "";
      if (asaas && r.vinculos > 0 && r.tem_cnpj && Number(r.mensalidade) > 0) {
        try { await api.sincronizarAsaas(r.empresa_id); asaasTexto = " Assinatura criada no Asaas."; }
        catch (e) { asaasTexto = ` A assinatura no Asaas falhou: ${mensagemErro(e)} Tente de novo na ficha da empresa.`; }
      } else if (asaas) {
        asaasTexto = " Assinatura do Asaas não criada: precisa de CNPJ e de pelo menos um sistema vinculado com valor.";
      }
      const pend = r.pendentes.length ? ` Falta vincular: ${r.pendentes.join(", ")} (informe o schema/tenant na ficha da empresa).` : "";
      return { empresa_id: r.empresa_id, texto: `Cliente criado com ${r.vinculos} sistema(s) vinculado(s).${pend}${asaasTexto}` };
    },
    onSuccess: (r) => {
      setResultado(r);
      recarregar();
      qc.invalidateQueries({ predicate: (q) => ["empresas", "empresa", "painel"].includes(String(q.queryKey[0])) });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Fechar negócio: {negocio?.nome}</DialogTitle>
          <DialogDescription>Ganho vira cliente: cria a empresa, vincula os sistemas e, se quiser, já cria a assinatura mensal no Asaas.</DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm">
              <IconeColorido nome="fluent-color:trophy-24" tamanho={24} />
              <p>{resultado.texto}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
              <Button asChild><Link to="/empresas/$id" params={{ id: resultado.empresa_id }}>Abrir a empresa</Link></Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Razão social</Label><Input value={f.razao_social} onChange={set("razao_social")} placeholder="Como vai na nota e no boleto" /></div>
              <div className="space-y-1.5"><Label>CPF ou CNPJ</Label><Input value={f.cnpj} onChange={set("cnpj")} inputMode="numeric" placeholder="Obrigatório para o Asaas" /></div>
              <div className="space-y-1.5"><Label>Dia do vencimento</Label>
                <select className={SELECT} value={f.dia_vencimento} onChange={set("dia_vencimento")}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
                </select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>E-mail financeiro</Label><Input type="email" value={f.email_financeiro} onChange={set("email_financeiro")} /></div>
            </div>

            <div className="space-y-2">
              <Label>Sistemas contratados</Label>
              {linhas.map((l, i) => {
                const s = tipo(l.app);
                return (
                  <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.1fr_1.2fr_1fr_0.8fr_auto]">
                    <select className={SELECT} value={l.app} onChange={(e) => setLinha(i, "app", e.target.value)}>
                      <option value="">Sistema…</option>
                      {(sistemas.data ?? []).map((x) => <option key={x.app} value={x.app}>{x.app}</option>)}
                    </select>
                    <Input value={l.ref} onChange={(e) => setLinha(i, "ref", e.target.value)}
                      placeholder={s?.tipo_ref === "schema" ? "schema (ex.: loja_nome)" : "tenant / id do cliente"}
                      title={s?.descricao_ref ?? "Deixe em branco se o cliente ainda não foi criado no sistema"} />
                    <Input value={l.plano} onChange={(e) => setLinha(i, "plano", e.target.value)} placeholder="Plano" />
                    <Input value={l.valor_mensal} onChange={(e) => setLinha(i, "valor_mensal", e.target.value)} inputMode="decimal" placeholder="R$ / mês" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover">×</Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, { app: "", ref: "", plano: "", valor_mensal: "" }])}>+ Sistema</Button>
              <p className="text-xs text-muted-foreground">Sem o schema/tenant o sistema fica para vincular depois, na ficha da empresa (o cliente ainda pode não existir no sistema).</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={asaas} onCheckedChange={setAsaas} /> Criar a assinatura mensal no Asaas agora
            </label>
            <DialogFooter>
              <Button type="submit" disabled={m.isPending} className="min-w-40 bg-success text-success-foreground hover:bg-success/90">
                {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Marcar como Ganho"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Importar CSV
const CABECALHOS: Record<string, string> = {
  nome: "nome", name: "nome", "nome completo": "nome", email: "email", "e-mail": "email",
  telefone: "telefone", whatsapp: "telefone", celular: "telefone", phone: "telefone", fone: "telefone",
  empresa: "empresa", company: "empresa", cargo: "cargo", mensagem: "mensagem", observacao: "mensagem", observações: "mensagem",
  sistema: "sistema", interesse: "sistema",
};

/** CSV simples (vírgula ou ponto e vírgula, aspas opcionais) → linhas com as colunas reconhecidas. */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const partir = (l: string) => {
    const out: string[] = []; let atual = ""; let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(atual); atual = ""; }
      else atual += ch;
    }
    out.push(atual);
    return out.map((x) => x.trim());
  };
  const cab = partir(linhas[0]).map((h) => CABECALHOS[h.toLowerCase()] ?? "");
  return linhas.slice(1).map((l) => {
    const v = partir(l);
    const o: Record<string, string> = {};
    cab.forEach((k, i) => { if (k && v[i]) o[k] = o[k] ? `${o[k]} ${v[i]}` : v[i]; });
    return o;
  }).filter((o) => Object.keys(o).length > 0);
}

export function ImportarCsv({ gatilho }: { gatilho: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [arquivo, setArquivo] = useState("");
  const recarregar = useRecarregarComercial();
  const m = useMutation({
    mutationFn: () => api.importarLeads(linhas),
    onSuccess: (r) => {
      toast.success(`Importado: ${r.novos} novo(s), ${r.repetidos} repetido(s)${r.erros.length ? `, ${r.erros.length} com erro` : ""}.`);
      if (r.erros.length) toast.message(`Linhas com erro: ${r.erros.slice(0, 8).map((e) => `${e.linha + 1} (${e.erro})`).join("; ")}`);
      recarregar(); setAberto(false); setLinhas([]); setArquivo("");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <>
      <span onClick={() => setAberto(true)}>{gatilho}</span>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Importar contatos (CSV)</DialogTitle>
            <DialogDescription>
              Colunas reconhecidas: nome, email, telefone (ou whatsapp), empresa, cargo, mensagem, sistema. Separador vírgula ou ponto e vírgula.
              Entram como "Importado", sem mensagem de boas-vindas, classificados e sem duplicar (mesmo WhatsApp ou e-mail).
            </DialogDescription>
          </DialogHeader>
          <Input type="file" accept=".csv,text/csv" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setArquivo(file.name);
            setLinhas(lerCsv(await file.text()));
          }} />
          {arquivo ? (
            linhas.length === 0 ? <p className="text-sm text-destructive">Nenhuma linha reconhecida. Confira o cabeçalho (nome, email, telefone…).</p> : (
              <div className="space-y-2">
                <p className="text-sm"><b>{linhas.length}</b> linha(s) prontas para importar. Prévia:</p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border text-left text-muted-foreground">{["nome", "email", "telefone", "empresa", "cargo"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
                    <tbody>{linhas.slice(0, 5).map((l, i) => (
                      <tr key={i} className="border-b border-border last:border-0">{["nome", "email", "telefone", "empresa", "cargo"].map((h) => <td key={h} className="px-2 py-1.5">{l[h] ?? ""}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )
          ) : null}
          <DialogFooter>
            <Button disabled={!linhas.length || m.isPending} onClick={() => m.mutate()} className="min-w-32">
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : `Importar ${linhas.length || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ Novo contato (cadastro manual)
export function NovoContato({ gatilho }: { gatilho: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ nome: "", telefone: "", email: "", empresa: "", cargo: "", mensagem: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const recarregar = useRecarregarComercial();
  const m = useMutation({
    mutationFn: () => api.novoContato(Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim())) as Record<string, string>),
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível cadastrar."); return; }
      toast.success(r.repetido ? "Já existia: virou uma anotação no negócio aberto." : "Contato cadastrado e classificado.");
      recarregar(); setAberto(false); setF({ nome: "", telefone: "", email: "", empresa: "", cargo: "", mensagem: "" });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <>
      <span onClick={() => setAberto(true)}>{gatilho}</span>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Novo contato</DialogTitle>
            <DialogDescription>Entra no funil em "Novo lead" e é classificado pelas mesmas regras dos formulários. Não manda boas-vindas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5"><Label>Nome *</Label><Input value={f.nome} onChange={set("nome")} required /></div>
            <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={f.telefone} onChange={set("telefone")} inputMode="tel" placeholder="(11) 9 8765-4321" /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={f.email} onChange={set("email")} /></div>
            <div className="space-y-1.5"><Label>Empresa</Label><Input value={f.empresa} onChange={set("empresa")} /></div>
            <div className="space-y-1.5"><Label>Cargo</Label><Input value={f.cargo} onChange={set("cargo")} placeholder="Dono, gerente…" /></div>
            <div className="sm:col-span-2 space-y-1.5"><Label>O que precisa</Label><Textarea rows={2} value={f.mensagem} onChange={set("mensagem")} placeholder="Sistema de interesse, prazo…" /></div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">Informe pelo menos o WhatsApp ou o e-mail.</p>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={m.isPending} className="min-w-32">{m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Cadastrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ Ficha do lead (gaveta lateral)
const TEXTO_ATIVIDADE: Record<string, NomeIconeAtividade> = {
  nota: "fluent-color:text-bullet-list-square-24", etapa: "fluent-color:board-24", classificacao: "fluent-color:poll-24",
  lead_repetido: "fluent-color:person-add-24", sistema: "fluent-color:person-add-24", whatsapp: "fluent-color:chat-24",
  reuniao: "fluent-color:calendar-checkmark-24", ligacao: "flat-color-icons:phone", email: "fluent-color:send-24",
};
type NomeIconeAtividade = Parameters<typeof IconeColorido>[0]["nome"];

export function FichaLead({ negocioId, onFechar }: { negocioId: string | null; onFechar: () => void }) {
  const q = useQuery({ queryKey: ["negocio", negocioId], queryFn: () => api.negocio(negocioId!), enabled: !!negocioId });
  return (
    <Sheet open={!!negocioId} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : q.data ? <ConteudoFicha f={q.data} /> : (
          <SheetHeader><SheetTitle>Negócio não encontrado</SheetTitle></SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConteudoFicha({ f }: { f: FichaNegocio }) {
  const recarregar = useRecarregarComercial();
  const [perder, setPerder] = useState(false);
  const [ganhar, setGanhar] = useState(false);
  const [nota, setNota] = useState("");
  const [valor, setValor] = useState(f.valor != null ? String(f.valor) : "");
  useEffect(() => { setValor(f.valor != null ? String(f.valor) : ""); }, [f.negocio_id, f.valor]);

  const mover = useMutation({
    mutationFn: (etapa: string) => api.moverEtapa(f.negocio_id, etapa),
    onSuccess: (r) => {
      toast.success(r.empresa_id ? "Ganho! A empresa foi criada em Empresas." : "Etapa alterada.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const salvar = useMutation({
    mutationFn: (p: Parameters<typeof api.salvarNegocio>[1]) => api.salvarNegocio(f.negocio_id, p),
    onSuccess: () => { toast.success("Salvo."); recarregar(); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const anotar = useMutation({
    mutationFn: () => api.anotar(f.negocio_id, nota),
    onSuccess: () => { setNota(""); recarregar(); },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const c = f.classificacao ?? {};
  const atrasado = f.prazo_em && new Date(f.prazo_em).getTime() < Date.now();

  return (
    <div className="space-y-5 pb-6">
      <SheetHeader className="space-y-1 text-left">
        <SheetTitle className="font-display text-2xl">{f.nome}</SheetTitle>
        <SheetDescription>
          {[f.cargo, f.empresa].filter(Boolean).join(" · ") || "Empresa não informada"}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SeloTemperatura t={f.temperatura} pontos={f.pontuacao} />
          <Origem origem={f.origem} detalhe={f.campanha || f.formulario} />
          <span className="text-xs text-muted-foreground">entrou {ha(f.criado_em)}</span>
        </div>
      </SheetHeader>

      <div className="flex flex-wrap gap-2">
        {f.whatsapp ? (
          <Button asChild size="sm" className="gap-1.5 bg-success text-success-foreground hover:bg-success/90">
            <a href={linkWhats(f.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />{telefone(f.whatsapp)}</a>
          </Button>
        ) : null}
        {f.email ? <Button asChild size="sm" variant="outline"><a href={`mailto:${f.email}`}>{f.email}</a></Button> : null}
        {f.empresa_id ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/empresas/$id" params={{ id: f.empresa_id }}><ExternalLink className="size-4" />Abrir empresa</Link>
          </Button>
        ) : null}
      </div>

      {/* Próximo passo */}
      {f.proxima_acao && !["ganho", "perdido"].includes(f.etapa) ? (
        <div className={cn("rounded-xl border p-3 text-sm", atrasado ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary-soft")}>
          <b className="block">Próximo passo</b>
          {f.proxima_acao}
          {f.prazo_em ? <span className={cn("block text-xs", atrasado ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {atrasado ? "Prazo vencido em " : "Até "}{dataHora(f.prazo_em)}</span> : null}
        </div>
      ) : null}

      {/* Etapa, valor e sistemas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Etapa do funil</Label>
          <select className={SELECT} value={f.etapa} disabled={mover.isPending}
            onChange={(e) => (e.target.value === "perdido" ? setPerder(true) : e.target.value === "ganho" ? setGanhar(true) : mover.mutate(e.target.value))}>
            {ETAPAS.map((e) => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
          </select>
          {f.motivo_perda ? <p className="text-xs text-muted-foreground">Motivo: {f.motivo_perda}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Mensalidade prevista</Label>
          <div className="flex gap-2">
            <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
            <Button variant="outline" size="sm" className="h-9" disabled={salvar.isPending}
              onClick={() => salvar.mutate({ valor: valor ? Number(valor.replace(/\./g, "").replace(",", ".")) : null })}>Salvar</Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Temperatura</Label>
          <select className={SELECT} value={c.manual ? (f.temperatura ?? "") : ""} disabled={salvar.isPending}
            onChange={(e) => salvar.mutate({ temperatura: (e.target.value || null) as Temperatura | null })}>
            <option value="">Automática ({f.temperatura ? TEMPERATURA[f.temperatura].rotulo.toLowerCase() : "—"})</option>
            <option value="quente">Quente (definida à mão)</option>
            <option value="morno">Morno (definida à mão)</option>
            <option value="frio">Frio (definida à mão)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Sistemas de interesse</Label>
          <div className="flex min-h-9 flex-wrap items-center">{f.sistemas.length ? f.sistemas.map((s) => <Chip key={s} app={s} />) : <span className="text-xs text-muted-foreground">nenhum identificado</span>}</div>
        </div>
      </div>

      {/* Por que essa temperatura */}
      <section className="rounded-xl border border-border p-3">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><IconeColorido nome="fluent-color:poll-24" tamanho={18} />Por que {f.temperatura ? TEMPERATURA[f.temperatura].rotulo.toLowerCase() : "—"}?</h4>
        {c.manual ? <p className="text-sm text-muted-foreground">Temperatura definida à mão pela equipe. A classificação automática fica parada até voltar para "Automática".</p> : (
          <ul className="space-y-1 text-sm">
            {(c.motivos ?? []).map((m, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{m.motivo}</span>
                <b className={m.pontos < 0 ? "text-destructive" : "text-success"}>{m.pontos > 0 ? "+" : ""}{m.pontos}</b>
              </li>
            ))}
            {(c.motivos ?? []).length === 0 ? <li className="text-muted-foreground">Nenhum sinal encontrado nas respostas.</li> : null}
            <li className="flex justify-between border-t border-border pt-1 font-bold"><span>Total</span><span>{f.pontuacao ?? 0} de 100</span></li>
          </ul>
        )}
      </section>

      {/* Respostas do formulário */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><IconeColorido nome="fluent-color:text-bullet-list-square-24" tamanho={18} />Respostas do formulário</h4>
        {f.recebidos.length === 0 ? <p className="text-sm text-muted-foreground">Cadastro sem formulário.</p> : f.recebidos.map((r) => (
          <div key={r.id} className="mb-2 rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <Origem origem={r.origem} detalhe={r.fonte} /><span>{dataHora(r.recebido_em)}</span>
            </div>
            <dl className="divide-y divide-border text-sm">
              {Object.entries(r.respostas).filter(([k, v]) => v !== null && v !== "" && typeof v !== "object" && !["mensagem", "consentimento", "formulario", "origem"].includes(k)).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[40%_1fr] gap-2 px-3 py-1.5">
                  <dt className="text-muted-foreground">{pergunta(k)}</dt><dd className="break-words">{String(v)}</dd>
                </div>
              ))}
              {typeof r.respostas.mensagem === "string" && r.respostas.mensagem && !Object.keys(r.respostas).some((k) => r.respostas.mensagem === `${k}: ${r.respostas[k]}`) ? (
                <div className="px-3 py-1.5"><dt className="text-muted-foreground">Mensagem</dt><dd className="whitespace-pre-wrap">{String(r.respostas.mensagem)}</dd></div>
              ) : null}
            </dl>
          </div>
        ))}
      </section>

      {/* Histórico */}
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><IconeColorido nome="fluent-color:history-24" tamanho={18} />Histórico</h4>
        <form onSubmit={(e) => { e.preventDefault(); if (nota.trim()) anotar.mutate(); }} className="mb-3 flex gap-2">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotar: liguei, mandei proposta…" />
          <Button type="submit" disabled={anotar.isPending || !nota.trim()}>{anotar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Anotar"}</Button>
        </form>
        <ol className="space-y-2.5">
          {f.atividades.map((a) => (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <IconeColorido nome={TEXTO_ATIVIDADE[a.tipo] ?? "fluent-color:history-24"} tamanho={18} />
              <div className="min-w-0">
                <p className="break-words">{a.texto}</p>
                <span className="text-xs text-muted-foreground">{dataHora(a.criado_em)}{a.autor ? ` · ${a.autor}` : ""}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {f.valor ? <p className="text-xs text-muted-foreground">Mensalidade prevista: {brl(f.valor)}</p> : null}
      <PerderNegocio negocioId={f.negocio_id} aberto={perder} setAberto={setPerder} />
      <GanharNegocio negocio={f} aberto={ganhar} setAberto={setGanhar} />
    </div>
  );
}

// ------------------------------------------------------------------ Regras de classificação
const ROTULO_PONTOS: Record<keyof RegrasQualificacao["pontos"], string> = {
  whatsapp: "Informou WhatsApp válido", email_corporativo: "E-mail da empresa (não Gmail/Hotmail…)", empresa: "Informou a empresa",
  cargo_decisor: "Cargo de quem decide", sistema: "Sistema de interesse identificado", urgencia: "Tem pressa",
  intencao: "Quer comprar / pediu demonstração", pesquisando: "Só pesquisando (desconta)",
};
const LISTAS: { k: "cargos_decisores" | "palavras_urgencia" | "palavras_intencao" | "palavras_pesquisando" | "emails_pessoais"; rotulo: string }[] = [
  { k: "cargos_decisores", rotulo: "Cargos de quem decide" }, { k: "palavras_urgencia", rotulo: "Palavras de pressa" },
  { k: "palavras_intencao", rotulo: "Palavras de compra" }, { k: "palavras_pesquisando", rotulo: "Palavras de quem só pesquisa" },
  { k: "emails_pessoais", rotulo: "Domínios de e-mail pessoal" },
];
const lista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function RegrasClassificacao({ aberto, setAberto }: { aberto: boolean; setAberto: (v: boolean) => void }) {
  const q = useQuery({ queryKey: ["regras"], queryFn: api.regrasQualificacao, enabled: aberto });
  const [r, setR] = useState<RegrasQualificacao | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [teste, setTeste] = useState({ cargo: "", empresa: "", email: "", telefone: "", mensagem: "" });
  const recarregar = useRecarregarComercial();

  useEffect(() => {
    if (q.data && aberto) {
      setR(q.data);
      setTextos(Object.fromEntries([
        ...LISTAS.map((l) => [l.k, (q.data[l.k] ?? []).join(", ")]),
        ...Object.entries(q.data.sistemas ?? {}).map(([app, p]) => [`sis:${app}`, p.join(", ")]),
      ]));
    }
  }, [q.data, aberto]);

  const montar = (): RegrasQualificacao | null => r && ({
    ...r,
    ...Object.fromEntries(LISTAS.map((l) => [l.k, lista(textos[l.k] ?? "")])),
    sistemas: Object.fromEntries(Object.keys(r.sistemas).map((app) => [app, lista(textos[`sis:${app}`] ?? "")])),
  } as RegrasQualificacao);

  const salvar = useMutation({
    mutationFn: () => api.salvarRegrasQualificacao(montar()!),
    onSuccess: (n) => { toast.success(`Regras salvas. ${n} negócio(s) em aberto reclassificado(s).`); recarregar(); setAberto(false); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const previa = useMutation({
    mutationFn: () => api.previaClassificacao(Object.fromEntries(Object.entries(teste).filter(([, v]) => v.trim()))),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Regras de classificação</DialogTitle>
          <DialogDescription>
            Cada lead ganha pontos (0 a 100) pelas respostas do formulário. A soma define a temperatura. Ao salvar, os negócios em aberto são reclassificados (sem mudar de etapa).
          </DialogDescription>
        </DialogHeader>
        {q.isLoading || !r ? <Carregando /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Quente a partir de</Label>
                <Input type="number" min={1} max={100} value={r.limites.quente} onChange={(e) => setR({ ...r, limites: { ...r.limites, quente: Number(e.target.value) } })} /></div>
              <div className="space-y-1.5"><Label>Morno a partir de</Label>
                <Input type="number" min={0} max={99} value={r.limites.morno} onChange={(e) => setR({ ...r, limites: { ...r.limites, morno: Number(e.target.value) } })} /></div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={r.mover_quente} onCheckedChange={(v) => setR({ ...r, mover_quente: v })} />
                Quente vai sozinho para "Qualificação"
              </label>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold">Pontos por sinal</h4>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {(Object.keys(ROTULO_PONTOS) as (keyof RegrasQualificacao["pontos"])[]).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span>{ROTULO_PONTOS[k]}</span>
                    <Input type="number" className="h-8 w-20" value={r.pontos[k] ?? 0}
                      onChange={(e) => setR({ ...r, pontos: { ...r.pontos, [k]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold">Palavras procuradas nas respostas <span className="font-normal text-muted-foreground">(separe por vírgula; sem acento)</span></h4>
              {LISTAS.map((l) => (
                <div key={l.k} className="space-y-1"><Label className="text-xs">{l.rotulo}</Label>
                  <Textarea rows={2} value={textos[l.k] ?? ""} onChange={(e) => setTextos({ ...textos, [l.k]: e.target.value })} /></div>
              ))}
              <h4 className="pt-1 text-sm font-bold">Palavras que identificam cada sistema</h4>
              {Object.keys(r.sistemas).map((app) => (
                <div key={app} className="grid items-center gap-2 sm:grid-cols-[130px_1fr]"><Chip app={app} />
                  <Input value={textos[`sis:${app}`] ?? ""} onChange={(e) => setTextos({ ...textos, [`sis:${app}`]: e.target.value })} /></div>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-border p-3">
              <h4 className="mb-2 text-sm font-bold">Testar com um lead de exemplo</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Cargo" value={teste.cargo} onChange={(e) => setTeste({ ...teste, cargo: e.target.value })} />
                <Input placeholder="Empresa" value={teste.empresa} onChange={(e) => setTeste({ ...teste, empresa: e.target.value })} />
                <Input placeholder="E-mail" value={teste.email} onChange={(e) => setTeste({ ...teste, email: e.target.value })} />
                <Input placeholder="WhatsApp" value={teste.telefone} onChange={(e) => setTeste({ ...teste, telefone: e.target.value })} />
                <Textarea className="sm:col-span-2" rows={2} placeholder="Respostas / mensagem (ex.: prazo: imediatamente; sistema: CRM imobiliário)"
                  value={teste.mensagem} onChange={(e) => setTeste({ ...teste, mensagem: e.target.value })} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => previa.mutate()} disabled={previa.isPending}>Classificar exemplo</Button>
                {previa.data ? <span className="flex items-center gap-2 text-sm"><SeloTemperatura t={previa.data.temperatura} pontos={previa.data.pontos} />
                  <span className="text-muted-foreground">{previa.data.motivos.map((m) => m.motivo).join(" · ") || "nenhum sinal"}</span></span> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">O teste usa as regras já salvas.</p>
            </div>

            <DialogFooter>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="min-w-40">
                {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar e reclassificar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
