import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EmptyState } from "@/components/EmptyState";
import { EmpreendimentoForm } from "@/components/empreendimentos/EmpreendimentoForm";
import { useEmpreendimento } from "@/hooks/useEmpreendimentos";

export const Route = createFileRoute("/_authenticated/empreendimentos/$id/editar")({
  component: EditarEmpreendimento,
});

function EditarEmpreendimento() {
  const { id } = Route.useParams();
  const { data: emp, isLoading } = useEmpreendimento(id);

  return (
    <div>
      <PageHeader
        title={emp ? `Editar: ${emp.nome}` : "Editar empreendimento"}
        action={
          <Button asChild variant="outline">
            <Link to="/empreendimentos/$id" params={{ id }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <LoadingSpinner />
      ) : !emp ? (
        <EmptyState title="Empreendimento não encontrado" />
      ) : (
        <EmpreendimentoForm empreendimento={emp} />
      )}
    </div>
  );
}
