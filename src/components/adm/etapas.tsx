import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useRecarregarComercial } from "@/components/adm/comercial";
import { Carregando, Erro } from "@/components/adm/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, mensagemErro, type EtapaConfig } from "@/lib/adm/api";
import { COR_ETAPA } from "@/lib/adm/formato";

const CORES: [string, string][] = [["info", "Azul-claro"], ["primary", "Azul"], ["abobora", "Abóbora"], ["warning", "Amarelo"], ["success", "Verde"], ["muted", "Cinza"]];

function Linha({ e, aoMudar }: { e: EtapaConfig; aoMudar: () => void }) {
  const [nome, setNome] = useState(e.nome);
  const erro = (x: unknown) => toast.error(mensagemErro(x));
  const salvar = useMutation({ mutationFn: (p: { nome: string; cor: string }) => api.etapaSalvar({ id: e.id, ...p }), onSuccess: aoMudar, onError: erro });
  const mover = useMutation({ mutationFn: (d: number) => api.etapaMover(e.id, d), onSuccess: aoMudar, onError: erro });
  const excluir = useMutation({ mutationFn: () => api.etapaExcluir(e.id), onSuccess: aoMudar, onError: erro });

  return (
    <li className="flex items-center gap-2 py-2">
      <span className={`h-8 w-1 shrink-0 rounded-full ${COR_ETAPA[e.cor]?.barra ?? "bg-primary"}`} />
      <Input aria-label="Nome da etapa" value={nome} className="min-w-0 flex-1" onChange={(x) => setNome(x.target.value)}
        onBlur={() => { if (nome.trim() && nome !== e.nome) salvar.mutate({ nome, cor: e.cor }); }} />
      <select aria-label={`Cor de ${e.nome}`} className="h-10 w-28 rounded-md border border-input bg-card px-2 text-sm" value={e.cor} onChange={(x) => salvar.mutate({ nome, cor: x.target.value })}>
        {CORES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <Button variant="outline" size="icon" aria-label={`Subir ${e.nome}`} disabled={e.final || mover.isPending} onClick={() => mover.mutate(-1)}><ArrowUp className="size-4" /></Button>
      <Button variant="outline" size="icon" aria-label={`Descer ${e.nome}`} disabled={e.final || mover.isPending} onClick={() => mover.mutate(1)}><ArrowDown className="size-4" /></Button>
      <Button variant="outline" size="icon" aria-label={`Excluir ${e.nome}`} title={e.de_fabrica ? "Etapa de fábrica" : e.negocios > 0 ? "Tem negócios nesta etapa" : "Excluir"}
        disabled={e.de_fabrica || e.negocios > 0 || excluir.isPending} onClick={() => excluir.mutate()}><Trash2 className="size-4" /></Button>
    </li>
  );
}

export function ConfigurarEtapas({ aberto, setAberto }: { aberto: boolean; setAberto: (v: boolean) => void }) {
  const q = useQuery({ queryKey: ["etapas"], queryFn: api.etapas, enabled: aberto });
  const recarregar = useRecarregarComercial();
  const [nova, setNova] = useState("");
  const aoMudar = () => { void q.refetch(); recarregar(); };
  const criar = useMutation({
    mutationFn: () => api.etapaSalvar({ nome: nova, cor: "primary" }),
    onSuccess: () => { setNova(""); aoMudar(); },
    onError: (x) => toast.error(mensagemErro(x)),
  });
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Configurar etapas do funil</DialogTitle></DialogHeader>
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : (
          <ul className="max-h-[55dvh] divide-y divide-border overflow-y-auto">
            {(q.data ?? []).map((e) => <Linha key={`${e.id}-${e.nome}`} e={e} aoMudar={aoMudar} />)}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={(x) => { x.preventDefault(); if (nova.trim()) criar.mutate(); }}>
          <Input value={nova} onChange={(x) => setNova(x.target.value)} placeholder="Nome da nova etapa" aria-label="Nome da nova etapa" />
          <Button type="submit" disabled={!nova.trim() || criar.isPending}>Adicionar</Button>
        </form>
        <p className="text-xs text-muted-foreground">Ganho e Perdido ficam sempre no fim. As etapas de fábrica podem ser renomeadas, mas não excluídas.</p>
      </DialogContent>
    </Dialog>
  );
}
