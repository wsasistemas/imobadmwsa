-- =====================================================================================
-- ImobAdm — origem da venda no cadastro da empresa (aditiva). Toda empresa nova diz de onde veio:
--   * de um lead que já está em Leads & Contatos → o negócio dele é ligado à empresa e vai para Ganho;
--   * de outra origem (indicação, prospecção, evento...) → nasce um contato e um negócio já em Ganho.
-- Assim os Relatórios Comerciais contam a venda e a receita na origem certa.
-- =====================================================================================

ALTER TABLE comercial.negocios ADD COLUMN IF NOT EXISTS origem_venda text
  CHECK (origem_venda IS NULL OR origem_venda IN ('site', 'instagram', 'facebook', 'linkedin', 'tiktok', 'whatsapp',
                                                  'indicacao', 'prospeccao', 'evento', 'parceiro', 'cliente_antigo', 'outro'));

-- Receita do negócio ganho = soma dos vínculos ativos da empresa.
CREATE FUNCTION adm.valor_do_negocio_ganho() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_empresa uuid := coalesce(NEW.empresa_id, OLD.empresa_id);
BEGIN
  UPDATE comercial.negocios n
     SET valor_mensal_previsto = (SELECT coalesce(sum(v.valor_mensal), 0) FROM adm.vinculos v WHERE v.empresa_id = v_empresa AND v.ativo)
   WHERE n.empresa_id = v_empresa AND n.etapa_id IN (SELECT e.id FROM comercial.etapas e WHERE e.ganho);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_vinculos_valor_negocio AFTER INSERT OR UPDATE OF valor_mensal, ativo OR DELETE ON adm.vinculos
  FOR EACH ROW EXECUTE FUNCTION adm.valor_do_negocio_ganho();

CREATE FUNCTION public.adm_empresa_origem(p_empresa uuid, p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_e adm.empresas;
  v_negocio uuid := nullif(p ->> 'negocio_id', '')::uuid;
  v_origem text := nullif(p ->> 'origem', '');
  v_contato uuid;
  v_whats text;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = p_empresa;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  IF v_e.negocio_id IS NOT NULL THEN RAISE EXCEPTION 'Esta empresa já tem a origem da venda registrada.'; END IF;

  IF v_negocio IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM comercial.negocios n WHERE n.id = v_negocio) THEN RAISE EXCEPTION 'Lead não encontrado.'; END IF;
    IF EXISTS (SELECT 1 FROM comercial.negocios n WHERE n.id = v_negocio AND n.empresa_id IS NOT NULL AND n.empresa_id <> p_empresa) THEN
      RAISE EXCEPTION 'Este lead já virou outra empresa.';
    END IF;
  ELSE
    IF v_origem IS NULL OR v_origem NOT IN ('site', 'instagram', 'facebook', 'linkedin', 'tiktok', 'whatsapp',
                                            'indicacao', 'prospeccao', 'evento', 'parceiro', 'cliente_antigo', 'outro') THEN
      RAISE EXCEPTION 'Informe de onde veio a venda.';
    END IF;
    v_whats := nullif(pg_catalog.regexp_replace(coalesce(v_e.comprador_whatsapp, v_e.whatsapp, ''), '\D', '', 'g'), '');
    IF v_whats !~ '^[0-9]{10,15}$' THEN v_whats := NULL; END IF;
    IF v_whats IS NULL AND coalesce(v_e.comprador_email, v_e.email_financeiro, '') = '' THEN
      RAISE EXCEPTION 'Preencha o e-mail ou o WhatsApp do comprador para registrar a origem da venda.';
    END IF;
    INSERT INTO comercial.contatos (nome, whatsapp, email, empresa_nome, cargo, origem, campanha)
    VALUES (coalesce(v_e.comprador_nome, v_e.dono_nome, coalesce(v_e.nome_fantasia, v_e.razao_social)), v_whats,
            nullif(lower(coalesce(v_e.comprador_email, v_e.email_financeiro, '')), ''), coalesce(v_e.nome_fantasia, v_e.razao_social),
            v_e.comprador_cargo, CASE WHEN v_origem IN ('site', 'instagram', 'facebook', 'linkedin', 'tiktok', 'whatsapp') THEN v_origem ELSE 'manual' END,
            nullif(p ->> 'detalhe', ''))
    RETURNING id INTO v_contato;
    INSERT INTO comercial.negocios (contato_id, etapa_id, sistemas, token_agenda, boas_vindas, origem_venda)
    VALUES (v_contato, (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'novo_lead'),
            coalesce((SELECT pg_catalog.array_agg(DISTINCT v.app) FROM adm.vinculos v WHERE v.empresa_id = p_empresa), '{}'),
            comercial.novo_token(), 'nao_enviar', v_origem)
    RETURNING id INTO v_negocio;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
    VALUES (v_negocio, 'sistema', 'Venda registrada no cadastro da empresa', pg_catalog.jsonb_build_object('origem', v_origem, 'detalhe', p ->> 'detalhe'), adm.autor_atual());
  END IF;

  -- Liga antes de mover: assim o Ganho não cria uma segunda empresa.
  UPDATE comercial.negocios SET empresa_id = p_empresa WHERE id = v_negocio;
  UPDATE adm.empresas SET negocio_id = v_negocio WHERE id = p_empresa;
  IF NOT EXISTS (SELECT 1 FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id WHERE n.id = v_negocio AND e.ganho) THEN
    PERFORM comercial.mover_etapa(v_negocio, 'ganho', NULL);
  END IF;
  UPDATE comercial.negocios n SET valor_mensal_previsto = (SELECT coalesce(sum(v.valor_mensal), 0) FROM adm.vinculos v WHERE v.empresa_id = p_empresa AND v.ativo)
   WHERE n.id = v_negocio AND EXISTS (SELECT 1 FROM adm.vinculos v WHERE v.empresa_id = p_empresa);
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (p_empresa, 'origem_venda', pg_catalog.jsonb_build_object('negocio_id', v_negocio, 'origem', v_origem), adm.autor_atual());
  RETURN v_negocio;
