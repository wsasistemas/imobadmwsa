import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, LayoutGrid, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEmpreendimentos } from "@/hooks/useEmpreendimentos";
import { useFeature } from "@/hooks/useFeature";

export const Route = createFileRoute("/_authenticated/espelho/")({
  component: EspelhoIndex,
});

function EspelhoIndex() {
  const { enabled, loading: fLoading } = useFeature("modulo_corretor");
  const { data, isLoading } = useEmpreendimentos();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((e) => e.nome.toLowerCase().includes(s) || (e.cidade ?? "").toLowerCase().includes(s));
  }, [data, q]);

  if (fLoading) return <LoadingSpinner />;
  if (!enabled) {
    return (
      <div className="p-6">
        <PageHeader title="Espelho de Vendas" description="Módulo indisponível" />
        <EmptyState icon={LayoutGrid} title="Módulo do corretor desativado" description="Ative o módulo em Configurações → Imobiliária." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Espelho de Vendas" description="Escolha o empreendimento para ver o espelho em tempo real" />
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar empreendimento" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {isLoading ? (
        <LoadingSpinner />
      ) : list.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum empreendimento" description="Cadastre um empreendimento para começar" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <Link key={e.id} to="/espelho/$id" params={{ id: e.id }}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="truncate">{e.nome}</span>
                    <Badge variant="secondary">{e.status?.replaceAll("_", " ")}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <div>{[e.bairro, e.cidade].filter(Boolean).join(" · ") || "—"}</div>
                  <div className="flex gap-3">
                    <span>Total: {e.total_unidades ?? 0}</span>
                    <span>Disp.: {e.unidades_disponiveis ?? 0}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
