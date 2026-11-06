import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Carregando, Cartao, Erro, Pagina, Selo, Tabela, Vazio } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, mensagemErro, type Fonte } from "@/lib/adm/api";
import { ADM_SUPABASE_URL } from "@/lib/adm/supabase";
import { dataHora, telefone } from "@/lib/adm/formato";
import { cn } from "@/lib/utils";

// Fonte de leads › Landing pages e sites (mesmo layout de Permissões: fontes à esquerda, detalhe à direita).
export const Route = createFileRoute("/_authenticated/fontes/landing")({
  head: () => ({ meta: [{ title: "Landing pages e sites — ImobAdm WSA" }] }),
  component: Landing,
});

const URL_ENTRADA = `${ADM_SUPABASE_URL}/functions/v1/leads-entrada`;

function codigoSite(chave: string) {
  return `<script>
// Envio do formulário para o funil da WSA (ImobAdm). Troque os nomes dos campos se forem outros.
document.getElementById('lead-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const f = this;
  const r = await fetch('${URL_ENTRADA}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-wsa-chave': '${chave}' },
    body: JSON.stringify({
      id_envio: crypto.randomUUID(),           // evita duplicar se clicar duas vezes
      nome: f.nome.value, email: f.email.value, telefone: f.telefone.value,
      empresa: f.empresa ? f.empresa.value : undefined,
      sistema: f.sistema ? f.sistema.value : undefined,   // ex.: imobsystem, imobdoces
      consentimento: true,
      website: f.website ? f.website.value : ''           // campo escondido anti-robô
    })
  }).then((x) => x.json()).catch(() => ({ ok: false }));
  // r.ok === true → mostrar "Obrigado!"; senão mostrar r.erro
});
</script>`;
}

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={async () => {
      await navigator.clipboard.writeText(texto);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }}>
      {ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{ok ? "Copiado" : rotulo}
    </Button>
  );
}

function NovaFonte({ onCriada }: { onCriada: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [dominio, setDominio] = useState("");
  const [sistema, setSistema] = useState("");
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas, enabled: aberto });
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.salvarFonte({ tipo: "site", nome, dominio, sistema_padrao: sistema || null }),
    onSuccess: (id) => { toast.success("Fonte criada. Agora gere a chave."); qc.invalidateQueries({ queryKey: ["fontes"] }); setAberto(false); onCriada(id); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild><Button className="gap-1.5"><Plus className="size-4" />Nova landing page</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Nova landing page ou site</DialogTitle>
          <DialogDescription>Cada página tem a sua chave, para você saber de onde veio cada lead.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Landing ImobDoces" /></div>
          <div className="space-y-1.5"><Label>Endereço</Label><Input value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="doces.imobsystems.com.br" /></div>
          <div className="space-y-1.5">
            <Label>Sistema de interesse padrão</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sistema} onChange={(e) => setSistema(e.target.value)}>
              <option value="">Nenhum (o formulário informa)</option>
              {(sistemas.data ?? []).map((s) => <option key={s.app} value={s.app}>{s.app} — {s.nome}</option>)}
            </select>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Criar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const BOAS_VINDAS: Record<string, { rotulo: string; tom: "ok" | "war" | "err" | "neu" | "info" }> = {
  pendente: { rotulo: "WhatsApp na fila", tom: "info" },
  enviada: { rotulo: "WhatsApp enviado", tom: "ok" },
  falhou: { rotulo: "WhatsApp falhou", tom: "err" },
  nao_enviar: { rotulo: "sem WhatsApp", tom: "neu" },
};

