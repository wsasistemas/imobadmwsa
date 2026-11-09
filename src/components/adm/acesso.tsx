import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Selo } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, mensagemErro, type AcessoComprador } from "@/lib/adm/api";
import { dataHora } from "@/lib/adm/formato";

// Acesso do comprador: a situação e o botão Liberar/Reenviar, usados na ficha da empresa e em Sistemas e schemas.

export function SituacaoAcesso({ a }: { a?: AcessoComprador }) {
  if (!a) return <span className="text-xs text-muted-foreground">—</span>;
  if (a.situacao === "primeiro_acesso") return <div><Selo tom="ok">1º acesso feito</Selo>{a.primeiro_acesso_em ? <div className="mt-0.5 text-[11px] text-muted-foreground">{dataHora(a.primeiro_acesso_em)}</div> : null}</div>;
  if (a.situacao === "enviado") return <div><Selo tom="info">E-mail enviado</Selo><div className="mt-0.5 text-[11px] text-muted-foreground">{a.login_novo ? "aguardando 1º acesso" : "já tinha login WSA"}</div></div>;
  if (a.situacao === "falhou" || a.situacao === "enviando") return <div title={a.erro ?? undefined}><Selo tom="err">E-mail não saiu</Selo></div>;
  if (!a.disponivel) return <Selo tom="neu">Plataforma não ligada</Selo>;
  if (!a.comprador_email) return <Selo tom="war">Falta cadastro</Selo>;
  if (!a.pago) return <Selo tom="war">Aguardando pagamento</Selo>;
  return <Selo tom="war">Pronto para liberar</Selo>;
}

export function BotaoAcesso({ a }: { a?: AcessoComprador }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [semPagamento, setSemPagamento] = useState(false);
  const m = useMutation({
    mutationFn: () => api.liberarAcesso(a!.vinculo_id, semPagamento),
    onSuccess: (r) => { toast.success(`Acesso liberado. E-mail enviado para ${r.email}.`); setAberto(false); setSemPagamento(false); },
    onError: (e) => toast.error(mensagemErro(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["acessos-comprador"] }),
  });
  if (!a || !a.disponivel || !a.ativo || !a.comprador_email) return null;
  const jaEnviou = !!a.situacao;
  const podeLiberar = a.pago || semPagamento;

  return (
    <>
      <Button size="sm" variant={jaEnviou ? "outline" : "default"} className="whitespace-nowrap" onClick={() => setAberto(true)}>{jaEnviou ? "Reenviar" : "Liberar acesso"}</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>{jaEnviou ? "Reenviar acesso" : "Liberar acesso"} ao {a.sistema}</DialogTitle></DialogHeader>
          <dl className="divide-y divide-border text-sm">
            {([["Empresa", a.empresa], ["Pagamento", a.pago ? "Confirmado" : "Não confirmado"], ["Onde estão os dados", a.ref], ["Comprador", a.comprador_nome ?? "—"], ["E-mail de login", a.comprador_email], ["Link de acesso", a.url_login ?? "—"]] as [string, string][]).map(([r, v]) => (
              <div key={r} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{r}</dt><dd className="min-w-0 break-words text-right font-semibold">{v}</dd></div>
            ))}
          </dl>
          <p className="rounded-lg bg-info-soft p-3 text-xs text-info">A senha é gerada automaticamente e vai só no e-mail. Se a pessoa já tem login WSA, a senha dela não muda.</p>
          {!a.pago ? (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={semPagamento} onChange={(e) => setSemPagamento(e.target.checked)} />Liberar sem pagamento confirmado (fica registrado no histórico)</label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button className="bg-success text-success-foreground hover:bg-success/90" disabled={!podeLiberar || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : jaEnviou ? "Reenviar e-mail" : "Liberar e enviar e-mail"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
