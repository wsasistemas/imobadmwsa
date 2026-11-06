import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ConfigTabs } from "@/components/configuracoes/ConfigTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import { useImobiliaria, useUpdateImobiliaria } from "@/hooks/useImobiliaria";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: ConfiguracoesIndex,
});

function ConfiguracoesIndex() {
  const { usuario } = useAuth();
  const { data: imob, isLoading } = useImobiliaria(usuario?.imobiliariaId);
  const update = useUpdateImobiliaria();
  const isGestor = usuario?.role === "gestor";

  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    telefone: "",
    email: "",
    cor_primaria: "#1B4F72",
  });

  useEffect(() => {
    if (imob) {
      setForm({
        nome: imob.nome ?? "",
        cnpj: imob.cnpj ?? "",
        telefone: imob.telefone ?? "",
        email: imob.email ?? "",
        cor_primaria: imob.cor_primaria ?? "#1B4F72",
      });
    }
  }, [imob]);

  const handleSave = async () => {
    if (!imob) return;
    await update.mutateAsync({
      id: imob.id,
      nome: form.nome.trim() || imob.nome,
      cnpj: form.cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cor_primaria: form.cor_primaria || null,
    });
  };

  return (
    <div>
      <PageHeader title="Configurações" description="Ajuste sua imobiliária, equipe e integrações." />
      <ConfigTabs />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <Card className="card-radius max-w-2xl">
          <CardHeader>
            <CardTitle>Perfil da imobiliária</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Nome fantasia *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                disabled={!isGestor}
                maxLength={120}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  disabled={!isGestor}
                  maxLength={18}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  disabled={!isGestor}
                  maxLength={20}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>E-mail de contato</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!isGestor}
                  maxLength={255}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Cor da marca</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-10 w-16 p-1"
                    value={form.cor_primaria}
                    onChange={(e) => setForm({ ...form, cor_primaria: e.target.value })}
                    disabled={!isGestor}
                  />
                  <Input
                    value={form.cor_primaria}
                    onChange={(e) => setForm({ ...form, cor_primaria: e.target.value })}
                    disabled={!isGestor}
                    maxLength={16}
                  />
                </div>
              </div>
            </div>
            {isGestor && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={update.isPending}>
                  Salvar alterações
                </Button>
              </div>
            )}
            {!isGestor && (
              <p className="text-xs text-muted-foreground">
                Apenas gestores podem alterar o perfil da imobiliária.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
