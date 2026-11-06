
-- ============ ENUMS ============
CREATE TYPE public.status_empreendimento AS ENUM (
  'em_lancamento', 'em_obras', 'pronto_para_morar', 'entregue', 'esgotado'
);

CREATE TYPE public.status_tipologia AS ENUM (
  'disponivel', 'reservada', 'vendida', 'bloqueada'
);

-- ============ CONSTRUTORAS ============
CREATE TABLE public.construtoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  contato_nome TEXT,
  contato_email TEXT,
  contato_telefone TEXT,
  comissao_percentual NUMERIC(5,2),
  observacoes TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.construtoras TO authenticated;
GRANT ALL ON public.construtoras TO service_role;
ALTER TABLE public.construtoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "construtoras_select" ON public.construtoras FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "construtoras_insert" ON public.construtoras FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "construtoras_update" ON public.construtoras FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "construtoras_delete" ON public.construtoras FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_construtoras_updated_at
  BEFORE UPDATE ON public.construtoras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_construtoras_imob ON public.construtoras(imobiliaria_id);

-- ============ EMPREENDIMENTOS ============
CREATE TABLE public.empreendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  construtora_id UUID REFERENCES public.construtoras(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  status public.status_empreendimento NOT NULL DEFAULT 'em_lancamento',
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  valor_a_partir_de NUMERIC(14,2),
  entrega_prevista DATE,
  total_unidades INTEGER,
  unidades_disponiveis INTEGER,
  diferenciais JSONB DEFAULT '[]'::jsonb,
  imagens JSONB DEFAULT '[]'::jsonb,
  plantas JSONB DEFAULT '[]'::jsonb,
  video_url TEXT,
  tour_360_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empreendimentos TO authenticated;
GRANT ALL ON public.empreendimentos TO service_role;
ALTER TABLE public.empreendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emp_select" ON public.empreendimentos FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "emp_insert" ON public.empreendimentos FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "emp_update" ON public.empreendimentos FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "emp_delete" ON public.empreendimentos FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_emp_updated_at
  BEFORE UPDATE ON public.empreendimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_emp_imob ON public.empreendimentos(imobiliaria_id);
CREATE INDEX idx_emp_construtora ON public.empreendimentos(construtora_id);
CREATE INDEX idx_emp_status ON public.empreendimentos(status);

-- ============ TIPOLOGIAS ============
CREATE TABLE public.tipologias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  area_privativa NUMERIC(8,2),
  area_total NUMERIC(8,2),
  quartos INTEGER,
  suites INTEGER,
  banheiros INTEGER,
  vagas INTEGER,
  valor NUMERIC(14,2),
  status public.status_tipologia NOT NULL DEFAULT 'disponivel',
  planta_url TEXT,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipologias TO authenticated;
GRANT ALL ON public.tipologias TO service_role;
ALTER TABLE public.tipologias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tip_select" ON public.tipologias FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "tip_insert" ON public.tipologias FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "tip_update" ON public.tipologias FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "tip_delete" ON public.tipologias FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE TRIGGER trg_tip_updated_at
  BEFORE UPDATE ON public.tipologias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tip_emp ON public.tipologias(empreendimento_id);

-- ============ CONDIÇÕES DE PAGAMENTO ============
CREATE TABLE public.condicoes_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  entrada_percentual NUMERIC(5,2),
  parcelas_obra INTEGER,
  parcelas_pos_chaves INTEGER,
  financiamento_bancario BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.condicoes_pagamento TO authenticated;
GRANT ALL ON public.condicoes_pagamento TO service_role;
ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cond_select" ON public.condicoes_pagamento FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "cond_insert" ON public.condicoes_pagamento FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "cond_update" ON public.condicoes_pagamento FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id())
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "cond_delete" ON public.condicoes_pagamento FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE TRIGGER trg_cond_updated_at
  BEFORE UPDATE ON public.condicoes_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_cond_emp ON public.condicoes_pagamento(empreendimento_id);

-- ============ FK leads.interesse_empreendimento_id + motivo perdido ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS motivo_perdido TEXT;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_interesse_empreendimento_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_interesse_empreendimento_id_fkey
  FOREIGN KEY (interesse_empreendimento_id)
  REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
