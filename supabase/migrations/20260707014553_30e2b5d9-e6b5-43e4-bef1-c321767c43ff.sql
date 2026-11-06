
-- ============================================================
-- MÓDULO CORRETOR v2 - Fases 9-14
-- ============================================================

-- 1) FEATURE FLAG + CRECI
ALTER TABLE public.imobiliarias
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS creci text;

-- 2) ENUMS
DO $$ BEGIN
  CREATE TYPE public.unidade_status AS ENUM ('disponivel','reservada','vendida','bloqueada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reserva_status AS ENUM ('ativa','expirada','convertida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.venda_etapa AS ENUM ('proposta_aceita','analise_credito','assinatura','repasse','registro','chaves');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.etapa_status AS ENUM ('pendente','em_andamento','concluida','travada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.documento_status AS ENUM ('pendente','enviado','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.comissao_status AS ENUM ('prevista','liberada','paga');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cobranca_acao AS ENUM ('email','whatsapp','ligacao','acordo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3) UNIDADES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  empreendimento_id uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  tipologia_id uuid REFERENCES public.tipologias(id) ON DELETE SET NULL,
  bloco text,
  numero text NOT NULL,
  andar int,
  area_m2 numeric,
  preco numeric,
  status public.unidade_status NOT NULL DEFAULT 'disponivel',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empreendimento_id, bloco, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unidades_select" ON public.unidades FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "unidades_insert" ON public.unidades FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));
CREATE POLICY "unidades_update" ON public.unidades FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));
CREATE POLICY "unidades_delete" ON public.unidades FOR DELETE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.unidades REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.unidades;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 4) RESERVAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.usuarios(id),
  status public.reserva_status NOT NULL DEFAULT 'ativa',
  expira_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;
GRANT ALL ON public.reservas TO service_role;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservas_select" ON public.reservas FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(),'gestor') OR corretor_id = auth.uid()));
CREATE POLICY "reservas_insert" ON public.reservas FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "reservas_update" ON public.reservas FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(),'gestor') OR corretor_id = auth.uid()));

CREATE TRIGGER trg_reservas_updated BEFORE UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_reservas_unidade_ativa ON public.reservas(unidade_id) WHERE status = 'ativa';

-- ============================================================
-- 5) SIMULACOES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.simulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  empreendimento_id uuid REFERENCES public.empreendimentos(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.usuarios(id),
  preco_tabela numeric,
  preco_proposto numeric,
  entrada numeric,
  parcelas int,
  taxa_juros numeric,
  dentro_politica boolean,
  justificativa text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulacoes TO authenticated;
GRANT ALL ON public.simulacoes TO service_role;
ALTER TABLE public.simulacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simulacoes_select" ON public.simulacoes FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "simulacoes_insert" ON public.simulacoes FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "simulacoes_update" ON public.simulacoes FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE TRIGGER trg_simulacoes_updated BEFORE UPDATE ON public.simulacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 6) POLITICAS COMERCIAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.politicas_comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  empreendimento_id uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  desconto_max_pct numeric NOT NULL DEFAULT 0,
  entrada_min_pct numeric NOT NULL DEFAULT 0,
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  vigente_de date NOT NULL DEFAULT CURRENT_DATE,
  vigente_ate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.politicas_comerciais TO authenticated;
GRANT ALL ON public.politicas_comerciais TO service_role;
ALTER TABLE public.politicas_comerciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "politicas_select" ON public.politicas_comerciais FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());
CREATE POLICY "politicas_write" ON public.politicas_comerciais FOR ALL TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_politicas_updated BEFORE UPDATE ON public.politicas_comerciais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7) VENDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  reserva_id uuid REFERENCES public.reservas(id) ON DELETE SET NULL,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  corretor_id uuid NOT NULL REFERENCES public.usuarios(id),
  valor numeric NOT NULL,
  assinada_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendas_select" ON public.vendas FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(),'gestor') OR corretor_id = auth.uid()));
CREATE POLICY "vendas_write_gestor" ON public.vendas FOR ALL TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_vendas_updated BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 8) COMISSOES + PARCELAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.usuarios(id),
  percentual numeric NOT NULL,
  valor numeric NOT NULL,
  status public.comissao_status NOT NULL DEFAULT 'prevista',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes TO authenticated;
