
-- ENUMS
CREATE TYPE public.lead_score AS ENUM ('novo','frio','morno','quente','perdido','fechado');
CREATE TYPE public.estagio_funil AS ENUM ('novo_lead','em_qualificacao','qualificado','proposta_enviada','visita_agendada','em_negociacao','fechado_ganho','fechado_perdido');
CREATE TYPE public.origem_lead AS ENUM ('site','whatsapp','instagram','facebook','google_ads','indicacao','portal','outro');
CREATE TYPE public.tipo_atividade AS ENUM ('ligacao','whatsapp','email','visita','reuniao','nota');

-- LEADS
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  corretor_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  origem public.origem_lead NOT NULL DEFAULT 'outro',
  score public.lead_score NOT NULL DEFAULT 'novo',
  estagio public.estagio_funil NOT NULL DEFAULT 'novo_lead',
  interesse_empreendimento_id UUID,
  orcamento_min NUMERIC(12,2),
  orcamento_max NUMERIC(12,2),
  consentimento_lgpd BOOLEAN NOT NULL DEFAULT false,
  consentimento_data TIMESTAMPTZ,
  observacoes TEXT,
  ultima_interacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_imobiliaria ON public.leads(imobiliaria_id);
CREATE INDEX idx_leads_corretor ON public.leads(corretor_id);
CREATE INDEX idx_leads_estagio ON public.leads(estagio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS leads
CREATE POLICY "Ver leads da imobiliária"
  ON public.leads FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE POLICY "Criar leads na própria imobiliária"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE POLICY "Gestor edita qualquer lead da imobiliária"
  ON public.leads FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE POLICY "Corretor edita leads próprios"
  ON public.leads FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND corretor_id = auth.uid())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND corretor_id = auth.uid());

CREATE POLICY "Gestor exclui leads da imobiliária"
  ON public.leads FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'));

-- ATIVIDADES
CREATE TABLE public.atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo public.tipo_atividade NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  duracao_minutos INTEGER,
  concluida BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_atividades_lead ON public.atividades(lead_id);
CREATE INDEX idx_atividades_data ON public.atividades(data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atividades TO authenticated;
GRANT ALL ON public.atividades TO service_role;
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver atividades da imobiliária"
  ON public.atividades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = atividades.lead_id AND l.imobiliaria_id = public.get_my_imobiliaria_id()));

CREATE POLICY "Criar atividades na imobiliária"
  ON public.atividades FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.imobiliaria_id = public.get_my_imobiliaria_id())
  );

CREATE POLICY "Editar atividades próprias"
  ON public.atividades FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Excluir atividades próprias ou como gestor"
  ON public.atividades FOR DELETE TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.has_role(auth.uid(), 'gestor')
  );
