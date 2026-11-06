
-- Enum de status
DO $$ BEGIN
  CREATE TYPE public.status_visita AS ENUM ('agendada','confirmada','realizada','cancelada','nao_compareceu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE public.visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  empreendimento_id UUID REFERENCES public.empreendimentos(id) ON DELETE SET NULL,
  corretor_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  data_hora TIMESTAMPTZ NOT NULL,
  duracao_min INT NOT NULL DEFAULT 60,
  status public.status_visita NOT NULL DEFAULT 'agendada',
  observacoes TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visitas_imob_data ON public.visitas(imobiliaria_id, data_hora);
CREATE INDEX idx_visitas_corretor_data ON public.visitas(corretor_id, data_hora);
CREATE INDEX idx_visitas_lead ON public.visitas(lead_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas TO authenticated;
GRANT ALL ON public.visitas TO service_role;

-- RLS
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitas_select" ON public.visitas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(), 'gestor') OR corretor_id = auth.uid())
  );

CREATE POLICY "visitas_insert" ON public.visitas
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(), 'gestor') OR corretor_id = auth.uid())
  );

CREATE POLICY "visitas_update" ON public.visitas
  FOR UPDATE TO authenticated
  USING (
    imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(), 'gestor') OR corretor_id = auth.uid())
  )
  WITH CHECK (
    imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(), 'gestor') OR corretor_id = auth.uid())
  );

CREATE POLICY "visitas_delete" ON public.visitas
  FOR DELETE TO authenticated
  USING (
    imobiliaria_id = public.get_my_imobiliaria_id()
    AND (public.has_role(auth.uid(), 'gestor') OR corretor_id = auth.uid())
  );

-- Trigger updated_at
CREATE TRIGGER trg_visitas_updated
  BEFORE UPDATE ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: ao mudar para 'realizada', registra atividade
CREATE OR REPLACE FUNCTION public.visita_gera_atividade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_titulo TEXT;
  v_emp TEXT;
BEGIN
  IF NEW.status = 'realizada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'realizada') THEN
    SELECT nome INTO v_emp FROM public.empreendimentos WHERE id = NEW.empreendimento_id;
    v_titulo := 'Visita realizada' || COALESCE(' — ' || v_emp, '');
    INSERT INTO public.atividades (lead_id, usuario_id, tipo, titulo, descricao, data, concluida)
    VALUES (NEW.lead_id, NEW.corretor_id, 'visita', v_titulo, COALESCE(NEW.feedback, NEW.observacoes), NEW.data_hora, TRUE);
    UPDATE public.leads SET ultima_interacao = NEW.data_hora WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_visita_atividade
  AFTER INSERT OR UPDATE OF status ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.visita_gera_atividade();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitas;