GRANT ALL ON public.comissoes TO service_role;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissoes_select" ON public.comissoes FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(),'gestor') OR corretor_id = auth.uid()));
CREATE POLICY "comissoes_write_gestor" ON public.comissoes FOR ALL TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_comissoes_updated BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.comissao_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes(id) ON DELETE CASCADE,
  numero int NOT NULL,
  vencimento date NOT NULL,
  valor numeric NOT NULL,
  status public.comissao_status NOT NULL DEFAULT 'prevista',
  pago_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_parcelas TO authenticated;
GRANT ALL ON public.comissao_parcelas TO service_role;
ALTER TABLE public.comissao_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parcelas_select" ON public.comissao_parcelas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.id = comissao_id
      AND c.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR c.corretor_id = auth.uid())
  ));
CREATE POLICY "parcelas_write_gestor" ON public.comissao_parcelas FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.id = comissao_id
      AND c.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.id = comissao_id
      AND c.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ));

CREATE TRIGGER trg_parcelas_updated BEFORE UPDATE ON public.comissao_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9) VENDA ETAPAS + DOCUMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venda_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  etapa public.venda_etapa NOT NULL,
  ordem int NOT NULL,
  status public.etapa_status NOT NULL DEFAULT 'pendente',
  responsavel_id uuid REFERENCES public.usuarios(id),
  prazo date,
  motivo_travamento text,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venda_id, etapa)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_etapas TO authenticated;
GRANT ALL ON public.venda_etapas TO service_role;
ALTER TABLE public.venda_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapas_select" ON public.venda_etapas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ));
CREATE POLICY "etapas_write" ON public.venda_etapas FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ));

CREATE TRIGGER trg_etapas_updated BEFORE UPDATE ON public.venda_etapas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.documentos_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  etapa public.venda_etapa NOT NULL,
  tipo text NOT NULL,
  arquivo_url text,
  status public.documento_status NOT NULL DEFAULT 'pendente',
  observacoes text,
  enviado_por uuid REFERENCES public.usuarios(id),
  aprovado_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_venda TO authenticated;
GRANT ALL ON public.documentos_venda TO service_role;
ALTER TABLE public.documentos_venda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs_select" ON public.documentos_venda FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ));
CREATE POLICY "docs_write" ON public.documentos_venda FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND (public.has_role(auth.uid(),'gestor') OR v.corretor_id = auth.uid())
  ));

CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON public.documentos_venda
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 10) COBRANCA COMISSAO + PORTAL TOKENS + AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cobranca_comissao_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  acao public.cobranca_acao NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cobranca_comissao_acoes TO authenticated;
GRANT ALL ON public.cobranca_comissao_acoes TO service_role;
ALTER TABLE public.cobranca_comissao_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cobranca_select" ON public.cobranca_comissao_acoes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.id = comissao_id AND c.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ));
CREATE POLICY "cobranca_insert" ON public.cobranca_comissao_acoes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.id = comissao_id AND c.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ));

CREATE TABLE IF NOT EXISTS public.portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  created_by uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_tokens TO authenticated;
GRANT ALL ON public.portal_tokens TO service_role;
ALTER TABLE public.portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_tokens_gestor" ON public.portal_tokens FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.imobiliaria_id = public.get_my_imobiliaria_id()
      AND public.has_role(auth.uid(),'gestor')
  ));

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id),
  acao text NOT NULL,
  entidade text,
  entidade_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_gestor" ON public.audit_logs FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(),'gestor'));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());

-- ============================================================
-- 11) VIEW: AGING DE COMISSOES
-- ============================================================
CREATE OR REPLACE VIEW public.vw_aging_comissoes AS
SELECT
  c.imobiliaria_id,
  co.nome AS construtora,
  CASE
    WHEN cp.vencimento >= CURRENT_DATE THEN 'a_vencer'
    WHEN CURRENT_DATE - cp.vencimento <= 30 THEN 'ate_30d'
    WHEN CURRENT_DATE - cp.vencimento <= 60 THEN 'ate_60d'
    ELSE 'acima_60d'
  END AS faixa,
  COUNT(cp.id) AS parcelas,
  COALESCE(SUM(cp.valor), 0) AS total
