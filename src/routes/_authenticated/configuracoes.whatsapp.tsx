import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ConfigTabs } from "@/components/configuracoes/ConfigTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsappConfig, useUpsertWhatsappConfig } from "@/hooks/useWhatsapp";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/whatsapp")({
  component: WhatsappConfig,
});

function WhatsappConfig() {
  const { usuario } = useAuth();
  const imobiliariaId = usuario?.imobiliariaId;
  const isGestor = usuario?.role === "gestor";
  const { data: cfg, isLoading } = useWhatsappConfig(imobiliariaId);
  const upsert = useUpsertWhatsappConfig();

  const [form, setForm] = useState({
    phone_number_id: "",
    waba_id: "",
    display_phone: "",
    ativo: false,
    ia_default_ativa: true,
    ia_prompt:
      "Você é um atendente de uma imobiliária. Seja cordial, qualifique o lead (bairro, orçamento, prazo) e proponha agendar visita. Respostas curtas para WhatsApp.",
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        phone_number_id: cfg.phone_number_id ?? "",
        waba_id: cfg.waba_id ?? "",
        display_phone: cfg.display_phone ?? "",
        ativo: cfg.ativo,
        ia_default_ativa: cfg.ia_default_ativa,
        ia_prompt: cfg.ia_prompt ?? "",
      });
    }
  }, [cfg]);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/webhooks/whatsapp`
      : "";

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };

  const handleSave = () => {
    if (!imobiliariaId) return;
    upsert.mutate({ imobiliaria_id: imobiliariaId, ...form });
  };

  return (
    <div>
      <PageHeader
        title="Robô WhatsApp"
        description="Conecte a WhatsApp Cloud API (Meta) e configure o atendimento com IA."
      />
      <ConfigTabs />

      {!isGestor && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> Apenas gestores podem editar esta configuração.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" /> Configuração Meta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Phone Number ID</Label>
              <Input
                value={form.phone_number_id}
                onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
                placeholder="Ex: 1234567890"
                disabled={!isGestor}
              />
            </div>
            <div>
              <Label>WABA ID</Label>
              <Input
                value={form.waba_id}
                onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                disabled={!isGestor}
              />
            </div>
            <div>
              <Label>Número exibido</Label>
              <Input
                value={form.display_phone}
                onChange={(e) => setForm({ ...form, display_phone: e.target.value })}
                placeholder="+55 11 99999-0000"
                disabled={!isGestor}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Integração ativa</div>
                <div className="text-xs text-muted-foreground">
                  Necessário para enviar/receber mensagens.
                </div>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                disabled={!isGestor}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">IA responde por padrão</div>
                <div className="text-xs text-muted-foreground">
                  Novas conversas iniciam com IA ligada.
                </div>
              </div>
              <Switch
                checked={form.ia_default_ativa}
                onCheckedChange={(v) => setForm({ ...form, ia_default_ativa: v })}
                disabled={!isGestor}
              />
            </div>
            <div>
              <Label>Prompt da IA</Label>
              <Textarea
                rows={6}
                value={form.ia_prompt}
                onChange={(e) => setForm({ ...form, ia_prompt: e.target.value })}
                disabled={!isGestor}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={!isGestor || upsert.isPending || isLoading}
              className="w-full"
            >
              {upsert.isPending ? "Salvando..." : "Salvar configuração"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Meta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Cadastre os dados abaixo no <b>Meta for Developers</b> → WhatsApp → Configuration → Webhooks.
            </p>
            <div>
              <Label>Callback URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} />
                <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Verify Token</Label>
              <div className="text-xs text-muted-foreground">
                Guardado em segredo no servidor (<code>WHATSAPP_VERIFY_TOKEN</code>). Peça ao gestor da conta Lovable.
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                <CheckCircle2 className="h-3 w-3" /> Assine os eventos:
              </div>
              <code>messages</code>, <code>message_status</code>
            </div>
            <p className="text-muted-foreground">
              O <b>Access Token</b> da Meta é armazenado como segredo <code>WHATSAPP_ACCESS_TOKEN</code> no servidor — nunca no banco.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
