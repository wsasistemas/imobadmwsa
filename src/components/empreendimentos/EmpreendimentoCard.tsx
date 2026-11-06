import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2 } from "lucide-react";
import type { Empreendimento } from "@/types";
import { statusEmpreendimentoMeta } from "@/lib/empreendimentosMeta";
import { formatBRL } from "@/lib/utils";
import { useSignedUrls } from "@/hooks/useSignedUrls";

export function EmpreendimentoCard({ emp }: { emp: Empreendimento }) {
  const firstImg = emp.imagens?.[0];
  const { data: urls } = useSignedUrls(firstImg ? [firstImg] : []);
  const status = statusEmpreendimentoMeta(emp.status);

  return (
    <Link
      to="/empreendimentos/$id"
      params={{ id: emp.id }}
      className="group block"
    >
      <Card className="overflow-hidden transition-shadow hover:shadow-lg">
        <div className="relative aspect-[4/3] bg-muted">
          {firstImg && urls?.get(firstImg) ? (
            <img
              src={urls.get(firstImg)}
              alt={emp.nome}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Building2 className="h-12 w-12 text-muted-foreground/40" />
            </div>
          )}
          <Badge className={`absolute left-2 top-2 ${status.color} border-0 text-white`}>
            {status.label}
          </Badge>
        </div>
        <div className="p-4">
          <h3 className="truncate font-semibold">{emp.nome}</h3>
          {(emp.cidade || emp.bairro) && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {[emp.bairro, emp.cidade, emp.estado].filter(Boolean).join(", ")}
            </p>
          )}
          {emp.valor_a_partir_de && (
            <p className="mt-2 text-sm">
              <span className="text-xs text-muted-foreground">A partir de </span>
              <span className="font-semibold text-primary">
                {formatBRL(emp.valor_a_partir_de)}
              </span>
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