FROM public.comissao_parcelas cp
JOIN public.comissoes c ON c.id = cp.comissao_id
JOIN public.vendas v ON v.id = c.venda_id
JOIN public.unidades u ON u.id = v.unidade_id
JOIN public.empreendimentos e ON e.id = u.empreendimento_id
LEFT JOIN public.construtoras co ON co.id = e.construtora_id
WHERE cp.status <> 'paga'
GROUP BY c.imobiliaria_id, co.nome,
  CASE
    WHEN cp.vencimento >= CURRENT_DATE THEN 'a_vencer'
    WHEN CURRENT_DATE - cp.vencimento <= 30 THEN 'ate_30d'
    WHEN CURRENT_DATE - cp.vencimento <= 60 THEN 'ate_60d'
    ELSE 'acima_60d'
  END;

GRANT SELECT ON public.vw_aging_comissoes TO authenticated;

-- ============================================================
-- 12) RPCs DE NEGOCIO
-- ============================================================

-- reservar_unidade: atomica, checa disponibilidade
CREATE OR REPLACE FUNCTION public.reservar_unidade(
  p_unidade_id uuid,
  p_lead_id uuid,
  p_horas_validade numeric DEFAULT 24
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reserva_id uuid;
  v_imob_id uuid;
  v_status public.unidade_status;
BEGIN
  SELECT imobiliaria_id, status INTO v_imob_id, v_status
  FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;

  IF v_imob_id IS NULL THEN
    RAISE EXCEPTION 'UNIDADE_INEXISTENTE';
  END IF;

  IF v_status <> 'disponivel' THEN
    RAISE EXCEPTION 'UNIDADE_INDISPONIVEL';
  END IF;

  INSERT INTO public.reservas (imobiliaria_id, unidade_id, lead_id, corretor_id, expira_em)
  VALUES (v_imob_id, p_unidade_id, p_lead_id, auth.uid(),
          now() + (p_horas_validade || ' hours')::interval)
  RETURNING id INTO v_reserva_id;

  UPDATE public.unidades SET status = 'reservada' WHERE id = p_unidade_id;

  INSERT INTO public.atividades (lead_id, usuario_id, tipo, titulo, data, concluida)
  VALUES (p_lead_id, auth.uid(), 'nota', 'Unidade reservada', now(), true);

  RETURN v_reserva_id;
END $$;

-- converter_reserva_em_venda
CREATE OR REPLACE FUNCTION public.converter_reserva_em_venda(
  p_reserva_id uuid,
  p_valor numeric,
  p_percentual_comissao numeric DEFAULT 2.0,
  p_num_parcelas int DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_venda_id uuid;
  v_comissao_id uuid;
  v_reserva RECORD;
  v_valor_comissao numeric;
  v_valor_parcela numeric;
  v_i int;
BEGIN
  SELECT * INTO v_reserva FROM public.reservas
  WHERE id = p_reserva_id AND status = 'ativa' FOR UPDATE;

  IF v_reserva IS NULL THEN
    RAISE EXCEPTION 'RESERVA_INVALIDA';
  END IF;

  INSERT INTO public.vendas (imobiliaria_id, reserva_id, unidade_id, lead_id, corretor_id, valor)
  VALUES (v_reserva.imobiliaria_id, v_reserva.id, v_reserva.unidade_id, v_reserva.lead_id, v_reserva.corretor_id, p_valor)
  RETURNING id INTO v_venda_id;

  UPDATE public.reservas SET status = 'convertida' WHERE id = p_reserva_id;
  UPDATE public.unidades SET status = 'vendida' WHERE id = v_reserva.unidade_id;
  UPDATE public.leads SET estagio = 'fechado_ganho', score = 'fechado' WHERE id = v_reserva.lead_id;

  v_valor_comissao := round(p_valor * p_percentual_comissao / 100.0, 2);
  INSERT INTO public.comissoes (imobiliaria_id, venda_id, corretor_id, percentual, valor)
  VALUES (v_reserva.imobiliaria_id, v_venda_id, v_reserva.corretor_id, p_percentual_comissao, v_valor_comissao)
  RETURNING id INTO v_comissao_id;

  v_valor_parcela := round(v_valor_comissao / p_num_parcelas, 2);
  FOR v_i IN 1..p_num_parcelas LOOP
    INSERT INTO public.comissao_parcelas (comissao_id, numero, vencimento, valor)
    VALUES (
      v_comissao_id, v_i,
      (CURRENT_DATE + (v_i * INTERVAL '30 days'))::date,
      CASE WHEN v_i = p_num_parcelas
           THEN v_valor_comissao - (v_valor_parcela * (p_num_parcelas - 1))
           ELSE v_valor_parcela END
    );
  END LOOP;

  INSERT INTO public.atividades (lead_id, usuario_id, tipo, titulo, data, concluida)
  VALUES (v_reserva.lead_id, auth.uid(), 'nota', 'Venda convertida', now(), true);

  RETURN v_venda_id;
END $$;

-- Trigger cria 6 etapas ao inserir venda
CREATE OR REPLACE FUNCTION public.criar_etapas_venda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.venda_etapas (venda_id, etapa, ordem, status) VALUES
    (NEW.id, 'proposta_aceita', 1, 'concluida'),
    (NEW.id, 'analise_credito', 2, 'pendente'),
    (NEW.id, 'assinatura', 3, 'pendente'),
    (NEW.id, 'repasse', 4, 'pendente'),
    (NEW.id, 'registro', 5, 'pendente'),
    (NEW.id, 'chaves', 6, 'pendente');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_criar_etapas ON public.vendas;
CREATE TRIGGER trg_criar_etapas AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.criar_etapas_venda();

-- validar_politica_comercial
CREATE OR REPLACE FUNCTION public.validar_politica_comercial(
  p_empreendimento_id uuid,
  p_preco_tabela numeric,
  p_preco_proposto numeric,
  p_entrada numeric
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_politica RECORD;
  v_erros text[] := ARRAY[]::text[];
  v_desconto_pct numeric;
  v_entrada_pct numeric;
BEGIN
  SELECT * INTO v_politica FROM public.politicas_comerciais
  WHERE empreendimento_id = p_empreendimento_id
    AND vigente_de <= CURRENT_DATE
    AND (vigente_ate IS NULL OR vigente_ate >= CURRENT_DATE)
  ORDER BY vigente_de DESC LIMIT 1;

  IF v_politica IS NULL THEN
    RETURN jsonb_build_object('valida', true, 'erros', v_erros);
  END IF;

  IF p_preco_tabela > 0 THEN
    v_desconto_pct := ((p_preco_tabela - p_preco_proposto) / p_preco_tabela) * 100;
    IF v_desconto_pct > v_politica.desconto_max_pct THEN
      v_erros := array_append(v_erros,
        format('Desconto de %.2f%% excede o máximo permitido de %.2f%%', v_desconto_pct, v_politica.desconto_max_pct));
    END IF;
  END IF;

  IF p_preco_proposto > 0 THEN
    v_entrada_pct := (p_entrada / p_preco_proposto) * 100;
    IF v_entrada_pct < v_politica.entrada_min_pct THEN
      v_erros := array_append(v_erros,
        format('Entrada de %.2f%% abaixo do mínimo exigido de %.2f%%', v_entrada_pct, v_politica.entrada_min_pct));
    END IF;
  END IF;

  RETURN jsonb_build_object('valida', array_length(v_erros, 1) IS NULL, 'erros', v_erros);
END $$;

-- expirar_reservas
CREATE OR REPLACE FUNCTION public.expirar_reservas()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  WITH exp AS (
    UPDATE public.reservas SET status = 'expirada'
    WHERE status = 'ativa' AND expira_em < now()
    RETURNING unidade_id
  )
  UPDATE public.unidades u SET status = 'disponivel'
  FROM exp WHERE u.id = exp.unidade_id AND u.status = 'reservada';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ============================================================
-- 13) PG_CRON: expiracao a cada 5 min
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('expirar-reservas');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'expirar-reservas',
  '*/5 * * * *',
  $$ SELECT public.expirar_reservas(); $$
);
