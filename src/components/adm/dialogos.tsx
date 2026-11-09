import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, mensagemErro, type CardNegocio, type Empresa, type Situacao } from "@/lib/adm/api";
import { brl, ORIGEM, SITUACAO } from "@/lib/adm/formato";

const ORIGENS_VENDA: [string, string][] = [
  ["indicacao", "Indicação"], ["prospeccao", "Prospecção ativa"], ["evento", "Evento"], ["parceiro", "Parceiro / revenda"],
  ["cliente_antigo", "Já era cliente"], ["site", "Site"], ["instagram", "Instagram"], ["facebook", "Facebook"],
  ["whatsapp", "WhatsApp"], ["linkedin", "LinkedIn"], ["tiktok", "TikTok"], ["outro", "Outro"],
];

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{rotulo}</Label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

/** Invalida tudo o que mostra empresas/faturas depois de uma ação. */
function useRecarregar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => ["painel", "empresas", "empresa", "faturas", "sistemas"].includes(String(q.queryKey[0])) });
}

function Janela({ gatilho, titulo, descricao, aberto, setAberto, children }: {
  gatilho: ReactNode; titulo: string; descricao?: ReactNode; aberto: boolean; setAberto: (v: boolean) => void; children: ReactNode;
}) {
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{gatilho}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Rodape({ salvando, rotulo, perigo }: { salvando: boolean; rotulo: string; perigo?: boolean }) {
  return (
    <DialogFooter className="pt-2">
      <Button type="submit" disabled={salvando} variant={perigo ? "destructive" : "default"} className="min-w-32">
        {salvando ? <Loader2 className="size-4 animate-spin" /> : rotulo}
      </Button>
    </DialogFooter>
  );
}

// ------------------------------------------------------------------ Empresa (nova / editar)
export function NovaEmpresa({ gatilho, empresa }: { gatilho: ReactNode; empresa?: Empresa }) {
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  const recarregar = useRecarregar();
  const [f, setF] = useState(() => ({
    razao_social: empresa?.razao_social ?? "", nome_fantasia: empresa?.nome_fantasia ?? "", cnpj: empresa?.cnpj ?? "",
    dono_nome: empresa?.dono_nome ?? "", whatsapp: empresa?.whatsapp ?? "", email_financeiro: empresa?.email_financeiro ?? "",
    modalidade: empresa?.modalidade ?? "pagante", dia_vencimento: empresa?.dia_vencimento ? String(empresa.dia_vencimento) : "10",
    observacoes: empresa?.observacoes ?? "",
  }));
  const [comprador, setComprador] = useState(() => ({
    comprador_nome: empresa?.comprador_nome ?? "", comprador_email: empresa?.comprador_email ?? "",
    comprador_whatsapp: empresa?.comprador_whatsapp ?? "", comprador_cargo: empresa?.comprador_cargo ?? "",
  }));
  const setC = (k: keyof typeof comprador) => (e: { target: { value: string } }) => setComprador((x) => ({ ...x, [k]: e.target.value }));
  // Origem da venda: obrigatória na empresa nova; na empresa antiga sem origem, dá para registrar ao editar.
  const pedeOrigem = !empresa || !empresa.negocio_id;
  const [origemTipo, setOrigemTipo] = useState<"" | "lead" | "outra">("");
  const [lead, setLead] = useState<CardNegocio | null>(null);
  const [buscaLead, setBuscaLead] = useState("");
  const [origem, setOrigem] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const leads = useQuery({ queryKey: ["origem-leads", buscaLead], queryFn: () => api.leads(null, null, buscaLead.trim()), enabled: aberto && origemTipo === "lead" && buscaLead.trim().length >= 2 });
  const escolherLead = (l: CardNegocio) => {
    setLead(l);
    // Aproveita os dados do lead no que ainda está vazio.
    setF((x) => ({ ...x, razao_social: x.razao_social || l.empresa || l.nome, nome_fantasia: x.nome_fantasia || l.empresa || "" }));
    setComprador((x) => ({ ...x, comprador_nome: x.comprador_nome || l.nome, comprador_email: x.comprador_email || l.email || "",
      comprador_whatsapp: x.comprador_whatsapp || l.whatsapp || "", comprador_cargo: x.comprador_cargo || l.cargo || "" }));
  };
  const origemPronta = !pedeOrigem || (origemTipo === "lead" ? !!lead : origemTipo === "outra" ? !!origem : !!empresa);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const m = useMutation({
    mutationFn: async () => {
      const whats = f.whatsapp.replace(/\D/g, "");
      const id = await api.salvarEmpresa({
        ...(empresa ? { id: empresa.id } : {}), ...f,
        whatsapp: whats && whats.length <= 11 ? `55${whats}` : whats,
        dia_vencimento: f.dia_vencimento ? Number(f.dia_vencimento) : null,
      } as never);
      await api.salvarComprador(id, comprador);
      if (pedeOrigem && origemTipo) {
        await api.empresaOrigem(id, origemTipo === "lead" ? { negocio_id: lead!.negocio_id } : { origem, detalhe });
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success(empresa ? "Empresa atualizada." : "Empresa cadastrada.");
      recarregar();
      setAberto(false);
      if (!empresa) navigate({ to: "/empresas/$id", params: { id } });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!origemPronta) { toast.error("Informe de onde veio a venda."); return; }
    if (pedeOrigem && origemTipo === "outra" && !(comprador.comprador_email || comprador.comprador_whatsapp || f.email_financeiro || f.whatsapp)) {
      toast.error("Preencha o e-mail ou o WhatsApp do comprador para registrar a origem da venda.");
      return;
    }
    m.mutate();
  };

  return (
    <Janela gatilho={gatilho} titulo={empresa ? "Editar empresa" : "Nova empresa"} aberto={aberto} setAberto={setAberto}
      descricao="A empresa é o cliente que paga. Depois de salvar, vincule os sistemas que ela usa.">
      <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
        {pedeOrigem ? (
          <fieldset className="grid gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-bold">Origem da venda {empresa ? "" : "*"}</legend>
            <p className="-mt-1 text-xs text-muted-foreground">Conta nos Relatórios Comerciais: de onde veio este cliente.</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Origem da venda">
              {([["lead", "Veio de um lead em Leads & Contatos"], ["outra", "Outra origem"]] as const).map(([v, r]) => (
                <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold ${origemTipo === v ? "border-primary" : "border-border"}`}>
                  <input type="radio" name="origem-tipo" checked={origemTipo === v} onChange={() => setOrigemTipo(v)} />{r}
                </label>
              ))}
            </div>
            {origemTipo === "lead" ? (
              lead ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <span><b>{lead.nome}</b>{lead.empresa ? ` · ${lead.empresa}` : ""} <span className="text-xs text-muted-foreground">({ORIGEM[lead.origem]?.rotulo ?? lead.origem})</span></span>
                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => setLead(null)}>Trocar</button>
                </div>
              ) : (
                <div>
                  <Input value={buscaLead} onChange={(e) => setBuscaLead(e.target.value)} placeholder="Buscar o lead pelo nome, empresa ou e-mail…" aria-label="Buscar lead" />
                  <ul className="mt-1 max-h-44 overflow-y-auto">
                    {(leads.data ?? []).filter((l) => !l.empresa_id).slice(0, 8).map((l) => (
                      <li key={l.negocio_id}><button type="button" className="min-h-10 w-full rounded-md px-2 text-left text-sm hover:bg-muted" onClick={() => escolherLead(l)}>
                        <b>{l.nome}</b>{l.empresa ? ` · ${l.empresa}` : ""} <span className="text-xs text-muted-foreground">({ORIGEM[l.origem]?.rotulo ?? l.origem})</span></button></li>
                    ))}
                    {buscaLead.trim().length >= 2 && leads.data && leads.data.filter((l) => !l.empresa_id).length === 0 ? <li className="px-2 py-2 text-xs text-muted-foreground">Nenhum lead encontrado. Use "Outra origem".</li> : null}
                  </ul>
                </div>
              )
            ) : origemTipo === "outra" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="De onde veio *">
                  <select className={SELECT} value={origem} onChange={(e) => setOrigem(e.target.value)}>
                    <option value="">Escolha…</option>
                    {ORIGENS_VENDA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Detalhe"><Input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Quem indicou, qual evento…" /></Campo>
              </div>
            ) : null}
          </fieldset>
        ) : null}
        <div className="sm:col-span-2"><Campo rotulo="Razão social *"><Input value={f.razao_social} onChange={set("razao_social")} required /></Campo></div>
        <Campo rotulo="Nome fantasia"><Input value={f.nome_fantasia} onChange={set("nome_fantasia")} /></Campo>
        <Campo rotulo="CPF ou CNPJ" dica="Obrigatório para gerar a cobrança no Asaas."><Input value={f.cnpj} onChange={set("cnpj")} inputMode="numeric" /></Campo>
        <Campo rotulo="Responsável (dono)"><Input value={f.dono_nome} onChange={set("dono_nome")} /></Campo>
        <Campo rotulo="WhatsApp" dica="Com DDD. Recebe os avisos da régua."><Input value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="(11) 9 8765-4321" /></Campo>
        <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">Comprador: quem vai acessar</legend>
          <Campo rotulo="Nome completo"><Input value={comprador.comprador_nome} onChange={setC("comprador_nome")} /></Campo>
          <Campo rotulo="E-mail de login" dica="Para este e-mail vão o login e a senha."><Input type="email" value={comprador.comprador_email} onChange={setC("comprador_email")} /></Campo>
          <Campo rotulo="WhatsApp"><Input value={comprador.comprador_whatsapp} onChange={setC("comprador_whatsapp")} inputMode="tel" /></Campo>
          <Campo rotulo="Cargo"><Input value={comprador.comprador_cargo} onChange={setC("comprador_cargo")} /></Campo>
        </fieldset>
        <div className="sm:col-span-2"><Campo rotulo="E-mail financeiro"><Input type="email" value={f.email_financeiro} onChange={set("email_financeiro")} /></Campo></div>
        <Campo rotulo="Modalidade">
          <select className={SELECT} value={f.modalidade} onChange={set("modalidade")}>
            <option value="pagante">Pagante</option>
            <option value="cortesia">Cortesia (não cobra, nunca suspende)</option>
            <option value="cancelada">Cancelada (sem acesso)</option>
          </select>
        </Campo>
        <Campo rotulo="Dia do vencimento">
          <select className={SELECT} value={f.dia_vencimento} onChange={set("dia_vencimento")}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
          </select>
        </Campo>
        <div className="sm:col-span-2"><Campo rotulo="Observações"><Textarea rows={2} value={f.observacoes} onChange={set("observacoes")} /></Campo></div>
        <div className="sm:col-span-2"><Rodape salvando={m.isPending} rotulo={empresa ? "Salvar" : "Cadastrar empresa"} /></div>
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Vincular sistema
export function VincularSistema({ gatilho, empresaId, compradorEmail }: { gatilho: ReactNode; empresaId: string; compradorEmail?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const recarregar = useRecarregar();
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas, enabled: aberto });
  const [app, setApp] = useState("");
  const [modo, setModo] = useState<"criar" | "existente" | "codigo">("codigo");
  const [ref, setRef] = useState("");
  const [plano, setPlano] = useState("");
  const [valor, setValor] = useState("");
  const [liberar, setLiberar] = useState(true);
  const [semPagamento, setSemPagamento] = useState(false);
  const sis = sistemas.data?.find((s) => s.app === app);
  const plataforma = useQuery({ queryKey: ["plataforma-empresas", app], queryFn: () => api.plataformaEmpresas(app), enabled: aberto && !!app });
  const p = plataforma.data;
  const podeLiberar = !!compradorEmail && !!p?.pode_liberar;

  const escolherSistema = (novo: string) => { setApp(novo); setRef(""); setModo("codigo"); };
  useEffect(() => {
    if (p) setModo(p.pode_criar ? "criar" : p.pode_listar ? "existente" : "codigo");
  }, [p]);

  const limpar = () => { setApp(""); setRef(""); setValor(""); setPlano(""); setSemPagamento(false); };
  const m = useMutation({
    mutationFn: async () => {
      const valorMensal = valor.replace(",", ".");
      const vinculo = modo === "criar"
        ? await api.vincularCriando({ empresa_id: empresaId, app, plano, valor_mensal: valorMensal })
        : await api.salvarVinculo({
            empresa_id: empresaId, app, plano, valor_mensal: valorMensal,
            ...(sis?.tipo_ref === "schema" ? { schema_ref: ref.trim() } : { tenant_ref: ref.trim() }),
          });
      if (!liberar || !podeLiberar) return null;
      // O vínculo já ficou salvo; se a liberação falhar, ela pode ser refeita pelo botão da linha.
      try {
        return await api.liberarAcesso(vinculo, semPagamento);
      } catch (e) {
        toast.error(`Sistema vinculado, mas o acesso não foi liberado: ${mensagemErro(e)}`);
        return null;
      }
    },
    onSuccess: (r) => {
      toast.success(r ? `Sistema vinculado e e-mail de acesso enviado para ${r.email}.` : "Sistema vinculado.");
      recarregar(); setAberto(false); limpar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const opcoes: [typeof modo, string][] = [
    ...(p?.pode_criar ? [["criar", `Criar a empresa no ${sis?.nome ?? "sistema"}`] as [typeof modo, string]] : []),
    ...(p?.pode_listar ? [["existente", "Usar empresa que já existe"] as [typeof modo, string]] : []),
  ];

  return (
    <Janela gatilho={gatilho} titulo="Vincular sistema" aberto={aberto} setAberto={setAberto}
      descricao="Liga a empresa à plataforma que ela comprou.">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <Campo rotulo="Sistema *">
          <select className={SELECT} value={app} onChange={(e) => escolherSistema(e.target.value)} required>
            <option value="">Escolha…</option>
            {(sistemas.data ?? []).map((s) => <option key={s.app} value={s.app}>{s.nome}</option>)}
          </select>
        </Campo>

        {app && plataforma.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consultando a plataforma…</p> : null}
        {app && p ? (
          <>
            {opcoes.length > 1 ? (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Empresa na plataforma">
                {opcoes.map(([v, r]) => (
                  <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${modo === v ? "border-primary bg-primary-soft" : "border-border"}`}>
                    <input type="radio" name="modo" checked={modo === v} onChange={() => { setModo(v); setRef(""); }} />{r}
                  </label>
                ))}
              </div>
            ) : null}
            {modo === "criar" ? (
              <p className="rounded-lg bg-info-soft p-3 text-xs text-info">A empresa é criada no {sis?.nome} com o nome deste cadastro, já com os perfis e configurações iniciais.</p>
            ) : modo === "existente" ? (
              <Campo rotulo="Empresa na plataforma *">
                <select className={SELECT} value={ref} onChange={(e) => setRef(e.target.value)} required>
                  <option value="">Escolha…</option>
                  {p.empresas.map((x) => (
                    <option key={x.ref} value={x.ref} disabled={!!x.vinculada_a}>{x.nome}{x.vinculada_a ? ` (já vinculada a ${x.vinculada_a})` : ""}</option>
                  ))}
                </select>
              </Campo>
            ) : (
              <Campo rotulo={sis?.tipo_ref === "schema" ? "Schema da empresa *" : "Código da empresa na plataforma *"} dica={sis?.descricao_ref ?? undefined}>
                <Input value={ref} onChange={(e) => setRef(e.target.value)} required placeholder={sis?.tipo_ref === "schema" ? "loja_nome" : "código"} />
              </Campo>
            )}
          </>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Plano"><Input value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Essencial, Profissional…" /></Campo>
          <Campo rotulo="Valor mensal (R$) *"><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required placeholder="290,00" /></Campo>
        </div>

        {app && p ? (podeLiberar ? (
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={liberar} onChange={(e) => setLiberar(e.target.checked)} />
              <span>Liberar o acesso e enviar o e-mail para <b>{compradorEmail}</b></span></label>
            {liberar ? (
              <label className="flex items-start gap-2 text-muted-foreground"><input type="checkbox" className="mt-0.5 size-4" checked={semPagamento} onChange={(e) => setSemPagamento(e.target.checked)} />
                <span>Liberar mesmo sem pagamento confirmado (fica no histórico)</span></label>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg bg-warning-soft p-3 text-xs text-warning-strong">
            {!compradorEmail ? "Para liberar o acesso junto, preencha o e-mail do comprador em Editar." : `O ${sis?.nome ?? "sistema"} ainda não envia o acesso pelo painel.`}
          </p>
        )) : null}
        <Rodape salvando={m.isPending} rotulo={liberar && podeLiberar ? "Vincular e liberar acesso" : "Vincular"} />
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Adicionar sistema (schema do banco)
export function AdicionarSistema({ gatilho }: { gatilho: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  const disp = useQuery({ queryKey: ["schemas-disponiveis"], queryFn: api.schemasDisponiveis, enabled: aberto });
  const [schema, setSchema] = useState("");
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState<"schema" | "tenant">("tenant");
  const [descricao, setDescricao] = useState("");

  const m = useMutation({
    mutationFn: () => api.adicionarSistema(schema, nome, url, tipo, descricao),
    onSuccess: () => {
      toast.success("Sistema adicionado.");
      qc.invalidateQueries({ queryKey: ["sistemas"] });
      qc.invalidateQueries({ queryKey: ["schemas-disponiveis"] });
      setAberto(false); setSchema(""); setNome(""); setUrl(""); setDescricao("");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Janela gatilho={gatilho} titulo="Adicionar sistema" aberto={aberto} setAberto={setAberto}
      descricao="Escolha um schema do banco que ainda não é cobrado. Ele entra na Central de Acessos com o controle desligado (nenhum login muda).">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <Campo rotulo="Schema no Supabase *">
          <select className={SELECT} value={schema} required onChange={(e) => {
            const s = disp.data?.find((x) => x.schema_name === e.target.value);
            setSchema(e.target.value);
            if (!nome) setNome(s?.nome_central ?? e.target.value);
          }}>
            <option value="">{disp.isLoading ? "Carregando…" : "Escolha…"}</option>
            {(disp.data ?? []).map((s) => (
              <option key={s.schema_name} value={s.schema_name}>{s.schema_name} · {s.tabelas} tabelas{s.na_central ? " · já na Central" : ""}</option>
            ))}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do sistema *"><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></Campo>
          <Campo rotulo="Endereço do site"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…imobsystems.com.br" /></Campo>
        </div>
        <Campo rotulo="Como separa as empresas *">
          <select className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as "schema" | "tenant")}>
            <option value="tenant">Várias empresas no mesmo schema (coluna de empresa/tenant)</option>
            <option value="schema">Um schema por empresa</option>
          </select>
        </Campo>
        <Campo rotulo="Onde fica a empresa" dica="Ex.: unidade em imobeducacional.unidades (unidade_id)">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Rodape salvando={m.isPending} rotulo="Adicionar sistema" />
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Registrar pagamento
export function RegistrarPagamento({ gatilho, faturaId, valor, empresa }: { gatilho: ReactNode; faturaId: string; valor: number; empresa: string }) {
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState("pix");
  const recarregar = useRecarregar();
  const m = useMutation({
    mutationFn: () => api.registrarPagamento(faturaId, forma),
    onSuccess: (s: Situacao) => { toast.success(`Pagamento registrado. Empresa agora: ${SITUACAO[s]?.rotulo ?? s}.`); recarregar(); setAberto(false); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Janela gatilho={gatilho} titulo="Registrar pagamento" aberto={aberto} setAberto={setAberto}
      descricao={<>Fatura de <b>{brl(valor)}</b> de {empresa}. Se a empresa estiver suspensa, o acesso volta na hora.</>}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <Campo rotulo="Como foi pago">
          <select className={SELECT} value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="pix">PIX</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option>
            <option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="manual">Outro</option>
          </select>
        </Campo>
        <p className="text-xs text-muted-foreground">Use só quando o pagamento não passou pelo Asaas. O que passa pelo Asaas é baixado sozinho.</p>
        <Rodape salvando={m.isPending} rotulo="Confirmar pagamento" />
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Conceder prazo
export function ConcederPrazo({ gatilho, empresaId, atual }: { gatilho: ReactNode; empresaId: string; atual: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [ate, setAte] = useState(atual ?? "");
  const [motivo, setMotivo] = useState("");
  const recarregar = useRecarregar();
  const m = useMutation({
    mutationFn: (retirar: boolean) => api.concederPrazo(empresaId, retirar ? null : ate, motivo),
    onSuccess: () => { toast.success("Prazo atualizado."); recarregar(); setAberto(false); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Janela gatilho={gatilho} titulo="Conceder prazo extra" aberto={aberto} setAberto={setAberto}
      descricao="Até essa data a empresa não é suspensa e não recebe avisos de atraso, mesmo com a fatura vencida.">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(false); }} className="space-y-3">
        <Campo rotulo="Não suspender até *"><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} required /></Campo>
        <Campo rotulo="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Combinado por telefone…" /></Campo>
        <DialogFooter className="gap-2 pt-2">
          {atual ? <Button type="button" variant="outline" onClick={() => m.mutate(true)} disabled={m.isPending}>Retirar prazo</Button> : null}
          <Button type="submit" disabled={m.isPending}>{m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar prazo"}</Button>
        </DialogFooter>
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Suspender / reativar à mão
export function SuspenderManual({ gatilho, empresaId, suspensa }: { gatilho: ReactNode; empresaId: string; suspensa: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const recarregar = useRecarregar();
  const m = useMutation({
    mutationFn: () => api.suspender(empresaId, !suspensa, motivo),
    onSuccess: (s) => { toast.success(`Empresa agora: ${SITUACAO[s]?.rotulo ?? s}.`); recarregar(); setAberto(false); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Janela gatilho={gatilho} titulo={suspensa ? "Retirar suspensão manual" : "Suspender agora"} aberto={aberto} setAberto={setAberto}
      descricao={suspensa
        ? "A empresa volta a seguir a situação financeira (se estiver em dia, o acesso volta na hora)."
        : "O acesso cai em todos os sistemas desta empresa imediatamente, mesmo sem atraso."}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <Campo rotulo="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} required={!suspensa} /></Campo>
        <Rodape salvando={m.isPending} rotulo={suspensa ? "Retirar suspensão" : "Suspender"} perigo={!suspensa} />
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Cobrança avulsa (fatura manual)
export function CobrancaAvulsa({ gatilho, empresaId, valorPadrao }: { gatilho: ReactNode; empresaId: string; valorPadrao: number }) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const [venc, setVenc] = useState(hoje);
  const [valor, setValor] = useState(String(valorPadrao || ""));
  const recarregar = useRecarregar();
  const m = useMutation({
    mutationFn: () => api.criarFatura(empresaId, venc.slice(0, 8) + "01", venc, Number(valor.replace(",", "."))),
    onSuccess: () => { toast.success("Fatura criada."); recarregar(); setAberto(false); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Janela gatilho={gatilho} titulo="Fatura manual" aberto={aberto} setAberto={setAberto}
      descricao="Para cobranças fora do Asaas (ex.: histórico ou acordo). A fatura entra na régua e na suspensão como as outras.">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Vencimento *"><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} required /></Campo>
        <Campo rotulo="Valor (R$) *"><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required /></Campo>
        <div className="sm:col-span-2"><Rodape salvando={m.isPending} rotulo="Criar fatura" /></div>
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ Excluir empresa (só super admin; o banco confere)
export function ExcluirEmpresa({ gatilho, empresa }: { gatilho: ReactNode; empresa: Empresa }) {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const nome = empresa.nome_fantasia || empresa.razao_social;
  const m = useMutation({
    mutationFn: () => api.excluirEmpresa(empresa.id, confirmacao),
    onSuccess: () => { toast.success("Empresa excluída."); setAberto(false); qc.invalidateQueries(); navigate({ to: "/empresas" }); },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  return (
    <Janela gatilho={gatilho} titulo="Excluir empresa" aberto={aberto} setAberto={(v) => { setAberto(v); if (!v) setConfirmacao(""); }}
      descricao="Apaga a empresa, os vínculos, as mensalidades e o histórico do painel. Não dá para desfazer.">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          Os dados dentro de cada plataforma e os logins das pessoas não são apagados. Empresa com assinatura no Asaas precisa ter a assinatura cancelada antes.
        </p>
        <Campo rotulo={`Digite ${nome} para confirmar`}><Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" /></Campo>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button type="submit" variant="destructive" disabled={m.isPending || confirmacao.trim().toLowerCase() !== nome.trim().toLowerCase()}>
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </form>
    </Janela>
  );
}
