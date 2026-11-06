import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, mensagemErro, type Empresa, type Situacao } from "@/lib/adm/api";
import { brl, SITUACAO } from "@/lib/adm/formato";

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
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const m = useMutation({
    mutationFn: () => {
      const whats = f.whatsapp.replace(/\D/g, "");
      return api.salvarEmpresa({
        ...(empresa ? { id: empresa.id } : {}), ...f,
        whatsapp: whats && whats.length <= 11 ? `55${whats}` : whats,
        dia_vencimento: f.dia_vencimento ? Number(f.dia_vencimento) : null,
      } as never);
    },
    onSuccess: (id) => {
      toast.success(empresa ? "Empresa atualizada." : "Empresa cadastrada.");
      recarregar();
      setAberto(false);
      if (!empresa) navigate({ to: "/empresas/$id", params: { id } });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const enviar = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <Janela gatilho={gatilho} titulo={empresa ? "Editar empresa" : "Nova empresa"} aberto={aberto} setAberto={setAberto}
      descricao="A empresa é o cliente que paga. Depois de salvar, vincule os sistemas que ela usa.">
      <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo rotulo="Razão social *"><Input value={f.razao_social} onChange={set("razao_social")} required /></Campo></div>
        <Campo rotulo="Nome fantasia"><Input value={f.nome_fantasia} onChange={set("nome_fantasia")} /></Campo>
        <Campo rotulo="CPF ou CNPJ" dica="Obrigatório para gerar a cobrança no Asaas."><Input value={f.cnpj} onChange={set("cnpj")} inputMode="numeric" /></Campo>
        <Campo rotulo="Responsável (dono)"><Input value={f.dono_nome} onChange={set("dono_nome")} /></Campo>
        <Campo rotulo="WhatsApp" dica="Com DDD. Recebe os avisos da régua."><Input value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="(11) 9 8765-4321" /></Campo>
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
export function VincularSistema({ gatilho, empresaId }: { gatilho: ReactNode; empresaId: string }) {
  const [aberto, setAberto] = useState(false);
  const recarregar = useRecarregar();
  const sistemas = useQuery({ queryKey: ["sistemas"], queryFn: api.listarSistemas, enabled: aberto });
  const [app, setApp] = useState("");
  const [ref, setRef] = useState("");
  const [plano, setPlano] = useState("");
  const [valor, setValor] = useState("");
  const sis = sistemas.data?.find((s) => s.app === app);

  const m = useMutation({
    mutationFn: () => api.salvarVinculo({
      empresa_id: empresaId, app, plano, valor_mensal: valor.replace(",", "."),
      ...(sis?.tipo_ref === "schema" ? { schema_ref: ref.trim() } : { tenant_ref: ref.trim() }),
    }),
    onSuccess: () => { toast.success("Sistema vinculado."); recarregar(); setAberto(false); setApp(""); setRef(""); setValor(""); setPlano(""); },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Janela gatilho={gatilho} titulo="Vincular sistema" aberto={aberto} setAberto={setAberto}
      descricao="Liga a empresa ao lugar onde estão os dados dela no sistema (schema ou tenant).">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
        <Campo rotulo="Sistema *">
          <select className={SELECT} value={app} onChange={(e) => setApp(e.target.value)} required>
            <option value="">Escolha…</option>
            {(sistemas.data ?? []).map((s) => <option key={s.app} value={s.app}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo={sis?.tipo_ref === "schema" ? "Schema da empresa *" : "Id do tenant da empresa *"} dica={sis?.descricao_ref ?? undefined}>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} required placeholder={sis?.tipo_ref === "schema" ? "loja_nome" : "uuid ou código"} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Plano"><Input value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Essencial, Profissional…" /></Campo>
          <Campo rotulo="Valor mensal (R$) *"><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required placeholder="290,00" /></Campo>
        </div>
        <Rodape salvando={m.isPending} rotulo="Vincular" />
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
