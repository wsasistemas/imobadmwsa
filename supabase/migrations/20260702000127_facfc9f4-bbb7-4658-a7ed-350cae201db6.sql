
-- Enum de tipos
CREATE TYPE public.tipo_notificacao AS ENUM ('visita_lembrete', 'lead_quente_parado', 'sistema');

-- Tabela
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  tipo public.tipo_notificacao NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  link TEXT,
  referencia_id UUID,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificacoes_usuario_lida ON public.notificacoes (usuario_id, lida, created_at DESC);
CREATE INDEX idx_notificacoes_ref ON public.notificacoes (tipo, referencia_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_ve_proprias_notificacoes"
  ON public.notificacoes FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR (public.has_role(auth.uid(), 'gestor') AND imobiliaria_id = public.get_my_imobiliaria_id()));

CREATE POLICY "usuario_atualiza_proprias_notificacoes"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario_deleta_proprias_notificacoes"
  ON public.notificacoes FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "gestor_insere_notificacoes"
  ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE TRIGGER trg_notificacoes_updated_at
  BEFORE UPDATE ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- Função de automação (chamada por cron)
CREATE OR REPLACE FUNCTION public.gerar_automacoes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lembretes INT := 0;
  v_alertas INT := 0;
BEGIN
  -- 1) Lembretes de visita: agendadas para o próximo intervalo (agora .. agora+70min)
  --    evita duplicar se já existe lembrete para a mesma visita.
  WITH candidatas AS (
    SELECT v.id, v.corretor_id, v.imobiliaria_id, v.data_hora, v.lead_id,
           e.nome AS emp_nome, l.nome AS lead_nome
    FROM public.visitas v
    LEFT JOIN public.empreendimentos e ON e.id = v.empreendimento_id
    LEFT JOIN public.leads l ON l.id = v.lead_id
    WHERE v.status = 'agendada'
      AND v.data_hora BETWEEN now() AND now() + INTERVAL '70 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.tipo = 'visita_lembrete' AND n.referencia_id = v.id
      )
  ), ins AS (
    INSERT INTO public.notificacoes (usuario_id, imobiliaria_id, tipo, titulo, descricao, link, referencia_id)
    SELECT corretor_id, imobiliaria_id, 'visita_lembrete',
           'Visita em breve: ' || COALESCE(lead_nome, 'Lead'),
           COALESCE('Empreendimento ' || emp_nome || ' às ' || to_char(data_hora, 'HH24:MI'),
                    'Visita agendada às ' || to_char(data_hora, 'HH24:MI')),
           '/agenda', id
    FROM candidatas
    RETURNING 1
  )
  SELECT count(*) INTO v_lembretes FROM ins;

  -- 2) Alertas de lead quente parado há mais de 24h
  WITH candidatos AS (
    SELECT l.id, l.corretor_id, l.imobiliaria_id, l.nome
    FROM public.leads l
    WHERE l.score = 'quente'
      AND l.estagio NOT IN ('fechado_ganho', 'fechado_perdido')
      AND COALESCE(l.ultima_interacao, l.created_at) < now() - INTERVAL '24 hours'
      AND l.corretor_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.tipo = 'lead_quente_parado'
          AND n.referencia_id = l.id
          AND n.created_at > now() - INTERVAL '24 hours'
      )
  ), ins AS (
    INSERT INTO public.notificacoes (usuario_id, imobiliaria_id, tipo, titulo, descricao, link, referencia_id)
    SELECT corretor_id, imobiliaria_id, 'lead_quente_parado',
           'Lead quente sem contato: ' || nome,
           'Este lead está quente e sem interação há mais de 24h.',
           '/leads/' || id::text, id
    FROM candidatos
    RETURNING 1
  )
  SELECT count(*) INTO v_alertas FROM ins;

  RETURN jsonb_build_object('lembretes', v_lembretes, 'alertas', v_alertas);
END $$;

REVOKE ALL ON FUNCTION public.gerar_automacoes() FROM public;
GRANT EXECUTE ON FUNCTION public.gerar_automacoes() TO service_role;