function Landing() {
  const qc = useQueryClient();
  const fontes = useQuery({ queryKey: ["fontes"], queryFn: api.listarFontes });
  const sites = (fontes.data ?? []).filter((f) => f.tipo === "site");
  const [sel, setSel] = useState<string | null>(null);
  const [chaveNova, setChaveNova] = useState<{ fonte: string; chave: string } | null>(null);
  useEffect(() => { if (!sel && sites.length) setSel(sites[0]!.id); }, [sites, sel]);
  const atual = sites.find((f) => f.id === sel);
  const leads = useQuery({ queryKey: ["fontes", "leads", sel], queryFn: () => api.leadsRecebidos(sel, 100), enabled: !!sel });

  const gerar = useMutation({
    mutationFn: (f: Fonte) => api.gerarChaveFonte(f.id),
    onSuccess: (chave, f) => { setChaveNova({ fonte: f.id, chave }); qc.invalidateQueries({ queryKey: ["fontes"] }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const ativo = useMutation({
    mutationFn: (v: boolean) => api.salvarFonte({ id: atual!.id, ativo: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fontes"] }),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Pagina
      titulo="Landing pages e sites"
      texto="Formulários do www.imobsystems.com.br e das landing pages. Cada lead entra no funil em Novo lead e recebe o WhatsApp de boas-vindas."
      acoes={<NovaFonte onCriada={setSel} />}
    >
      {fontes.isLoading ? <Carregando /> : fontes.error ? <Erro erro={fontes.error} /> : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Cartao titulo="Páginas" icone="fluent-color:globe-24" semPadding>
            <ul className="p-2">
              {sites.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setSel(f.id)}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", f.id === sel ? "menu-ativo" : "hover:bg-muted")}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{f.nome}</span>
                      <span className={cn("block truncate text-[11px]", f.id === sel ? "text-white/80" : "text-muted-foreground")}>{f.dominio ?? "sem endereço"}</span>
                    </span>
                    <span className="shrink-0 text-xs opacity-80">{f.total_leads}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>

          {atual ? (
            <div className="space-y-4">
              <Cartao icone="fluent-color:person-add-24" titulo={atual.nome}
                extra={
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch checked={atual.ativo} disabled={ativo.isPending} onCheckedChange={(v) => ativo.mutate(v)} />
                    {atual.ativo ? "Recebendo" : "Pausada"}
                  </label>
                }>
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><span className="text-xs text-muted-foreground">Endereço</span><div className="font-semibold">{atual.dominio ?? "—"}</div></div>
                    <div><span className="text-xs text-muted-foreground">Leads recebidos</span><div className="font-semibold">{atual.total_leads}</div></div>
                    <div><span className="text-xs text-muted-foreground">Último lead</span><div className="font-semibold">{dataHora(atual.ultimo_lead_em)}</div></div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <b className="flex items-center gap-1.5"><KeyRound className="size-4" />Chave do site</b>
                        <p className="text-xs text-muted-foreground">
                          {atual.tem_chave ? <>Ativa (começa com <code>{atual.chave_prefixo}…</code>). Gerar outra desliga a atual.</> : "Ainda sem chave: o site só envia depois que você gerar."}
                        </p>
                      </div>
                      <Button size="sm" variant={atual.tem_chave ? "outline" : "default"} disabled={gerar.isPending}
                        onClick={() => { if (!atual.tem_chave || confirm("Gerar uma chave nova? A atual para de funcionar e o site precisa ser atualizado.")) gerar.mutate(atual); }}>
                        {gerar.isPending ? <Loader2 className="size-4 animate-spin" /> : atual.tem_chave ? "Gerar nova chave" : "Gerar chave"}
                      </Button>
                    </div>
                    {chaveNova?.fonte === atual.id ? (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-md bg-warning-soft p-2 text-xs text-warning">Copie agora: esta chave aparece só uma vez.</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{chaveNova.chave}</code>
                          <Copiar texto={chaveNova.chave} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Código para colar no site</span>
                          <Copiar texto={codigoSite(chaveNova.chave)} rotulo="Copiar código" />
                        </div>
                        <pre className="max-h-64 overflow-auto rounded-md bg-foreground/95 p-3 text-[11px] leading-relaxed text-background">{codigoSite(chaveNova.chave)}</pre>
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enquanto o site não troca o código, os formulários que gravam em <code>public.leads</code> e <code>public.saas_leads</code> também entram aqui
                    automaticamente (ponte). Nenhum lead se perde na troca.
                  </p>
                </div>
              </Cartao>

              <Cartao icone="fluent-color:people-list-24" titulo="Últimos leads desta página" semPadding>
                {leads.isLoading ? <Carregando /> : leads.error ? <div className="p-4"><Erro erro={leads.error} /></div> : (leads.data ?? []).length === 0 ? (
                  <Vazio icone="fluent-color:people-list-24" titulo="Nenhum lead ainda" texto="Os leads aparecem aqui assim que o formulário for enviado." />
                ) : (
                  <Tabela cabecalho={["Lead", "Contato", "Recebido", "Etapa", "Boas-vindas"]}>
                    {leads.data!.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-3">
                          <b>{l.nome ?? "—"}</b>{l.repetido ? <span className="ml-1.5"><Selo tom="war">repetido</Selo></span> : null}
                          <div className="text-xs text-muted-foreground">{l.empresa_nome ?? ""}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{telefone(l.whatsapp) || "—"}<div className="text-muted-foreground">{l.email ?? ""}</div></td>
                        <td className="px-4 py-3 text-xs">{dataHora(l.recebido_em)}</td>
                        <td className="px-4 py-3">{l.erro ? <Selo tom="err">{l.erro}</Selo> : <Selo tom="info">{l.etapa ?? "—"}</Selo>}</td>
                        <td className="px-4 py-3">{l.boas_vindas ? <Selo tom={BOAS_VINDAS[l.boas_vindas]!.tom}>{BOAS_VINDAS[l.boas_vindas]!.rotulo}</Selo> : "—"}</td>
                      </tr>
                    ))}
                  </Tabela>
                )}
              </Cartao>
            </div>
          ) : (
            <Vazio icone="fluent-color:globe-24" titulo="Nenhuma página" texto="Crie a primeira landing page para gerar a chave." />
          )}
        </div>
      )}
    </Pagina>
  );
}