END;
$$;

CREATE OR REPLACE FUNCTION public.com_relatorio(p_inicio date, p_fim date) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_ini timestamptz := (coalesce(p_inicio, (pg_catalog.now() - interval '30 days')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_fim timestamptz := ((coalesce(p_fim, pg_catalog.now()::date) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_pos_qualif text[] := ARRAY['qualificacao', 'reuniao_agendada', 'demonstracao', 'proposta', 'negociacao', 'ganho'];
  v_pos_reuniao text[] := ARRAY['reuniao_agendada', 'demonstracao', 'proposta', 'negociacao', 'ganho'];
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN (
    WITH base AS (
      -- origem do negócio = de onde veio o 1º lead dele (um cliente antigo pode voltar por outra fonte)
      SELECT n.id, coalesce(n.origem_venda, (SELECT r.origem FROM comercial.leads_recebidos r WHERE r.negocio_id = n.id ORDER BY r.recebido_em, r.id LIMIT 1), c.origem) AS origem,
             n.temperatura, n.sistemas, e.chave AS etapa, n.motivo_perda, n.valor_mensal_previsto AS valor,
             n.criado_em, comercial.chegou(n.id, v_pos_qualif) AS qualificado, comercial.chegou(n.id, v_pos_reuniao) AS reuniao,
             e.chave = 'ganho' AS ganho, e.chave = 'perdido' AS perdido
        FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id JOIN comercial.etapas e ON e.id = n.etapa_id
       WHERE n.criado_em >= v_ini AND n.criado_em < v_fim
    )
    SELECT pg_catalog.jsonb_build_object(
      'periodo', pg_catalog.jsonb_build_object('inicio', (v_ini AT TIME ZONE 'America/Sao_Paulo')::date, 'fim', ((v_fim AT TIME ZONE 'America/Sao_Paulo')::date - 1)),
      'totais', (SELECT pg_catalog.jsonb_build_object('leads', count(*), 'qualificados', count(*) FILTER (WHERE qualificado),
                   'reunioes', count(*) FILTER (WHERE reuniao), 'ganhos', count(*) FILTER (WHERE ganho),
                   'perdidos', count(*) FILTER (WHERE perdido), 'receita', coalesce(sum(valor) FILTER (WHERE ganho), 0)) FROM base),
      'por_fonte', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.leads DESC) FROM (
                     SELECT origem, count(*) leads, count(*) FILTER (WHERE qualificado) qualificados, count(*) FILTER (WHERE reuniao) reunioes,
                            count(*) FILTER (WHERE ganho) ganhos, count(*) FILTER (WHERE perdido) perdidos,
                            coalesce(sum(valor) FILTER (WHERE ganho), 0) receita
                       FROM base GROUP BY origem) x), '[]'::jsonb),
      'por_temperatura', coalesce((SELECT pg_catalog.jsonb_agg(x) FROM (
                     SELECT coalesce(temperatura, 'sem') temperatura, count(*) leads, count(*) FILTER (WHERE ganho) ganhos
                       FROM base GROUP BY 1) x), '[]'::jsonb),
      'por_etapa', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.ordem) FROM (
                     SELECT e.chave, e.nome, e.ordem, (SELECT count(*) FROM base b WHERE b.etapa = e.chave) total
                       FROM comercial.etapas e) x), '[]'::jsonb),
      'por_sistema', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.leads DESC) FROM (
                     SELECT s AS sistema, count(*) leads, count(*) FILTER (WHERE ganho) ganhos
                       FROM base, pg_catalog.unnest(CASE WHEN pg_catalog.cardinality(sistemas) = 0 THEN ARRAY['sem sistema'] ELSE sistemas END) s
                      GROUP BY s) x), '[]'::jsonb),
      'motivos_perda', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.total DESC) FROM (
                     SELECT coalesce(motivo_perda, 'sem motivo') motivo, count(*) total FROM base WHERE perdido GROUP BY 1) x), '[]'::jsonb),
      'por_semana', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.semana) FROM (
                     SELECT pg_catalog.date_trunc('week', criado_em AT TIME ZONE 'America/Sao_Paulo')::date semana, count(*) leads,
                            count(*) FILTER (WHERE ganho) ganhos FROM base GROUP BY 1) x), '[]'::jsonb),
      'linhas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'entrou', (b.criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'nome', c.nome, 'empresa', c.empresa_nome,
                     'whatsapp', c.whatsapp, 'email', c.email, 'origem', b.origem, 'temperatura', b.temperatura,
                     'etapa', b.etapa, 'sistemas', pg_catalog.array_to_string(b.sistemas, ' '), 'valor', b.valor, 'motivo_perda', b.motivo_perda)
                     ORDER BY b.criado_em)
                   FROM base b JOIN comercial.negocios n ON n.id = b.id JOIN comercial.contatos c ON c.id = n.contato_id), '[]'::jsonb)
    ));
END;
$$;

REVOKE ALL ON FUNCTION adm.valor_do_negocio_ganho() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_empresa_origem(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_empresa_origem(uuid, jsonb) TO authenticated, service_role;
