import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmpreendimentoForm } from "@/components/empreendimentos/EmpreendimentoForm";

export const Route = createFileRoute("/_authenticated/empreendimentos/novo")({
  component: NovoEmpreendimento,
});

function NovoEmpreendimento() {
  return (
    <div>
      <PageHeader
        title="Novo empreendimento"
        description="Cadastro de lançamento no catálogo."
        action={
          <Button asChild variant="outline">
            <Link to="/empreendimentos">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      <EmpreendimentoForm />
    </div>
  );
}
