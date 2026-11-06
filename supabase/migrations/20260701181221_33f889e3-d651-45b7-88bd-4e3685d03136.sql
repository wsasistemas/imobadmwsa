
-- WhatsApp configuration per imobiliaria
CREATE TABLE public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL UNIQUE REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  waba_id TEXT,
  display_phone TEXT,
  verify_token TEXT,
  ativo BOOLEAN NOT NULL DEFAULT false,
  ia_default_ativa BOOLEAN NOT NULL DEFAULT true,
  ia_prompt TEXT DEFAULT 'Você é um assistente de uma imobiliária. Qualifique o lead com educação, descubra bairro/orçamento/prazo e ofereça agendar uma visita.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_config_select" ON public.whatsapp_config FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "wa_config_manage" ON public.whatsapp_config FOR ALL TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));
CREATE TRIGGER trg_wa_config_upd BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Conversations
CREATE TYPE public.wa_conv_status AS ENUM ('aberta','pausada','arquivada');
CREATE TABLE public.conversas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_contact_id TEXT NOT NULL,
  nome_contato TEXT,
  status public.wa_conv_status NOT NULL DEFAULT 'aberta',
  ia_ativa BOOLEAN NOT NULL DEFAULT true,
  ultima_mensagem TEXT,
  ultima_mensagem_at TIMESTAMPTZ,
  nao_lidas INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (imobiliaria_id, wa_contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversas_whatsapp TO authenticated;
GRANT ALL ON public.conversas_whatsapp TO service_role;
ALTER TABLE public.conversas_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conv_select" ON public.conversas_whatsapp FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "wa_conv_manage" ON public.conversas_whatsapp FOR ALL TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE TRIGGER trg_wa_conv_upd BEFORE UPDATE ON public.conversas_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_wa_conv_imob ON public.conversas_whatsapp(imobiliaria_id, ultima_mensagem_at DESC);

-- Messages
CREATE TYPE public.wa_msg_direction AS ENUM ('inbound','outbound');
CREATE TABLE public.mensagens_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.conversas_whatsapp(id) ON DELETE CASCADE,
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  direcao public.wa_msg_direction NOT NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'text',
  wa_message_id TEXT,
  from_ai BOOLEAN NOT NULL DEFAULT false,
  autor_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens_whatsapp TO authenticated;
GRANT ALL ON public.mensagens_whatsapp TO service_role;
ALTER TABLE public.mensagens_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_msg_select" ON public.mensagens_whatsapp FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "wa_msg_insert" ON public.mensagens_whatsapp FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE INDEX idx_wa_msg_conv ON public.mensagens_whatsapp(conversa_id, created_at);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas_whatsapp;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_whatsapp;
