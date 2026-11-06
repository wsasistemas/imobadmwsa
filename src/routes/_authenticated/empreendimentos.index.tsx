import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import { useConstrutoras } from "@/hooks/useConstrutoras";
import { STATUS_EMPREENDIMENTO } from "@/lib/empreendimentosMeta";
import { EmpreendimentoCard } from "@/components/empreendimentos/EmpreendimentoCard";

export const Route = createFileRoute("/_authenticated/empreendimentos/")({
  component: CatalogoList,
});

function CatalogoList() {
  const { data, isLoading } = useEmpreendimentos();
  const { data: construtoras } = useConstrutoras();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [construtora, setConstrutora] = useState("all");
  const [cidade, setCidade] = useState("all");

  const cidades = Array.from(
    new Set((data ?? []).map((e) => e.cidade).filter(Boolean) as string[]),
  ).sort();

  const filtered = (data ?? []).filter((e) => {
    if (q.trim() && !e.nome.toLowerCase().includes(q.toLowerCase())) return false;
    if (status !== "all" && e.status !== status) return false;
    if (construtora !== "all" && e.construtora_id !== construtora) return false;
    if (cidade !== "all" && e.cidade !== cidade) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Empreendimentos"
        description="Catálogo de lançamentos das construtoras parceiras."
        action={
          <Button asChild>
            <Link to="/empreendimentos/novo">
              <Plus className="mr-2 h-4 w-4" />
              Novo empreendimento
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Catálogo vazio"
          description="Cadastre o primeiro empreendimento para começar."
          action={
            <Button asChild>
              <Link to="/empreendimentos/novo">
                <Plus className="mr-2 h-4 w-4" />
                Cadastrar
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Buscar empreendimento…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUS_EMPREENDIMENTO.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={construtora} onValueChange={setConstrutora}>
              <SelectTrigger>
                <SelectValue placeholder="Construtora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as construtoras</SelectItem>
                {(construtoras ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cidade} onValueChange={setCidade}>
              <SelectTrigger>
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cidades</SelectItem>
                {cidades.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum empreendimento encontrado com os filtros atuais.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((emp) => (
                <EmpreendimentoCard key={emp.id} emp={emp} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
