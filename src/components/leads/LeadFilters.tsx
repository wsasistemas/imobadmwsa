import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORIGENS, SCORES } from "@/lib/leadsMeta";
import { useCorretores } from "@/hooks/useCorretores";

export type FiltrosLead = {
  q: string;
  corretor: string;
  score: string;
  origem: string;
  periodo: string; // "all" | "7" | "30" | "90"
};

type Props = {
  filtros: FiltrosLead;
  setFiltros: (f: FiltrosLead) => void;
  mostrarCorretor: boolean;
};

export function LeadFilters({ filtros, setFiltros, mostrarCorretor }: Props) {
  const { data: corretores } = useCorretores();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Buscar por nome, e-mail ou telefone…"
        value={filtros.q}
        onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
        className="lg:col-span-2"
      />
      {mostrarCorretor && (
        <Select
          value={filtros.corretor}
          onValueChange={(v) => setFiltros({ ...filtros, corretor: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Corretor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os corretores</SelectItem>
            {(corretores ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={filtros.score} onValueChange={(v) => setFiltros({ ...filtros, score: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os scores</SelectItem>
          {SCORES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filtros.origem} onValueChange={(v) => setFiltros({ ...filtros, origem: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as origens</SelectItem>
          {ORIGENS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filtros.periodo} onValueChange={(v) => setFiltros({ ...filtros, periodo: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo o período</SelectItem>
          <SelectItem value="7">Últimos 7 dias</SelectItem>
          <SelectItem value="30">Últimos 30 dias</SelectItem>
          <SelectItem value="90">Últimos 90 dias</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function aplicarFiltros(leads: import("@/types").Lead[], f: FiltrosLead) {
  return leads.filter((l) => {
    if (f.q.trim()) {
      const s = f.q.toLowerCase();
      const match =
        l.nome.toLowerCase().includes(s) ||
        (l.email?.toLowerCase().includes(s) ?? false) ||
        (l.telefone?.includes(s) ?? false);
      if (!match) return false;
    }
    if (f.corretor !== "all" && l.corretor_id !== f.corretor) return false;
    if (f.score !== "all" && l.score !== f.score) return false;
    if (f.origem !== "all" && l.origem !== f.origem) return false;
    if (f.periodo !== "all") {
      const dias = Number(f.periodo);
      const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
      if (new Date(l.created_at).getTime() < limite) return false;
    }
    return true;
  });
}
