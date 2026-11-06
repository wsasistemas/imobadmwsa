import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle, Send, Bot, User, Sparkles, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useConversas,
  useMensagens,
  useToggleIA,
  useMarcarLida,
} from "@/hooks/useWhatsapp";
import { useWhatsappRealtime } from "@/hooks/useWhatsappRealtime";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsappMessage, aiReplyWhatsapp, criarLeadDaConversa } from "@/lib/whatsapp.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsappInbox,
});

function WhatsappInbox() {
  const { usuario } = useAuth();
  const imobiliariaId = usuario?.imobiliariaId;
  useWhatsappRealtime(imobiliariaId);
  const { data: conversas = [], isLoading } = useConversas(imobiliariaId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversas.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Conversas ativas com atendimento humano e IA."
      />
      <div className="grid h-[calc(100vh-16rem)] grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="overflow-y-auto rounded-lg border bg-card">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : conversas.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={MessageCircle}
                title="Sem conversas"
                description="Configure o WhatsApp e receba a primeira mensagem."
              />
            </div>
          ) : (
            conversas.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b p-3 text-left transition-colors hover:bg-muted/50",
                  selectedId === c.id && "bg-muted",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">
                    {c.nome_contato ?? c.wa_contact_id}
                  </span>
                  {c.nao_lidas > 0 && (
                    <Badge className="h-5 px-1.5 text-[10px]">{c.nao_lidas}</Badge>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {c.ultima_mensagem ?? "—"}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {c.ia_ativa ? (
                    <>
                      <Bot className="h-3 w-3" /> IA
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3" /> Humano
                    </>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-lg border bg-card">
          {selected ? (
            <ConversationView conversa={selected} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={MessageCircle}
                title="Selecione uma conversa"
                description="Escolha um contato à esquerda para ver o histórico."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationView({
  conversa,
}: {
  conversa: NonNullable<ReturnType<typeof useConversas>["data"]>[number];
}) {
  const navigate = useNavigate();
  const { data: mensagens = [] } = useMensagens(conversa.id);
  const [texto, setTexto] = useState("");
  const toggleIA = useToggleIA();
  const marcarLida = useMarcarLida();
  const send = useServerFn(sendWhatsappMessage);
  const aiReply = useServerFn(aiReplyWhatsapp);
  const criarLead = useServerFn(criarLeadDaConversa);
  const [sending, setSending] = useState(false);
  const [askingAI, setAskingAI] = useState(false);

  const handleSend = async () => {
    if (!texto.trim()) return;
    setSending(true);
    try {
      await send({ data: { conversa_id: conversa.id, texto } });
      setTexto("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  };

  const handleAI = async () => {
    setAskingAI(true);
    try {
      await aiReply({ data: { conversa_id: conversa.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "IA falhou");
    } finally {
      setAskingAI(false);
    }
  };

  const handleCriarLead = async () => {
    try {
      const r = await criarLead({ data: { conversa_id: conversa.id } });
      toast.success("Lead criado");
      navigate({ to: "/leads/$id", params: { id: r.lead_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar lead");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b p-3">
        <div>
          <div className="font-medium">{conversa.nome_contato ?? conversa.wa_contact_id}</div>
          <div className="text-xs text-muted-foreground">{conversa.wa_contact_id}</div>
        </div>
        <div className="flex items-center gap-3">
          {!conversa.lead_id && (
            <Button variant="outline" size="sm" onClick={handleCriarLead}>
              <UserPlus className="mr-1 h-4 w-4" /> Criar lead
            </Button>
          )}
          {conversa.lead_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/leads/$id", params: { id: conversa.lead_id! } })}
            >
              Ver lead
            </Button>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4" /> IA
            <Switch
              checked={conversa.ia_ativa}
              onCheckedChange={(v) => toggleIA.mutate({ id: conversa.id, ativa: v })}
            />
          </div>
        </div>
      </div>

      <div
        className="flex-1 space-y-2 overflow-y-auto p-4"
        onFocus={() => conversa.nao_lidas > 0 && marcarLida.mutate(conversa.id)}
      >
        {mensagens.length === 0 && (
          <div className="text-center text-sm text-muted-foreground">Sem mensagens ainda.</div>
        )}
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.direcao === "outbound" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                m.direcao === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {m.from_ai && (
                <div className="mb-1 flex items-center gap-1 text-[10px] opacity-70">
                  <Bot className="h-3 w-3" /> IA
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.conteudo}</div>
              <div className="mt-1 text-right text-[10px] opacity-60">
                {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAI}
          disabled={askingAI}
          title="Sugerir resposta com IA"
        >
          <Sparkles className={cn("h-4 w-4", askingAI && "animate-pulse")} />
        </Button>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Digite uma mensagem..."
          disabled={sending}
        />
        <Button onClick={handleSend} disabled={sending || !texto.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
