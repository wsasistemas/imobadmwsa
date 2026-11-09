-- Fase 8 (parte 2): Ganho → cliente (empresa + vínculos), relatório comercial, importação de CSV e follow-up de 24 h.
-- Migration aditiva: só cria funções e um agendamento.

-- ---------------------------------------------------------------- Ganho → cliente
-- Move o negócio para Ganho (o que cria a empresa), completa os dados da empresa e cria os vínculos informados.
-- p = { razao_social, nome_fantasia, cnpj, dia_vencimento, email_financeiro, whatsapp,
--       sistemas: [{ app, ref, plano, valor_mensal }] }   — sistema sem ref fica para vincular depois, na ficha da empresa.
CREATE OR REPLACE FUNCTION public.com_ganhar(p_negocio uuid, p jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_etapa text;
  v_empresa uuid;
  v_item jsonb;
  v_tipo text;
  v_ref text;
  v_vinculos integer := 0;
  v_pendentes jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_cnpj text := nullif(pg_catalog.regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g'), '');
  v_dia integer := nullif(p ->> 'dia_vencimento', '')::int;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT e.chave INTO v_etapa FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id WHERE n.id = p_negocio;
  IF v_etapa IS NULL THEN RAISE EXCEPTION 'Negócio não encontrado.'; END IF;
  IF v_cnpj IS NOT NULL AND pg_catalog.length(v_cnpj) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF ou CNPJ inválido.'; END IF;
  IF v_dia IS NOT NULL AND (v_dia < 1 OR v_dia > 28) THEN RAISE EXCEPTION 'Dia de vencimento deve ser de 1 a 28.'; END IF;

  IF v_etapa <> 'ganho' THEN PERFORM comercial.mover_etapa(p_negocio, 'ganho', NULL); END IF;
  v_empresa := adm.criar_empresa_do_negocio(p_negocio);

  UPDATE adm.empresas e SET
    razao_social = coalesce(nullif(pg_catalog.btrim(p ->> 'razao_social'), ''), e.razao_social),
    nome_fantasia = coalesce(nullif(pg_catalog.btrim(p ->> 'nome_fantasia'), ''), e.nome_fantasia),
    cnpj = coalesce(v_cnpj, e.cnpj),
    dia_vencimento = coalesce(v_dia, e.dia_vencimento),
    email_financeiro = coalesce(nullif(pg_catalog.btrim(p ->> 'email_financeiro'), ''), e.email_financeiro),
    whatsapp = coalesce(nullif(pg_catalog.regexp_replace(coalesce(p ->> 'whatsapp', ''), '\D', '', 'g'), ''), e.whatsapp)
  WHERE e.id = v_empresa;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(coalesce(p -> 'sistemas', '[]'::jsonb)) LOOP
    v_total := v_total + coalesce(nullif(v_item ->> 'valor_mensal', '')::numeric, 0);
    v_ref := nullif(pg_catalog.btrim(coalesce(v_item ->> 'ref', '')), '');
    SELECT s.tipo_ref INTO v_tipo FROM adm.sistemas s WHERE s.app = v_item ->> 'app';
    IF v_tipo IS NULL THEN RAISE EXCEPTION 'Sistema % não cadastrado em Sistemas e schemas.', v_item ->> 'app'; END IF;
    IF v_ref IS NULL THEN
      v_pendentes := v_pendentes || pg_catalog.jsonb_build_array(v_item ->> 'app');
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM adm.vinculos v WHERE v.empresa_id = v_empresa AND v.app = v_item ->> 'app') THEN
      INSERT INTO adm.vinculos (empresa_id, app, schema_ref, tenant_ref, plano, valor_mensal)
      VALUES (v_empresa, v_item ->> 'app',
              CASE WHEN v_tipo = 'schema' THEN pg_catalog.lower(v_ref) END,
              CASE WHEN v_tipo <> 'schema' THEN v_ref END,
              nullif(v_item ->> 'plano', ''), coalesce(nullif(v_item ->> 'valor_mensal', '')::numeric, 0));
      INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
      VALUES (v_empresa, 'vinculo', v_item || pg_catalog.jsonb_build_object('origem', 'ganho'), adm.autor_atual());
      v_vinculos := v_vinculos + 1;
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    UPDATE comercial.negocios SET valor_mensal_previsto = v_total, atualizado_em = pg_catalog.now() WHERE id = p_negocio;
  END IF;
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
  VALUES (p_negocio, 'sistema', 'Cliente criado: ' || v_vinculos || ' sistema(s) vinculado(s)'
            || CASE WHEN pg_catalog.jsonb_array_length(v_pendentes) > 0 THEN ', falta vincular ' || (SELECT pg_catalog.string_agg(x, ', ') FROM pg_catalog.jsonb_array_elements_text(v_pendentes) x) ELSE '' END,
          pg_catalog.jsonb_build_object('empresa_id', v_empresa, 'valor', v_total), adm.autor_atual());

  RETURN pg_catalog.jsonb_build_object('empresa_id', v_empresa, 'vinculos', v_vinculos, 'pendentes', v_pendentes,
    'tem_cnpj', (SELECT e.cnpj IS NOT NULL FROM adm.empresas e WHERE e.id = v_empresa),
    'mensalidade', (SELECT coalesce(sum(v.valor_mensal), 0) FROM adm.vinculos v WHERE v.empresa_id = v_empresa AND v.ativo));
END;
$$;

-- ---------------------------------------------------------------- Relatório comercial
-- "Chegou a" uma etapa = está nela agora ou passou por ela (histórico em atividades tipo 'etapa').
CREATE OR REPLACE FUNCTION comercial.chegou(p_negocio uuid, p_etapas text[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
                  WHERE n.id = p_negocio AND e.chave = ANY (p_etapas))
      OR EXISTS (SELECT 1 FROM comercial.atividades a
                  WHERE a.negocio_id = p_negocio AND a.tipo = 'etapa' AND a.detalhe ->> 'para' = ANY (p_etapas))
      OR (p_etapas && ARRAY['reuniao_agendada'] AND EXISTS (SELECT 1 FROM comercial.reunioes r WHERE r.negocio_id = p_negocio))
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
      SELECT n.id, coalesce((SELECT r.origem FROM comercial.leads_recebidos r WHERE r.negocio_id = n.id ORDER BY r.recebido_em, r.id LIMIT 1), c.origem) AS origem,
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

-- ---------------------------------------------------------------- Importação de CSV
-- p_linhas = [{ nome, email, telefone, empresa, cargo, mensagem, sistema }]. Entra como "importado": sem boas-vindas,
-- classificado sem mudar de etapa, sem duplicar contato (mesmo WhatsApp ou e-mail vira anotação).
CREATE OR REPLACE FUNCTION public.com_importar(p_linhas jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_l jsonb; v_r jsonb; v_novos integer := 0; v_repetidos integer := 0; v_erros jsonb := '[]'::jsonb; v_i integer := 0;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF pg_catalog.jsonb_typeof(p_linhas) <> 'array' THEN RAISE EXCEPTION 'Envie uma lista de linhas.'; END IF;
  IF pg_catalog.jsonb_array_length(p_linhas) > 2000 THEN RAISE EXCEPTION 'No máximo 2.000 linhas por vez.'; END IF;
  FOR v_l IN SELECT * FROM pg_catalog.jsonb_array_elements(p_linhas) LOOP
    v_i := v_i + 1;
    v_r := comercial.receber_lead('importado', v_l || pg_catalog.jsonb_build_object('formulario', 'importação CSV'), NULL, NULL, false);
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      v_erros := v_erros || pg_catalog.jsonb_build_object('linha', v_i, 'erro', v_r ->> 'erro');
    ELSIF coalesce((v_r ->> 'repetido')::boolean, false) THEN
      v_repetidos := v_repetidos + 1;
    ELSE
      v_novos := v_novos + 1;
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('novos', v_novos, 'repetidos', v_repetidos, 'erros', v_erros);
END;
$$;

-- ---------------------------------------------------------------- Follow-up de 24 h
-- Negócio em Novo lead ou Qualificação, criado há mais de 24 h, sem reunião: anota o follow-up uma única vez.
CREATE OR REPLACE FUNCTION comercial.gerar_follow_ups() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_total integer;
BEGIN
  WITH alvo AS (
    SELECT n.id FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
     WHERE e.chave IN ('novo_lead', 'qualificacao')
       AND n.criado_em < pg_catalog.now() - interval '24 hours'
       AND n.criado_em > pg_catalog.now() - interval '30 days'
       AND NOT EXISTS (SELECT 1 FROM comercial.reunioes r WHERE r.negocio_id = n.id)
       AND NOT EXISTS (SELECT 1 FROM comercial.atividades a WHERE a.negocio_id = n.id AND a.detalhe ->> 'follow_up' = 'true')
  ), ins AS (
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
    SELECT id, 'sistema', 'Sem reunião marcada há 24 h: fazer follow-up (ligar ou mandar WhatsApp).',
           pg_catalog.jsonb_build_object('follow_up', true), 'follow-up automático' FROM alvo
    RETURNING 1
  )
  SELECT count(*) INTO v_total FROM ins;
  RETURN v_total;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('com-follow-up') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'com-follow-up');
    PERFORM cron.schedule('com-follow-up', '17 * * * *', 'select comercial.gerar_follow_ups()');
  END IF;
END $$;

-- ---------------------------------------------------------------- Permissões
REVOKE ALL ON FUNCTION comercial.chegou(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.gerar_follow_ups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comercial.chegou(uuid, text[]), comercial.gerar_follow_ups() TO service_role;

REVOKE ALL ON FUNCTION public.com_ganhar(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_relatorio(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_importar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_ganhar(uuid, jsonb), public.com_relatorio(date, date), public.com_importar(jsonb)
  TO authenticated, service_role;
