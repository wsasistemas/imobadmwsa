-- =====================================================================================
-- ImobAdm WSA · Fase 1 · Cobrança por empresa (schema adm) — funções
-- Migration ADITIVA: só cria funções e gatilhos novos.
--
--   adm.hoje()                      data de hoje em Brasília
--   adm.situacao_calculada(empresa) situação "ao vivo" (em_dia, atraso, suspensa, cortesia, cancelada)
--   adm.recalcular_empresa(empresa) grava a situação e o evento quando muda
--   adm.processar_regua()           rotina diária (o envio de avisos entra na Fase 3)
--   adm.empresa_liberada_ref(app, ref)   boolean, para a RLS dos sistemas
--   public.empresa_liberada(app, ref)    jsonb, para os sites (4 momentos)
--   public.adm_*                    RPCs do painel, só para o super admin
-- =====================================================================================

-- ---------------------------------------------------------------------------------------
-- Núcleo
-- ---------------------------------------------------------------------------------------

CREATE FUNCTION adm.hoje() RETURNS date
  LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

CREATE FUNCTION adm.autor_atual() RETURNS text
  LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT coalesce((SELECT auth.uid())::text, 'sistema') $$;

-- Situação ao vivo. Regra (a primeira que valer decide):
--   cancelada / cortesia pela modalidade → suspensa manual → sem fatura vencida = em_dia →
--   prazo extra vigente = atraso → atraso <= tolerância = atraso → senão suspensa.
CREATE FUNCTION adm.situacao_calculada(p_empresa uuid)
  RETURNS TABLE (situacao text, dias_atraso integer, suspende_em date, fatura_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_e   adm.empresas;
  v_f   adm.faturas;
  v_tol integer;
  v_hoje date := adm.hoje();
  v_dias integer;
BEGIN
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = p_empresa;
  IF v_e.id IS NULL THEN RETURN; END IF;

  IF v_e.modalidade = 'cancelada' THEN RETURN QUERY SELECT 'cancelada'::text, 0, NULL::date, NULL::uuid; RETURN; END IF;
  IF v_e.modalidade = 'cortesia'  THEN RETURN QUERY SELECT 'cortesia'::text, 0, NULL::date, NULL::uuid; RETURN; END IF;

  SELECT * INTO v_f FROM adm.faturas f
   WHERE f.empresa_id = p_empresa AND f.situacao IN ('a_vencer', 'vencida') AND f.vencimento < v_hoje
   ORDER BY f.vencimento LIMIT 1;
  v_dias := CASE WHEN v_f.id IS NULL THEN 0 ELSE v_hoje - v_f.vencimento END;

  IF v_e.suspensa_manual THEN RETURN QUERY SELECT 'suspensa'::text, v_dias, NULL::date, v_f.id; RETURN; END IF;
  IF v_dias = 0 THEN RETURN QUERY SELECT 'em_dia'::text, 0, NULL::date, NULL::uuid; RETURN; END IF;

  SELECT r.dias_tolerancia INTO v_tol FROM adm.regua r WHERE r.id;
  v_tol := coalesce(v_tol, 10);

  IF v_e.prazo_extra_ate IS NOT NULL AND v_e.prazo_extra_ate >= v_hoje THEN
    RETURN QUERY SELECT 'atraso'::text, v_dias, v_e.prazo_extra_ate + 1, v_f.id; RETURN;
  END IF;
  IF v_dias <= v_tol THEN
    RETURN QUERY SELECT 'atraso'::text, v_dias, v_f.vencimento + v_tol + 1, v_f.id; RETURN;
  END IF;
  RETURN QUERY SELECT 'suspensa'::text, v_dias, NULL::date, v_f.id;
END;
$$;

-- Grava a situação calculada (e marca as faturas que venceram). O evento sai pelo gatilho.
CREATE FUNCTION adm.recalcular_empresa(p_empresa uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_nova text;
BEGIN
  UPDATE adm.faturas f SET situacao = 'vencida', atualizado_em = pg_catalog.now()
   WHERE f.empresa_id = p_empresa AND f.situacao = 'a_vencer' AND f.vencimento < adm.hoje();

  SELECT s.situacao INTO v_nova FROM adm.situacao_calculada(p_empresa) s;
  IF v_nova IS NULL THEN RETURN NULL; END IF;

  UPDATE adm.empresas e SET situacao = v_nova, atualizado_em = pg_catalog.now()
   WHERE e.id = p_empresa AND e.situacao IS DISTINCT FROM v_nova;
  RETURN v_nova;
END;
$$;

-- Rotina diária (pg_cron 03:05 UTC = 00:05 BRT). Fase 3 acrescenta o envio dos avisos.
CREATE FUNCTION adm.processar_regua() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
  v_antes text;
  v_depois text;
  v_mudou integer := 0;
  v_total integer := 0;
BEGIN
  FOR v_id, v_antes IN SELECT e.id, e.situacao FROM adm.empresas e LOOP
    v_depois := adm.recalcular_empresa(v_id);
    v_total := v_total + 1;
    IF v_depois IS DISTINCT FROM v_antes THEN v_mudou := v_mudou + 1; END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('empresas', v_total, 'mudaram', v_mudou, 'em', pg_catalog.now());
END;
$$;

-- Evento automático quando a situação muda (vale para rotina, webhook e ações manuais).
CREATE FUNCTION adm.trg_empresa_situacao() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (NEW.id, 'situacao',
          pg_catalog.jsonb_build_object('de', OLD.situacao, 'para', NEW.situacao),
          adm.autor_atual());
  RETURN NEW;
END;
$$;
CREATE TRIGGER empresa_situacao_evento AFTER UPDATE OF situacao ON adm.empresas
  FOR EACH ROW WHEN (OLD.situacao IS DISTINCT FROM NEW.situacao)
  EXECUTE FUNCTION adm.trg_empresa_situacao();

-- Fatura nova, paga, vencida ou estornada → recalcula na hora (reativação imediata ao pagar).
CREATE FUNCTION adm.trg_fatura_recalcula() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.recalcular_empresa(NEW.empresa_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER fatura_recalcula AFTER INSERT OR UPDATE OF situacao, vencimento ON adm.faturas
  FOR EACH ROW EXECUTE FUNCTION adm.trg_fatura_recalcula();

-- Mudança na empresa que afeta a situação (modalidade, suspensão manual, prazo extra).
CREATE FUNCTION adm.trg_empresa_recalcula() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.recalcular_empresa(NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER empresa_recalcula AFTER INSERT OR UPDATE OF modalidade, suspensa_manual, prazo_extra_ate ON adm.empresas
  FOR EACH ROW EXECUTE FUNCTION adm.trg_empresa_recalcula();

-- ---------------------------------------------------------------------------------------
-- Verificação de acesso dos sistemas
-- ---------------------------------------------------------------------------------------

-- Para a RLS: true = pode usar. Sem vínculo ativo = liberada (o painel só bloqueia quem cadastrou).
CREATE FUNCTION adm.empresa_liberada_ref(p_app text, p_ref text) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_v adm.vinculos;
  v_sit text;
BEGIN
  SELECT * INTO v_v FROM adm.vinculos v WHERE v.app = p_app AND v.ref = p_ref AND v.ativo;
  IF v_v.id IS NULL THEN RETURN true; END IF;
  IF v_v.acesso_manual = 'liberado' THEN RETURN true; END IF;
  IF v_v.acesso_manual = 'bloqueado' THEN RETURN false; END IF;
  SELECT s.situacao INTO v_sit FROM adm.situacao_calculada(v_v.empresa_id) s;
  RETURN coalesce(v_sit, 'em_dia') NOT IN ('suspensa', 'cancelada');
END;
$$;

-- O usuário logado pertence à empresa (ref) neste sistema? Usa adm.sistemas.funcao_membro.
-- Sem função cadastrada → false (não mostra detalhe da cobrança).
CREATE FUNCTION adm.sou_da_empresa(p_app text, p_ref text) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_fn text;
  v_ok boolean;
BEGIN
  SELECT s.funcao_membro INTO v_fn FROM adm.sistemas s WHERE s.app = p_app;
  IF v_fn IS NULL OR pg_catalog.to_regprocedure(v_fn || '(text)') IS NULL THEN RETURN false; END IF;
  EXECUTE pg_catalog.format('SELECT %s($1)', v_fn::regproc) INTO v_ok USING p_ref;
  RETURN coalesce(v_ok, false);
END;
$$;

-- Chamada pelos sites: no login, ao restaurar a sessão, no TOKEN_REFRESHED e no visibilitychange.
-- Só "liberada": false bloqueia. Detalhes (dias, fatura) só para quem é da empresa.
CREATE FUNCTION public.empresa_liberada(p_app text, p_ref text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_app text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_app, '')));
  v_ref text := pg_catalog.btrim(coalesce(p_ref, ''));
  v_lib boolean;
  v_v adm.vinculos;
  v_s record;
  v_f adm.faturas;
  v_e adm.empresas;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = '42501';
  END IF;
  v_lib := adm.empresa_liberada_ref(v_app, v_ref);
  IF NOT adm.sou_da_empresa(v_app, v_ref) AND NOT acessos.sou_super_admin() THEN
    RETURN pg_catalog.jsonb_build_object('liberada', v_lib);
  END IF;

  SELECT * INTO v_v FROM adm.vinculos v WHERE v.app = v_app AND v.ref = v_ref AND v.ativo;
  IF v_v.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('liberada', v_lib, 'situacao', 'sem_vinculo');
  END IF;
  SELECT * INTO v_s FROM adm.situacao_calculada(v_v.empresa_id);
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = v_v.empresa_id;
  IF v_s.fatura_id IS NOT NULL THEN
    SELECT * INTO v_f FROM adm.faturas f WHERE f.id = v_s.fatura_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'liberada', v_lib,
    'situacao', v_s.situacao,
    'dias_atraso', v_s.dias_atraso,
    'suspende_em', v_s.suspende_em,
    'empresa', coalesce(v_e.nome_fantasia, v_e.razao_social),
    'valor', v_f.valor,
    'vencimento', v_f.vencimento,
    'invoice_url', v_f.invoice_url
  );
END;
$$;

-- ---------------------------------------------------------------------------------------
-- RPCs do painel (todas exigem o super admin da Central de Acessos)
-- ---------------------------------------------------------------------------------------

CREATE FUNCTION adm.exigir_super_admin() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT acessos.sou_super_admin() THEN
    RAISE EXCEPTION 'Somente o super admin usa o ImobAdm.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.adm_painel() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM adm.exigir_super_admin();
  WITH sit AS (
    SELECT e.id, e.razao_social, e.nome_fantasia, e.cnpj, s.situacao, s.dias_atraso, s.suspende_em, s.fatura_id
      FROM adm.empresas e CROSS JOIN LATERAL adm.situacao_calculada(e.id) s
  ), mrr AS (
    SELECT coalesce(sum(v.valor_mensal), 0) AS total
      FROM adm.vinculos v JOIN sit ON sit.id = v.empresa_id
     WHERE v.ativo AND sit.situacao IN ('em_dia', 'atraso', 'suspensa')
  )
  SELECT pg_catalog.jsonb_build_object(
    'mrr', (SELECT total FROM mrr),
    'com_assinatura', (SELECT count(*) FROM sit WHERE situacao IN ('em_dia', 'atraso', 'suspensa')),
    'em_dia', (SELECT count(*) FROM sit WHERE situacao = 'em_dia'),
    'em_atraso', (SELECT count(*) FROM sit WHERE situacao = 'atraso'),
    'em_atraso_valor', (SELECT coalesce(sum(f.valor), 0) FROM adm.faturas f JOIN sit ON sit.id = f.empresa_id
                         WHERE sit.situacao = 'atraso' AND f.situacao IN ('a_vencer', 'vencida') AND f.vencimento < adm.hoje()),
    'suspensas', (SELECT count(*) FROM sit WHERE situacao = 'suspensa'),
    'vao_suspender', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'empresa_id', sit.id, 'empresa', coalesce(sit.nome_fantasia, sit.razao_social), 'cnpj', sit.cnpj,
          'dias_atraso', sit.dias_atraso, 'suspende_em', sit.suspende_em, 'fatura_id', sit.fatura_id,
          'sistemas', (SELECT pg_catalog.jsonb_agg(v.app ORDER BY v.app) FROM adm.vinculos v WHERE v.empresa_id = sit.id AND v.ativo))
        ORDER BY sit.suspende_em, sit.dias_atraso DESC)
        FROM sit WHERE sit.situacao = 'atraso'), '[]'::jsonb),
    'receita_por_sistema', coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.valor DESC) FROM (
          SELECT v.app, a.nome, sum(v.valor_mensal) AS valor, count(DISTINCT v.empresa_id) AS empresas
            FROM adm.vinculos v JOIN acessos.aplicativos a ON a.schema_name = v.app
           WHERE v.ativo GROUP BY v.app, a.nome) x), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;

CREATE FUNCTION public.adm_listar_empresas(p_situacao text DEFAULT NULL, p_busca text DEFAULT NULL)
  RETURNS TABLE (id uuid, razao_social text, nome_fantasia text, cnpj text, dono_nome text, situacao text,
                 dias_atraso integer, suspende_em date, mensalidade numeric, dia_vencimento integer, sistemas jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN QUERY
  SELECT e.id, e.razao_social, e.nome_fantasia, e.cnpj, e.dono_nome, s.situacao, s.dias_atraso, s.suspende_em,
         (SELECT coalesce(sum(v.valor_mensal), 0) FROM adm.vinculos v WHERE v.empresa_id = e.id AND v.ativo),
         e.dia_vencimento,
         coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('app', v.app, 'ativo', v.ativo,
                    'bloqueado', NOT adm.empresa_liberada_ref(v.app, v.ref)) ORDER BY v.app)
                     FROM adm.vinculos v WHERE v.empresa_id = e.id), '[]'::jsonb)
    FROM adm.empresas e CROSS JOIN LATERAL adm.situacao_calculada(e.id) s
   WHERE (p_situacao IS NULL OR s.situacao = p_situacao)
     AND (p_busca IS NULL OR e.razao_social ILIKE '%' || p_busca || '%' OR e.nome_fantasia ILIKE '%' || p_busca || '%'
          OR e.cnpj LIKE '%' || pg_catalog.regexp_replace(p_busca, '\D', '', 'g') || '%')
   ORDER BY CASE s.situacao WHEN 'suspensa' THEN 0 WHEN 'atraso' THEN 1 ELSE 2 END, s.dias_atraso DESC, e.razao_social;
END;
$$;

CREATE FUNCTION public.adm_empresa(p_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_e adm.empresas;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = p_id;
  IF v_e.id IS NULL THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'empresa', pg_catalog.to_jsonb(v_e),
    'situacao', (SELECT pg_catalog.to_jsonb(s) FROM adm.situacao_calculada(p_id) s),
    'vinculos', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) || pg_catalog.jsonb_build_object(
                    'sistema', a.nome, 'liberado', adm.empresa_liberada_ref(v.app, v.ref)) ORDER BY v.criado_em)
                  FROM adm.vinculos v JOIN acessos.aplicativos a ON a.schema_name = v.app
                 WHERE v.empresa_id = p_id), '[]'::jsonb),
    'faturas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.competencia DESC, f.vencimento DESC)
                  FROM adm.faturas f WHERE f.empresa_id = p_id), '[]'::jsonb),
    'eventos', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.criado_em DESC) FROM (
                  SELECT * FROM adm.eventos ev WHERE ev.empresa_id = p_id ORDER BY ev.criado_em DESC LIMIT 100) x), '[]'::jsonb)
  );
END;
$$;

-- Cria (sem id) ou atualiza (com id). Campos aceitos: os de adm.empresas editáveis pelo painel.
CREATE FUNCTION public.adm_salvar_empresa(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_cnpj text := nullif(pg_catalog.regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g'), '');
  v_whats text := nullif(pg_catalog.regexp_replace(coalesce(p ->> 'whatsapp', ''), '\D', '', 'g'), '');
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_id IS NULL THEN
    INSERT INTO adm.empresas (cnpj, razao_social, nome_fantasia, dono_nome, whatsapp, email_financeiro,
                              modalidade, dia_vencimento, observacoes)
    VALUES (v_cnpj, p ->> 'razao_social', nullif(p ->> 'nome_fantasia', ''), nullif(p ->> 'dono_nome', ''), v_whats,
            nullif(pg_catalog.lower(p ->> 'email_financeiro'), ''), coalesce(nullif(p ->> 'modalidade', ''), 'pagante'),
            nullif(p ->> 'dia_vencimento', '')::integer, nullif(p ->> 'observacoes', ''))
    RETURNING id INTO v_id;
    INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor) VALUES (v_id, 'empresa_criada', '{}'::jsonb, adm.autor_atual());
  ELSE
    UPDATE adm.empresas e SET
      cnpj = CASE WHEN p ? 'cnpj' THEN v_cnpj ELSE e.cnpj END,
      razao_social = coalesce(nullif(p ->> 'razao_social', ''), e.razao_social),
      nome_fantasia = CASE WHEN p ? 'nome_fantasia' THEN nullif(p ->> 'nome_fantasia', '') ELSE e.nome_fantasia END,
      dono_nome = CASE WHEN p ? 'dono_nome' THEN nullif(p ->> 'dono_nome', '') ELSE e.dono_nome END,
      whatsapp = CASE WHEN p ? 'whatsapp' THEN v_whats ELSE e.whatsapp END,
      email_financeiro = CASE WHEN p ? 'email_financeiro' THEN nullif(pg_catalog.lower(p ->> 'email_financeiro'), '') ELSE e.email_financeiro END,
      modalidade = coalesce(nullif(p ->> 'modalidade', ''), e.modalidade),
      dia_vencimento = CASE WHEN p ? 'dia_vencimento' THEN nullif(p ->> 'dia_vencimento', '')::integer ELSE e.dia_vencimento END,
      observacoes = CASE WHEN p ? 'observacoes' THEN nullif(p ->> 'observacoes', '') ELSE e.observacoes END,
      atualizado_em = pg_catalog.now()
    WHERE e.id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.adm_salvar_vinculo(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_empresa uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_id IS NULL THEN
    INSERT INTO adm.vinculos (empresa_id, app, schema_ref, tenant_ref, plano, valor_mensal)
    VALUES ((p ->> 'empresa_id')::uuid, p ->> 'app', nullif(p ->> 'schema_ref', ''), nullif(p ->> 'tenant_ref', ''),
            nullif(p ->> 'plano', ''), coalesce(nullif(p ->> 'valor_mensal', '')::numeric, 0))
    RETURNING id, empresa_id INTO v_id, v_empresa;
  ELSE
    UPDATE adm.vinculos v SET
      plano = CASE WHEN p ? 'plano' THEN nullif(p ->> 'plano', '') ELSE v.plano END,
      valor_mensal = coalesce(nullif(p ->> 'valor_mensal', '')::numeric, v.valor_mensal),
      ativo = coalesce((p ->> 'ativo')::boolean, v.ativo),
      acesso_manual = CASE WHEN p ? 'acesso_manual' THEN nullif(p ->> 'acesso_manual', '') ELSE v.acesso_manual END
    WHERE v.id = v_id
    RETURNING v.empresa_id INTO v_empresa;
    IF v_empresa IS NULL THEN RAISE EXCEPTION 'Vínculo não encontrado.'; END IF;
  END IF;
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (v_empresa, 'vinculo', p - 'id' || pg_catalog.jsonb_build_object('vinculo_id', v_id), adm.autor_atual());
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.adm_listar_faturas(p_situacao text DEFAULT NULL)
  RETURNS TABLE (id uuid, empresa_id uuid, empresa text, competencia date, vencimento date, valor numeric,
                 situacao text, dias_atraso integer, pago_em timestamptz, forma text, invoice_url text, empresa_liberada boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN QUERY
  SELECT f.id, f.empresa_id, coalesce(e.nome_fantasia, e.razao_social), f.competencia, f.vencimento, f.valor, f.situacao,
         CASE WHEN f.situacao IN ('a_vencer', 'vencida') AND f.vencimento < adm.hoje() THEN adm.hoje() - f.vencimento ELSE 0 END,
         f.pago_em, f.forma, f.invoice_url,
         (SELECT s.situacao NOT IN ('suspensa', 'cancelada') FROM adm.situacao_calculada(e.id) s)
    FROM adm.faturas f JOIN adm.empresas e ON e.id = f.empresa_id
   WHERE p_situacao IS NULL
      OR (p_situacao = 'em_atraso' AND f.situacao IN ('a_vencer', 'vencida') AND f.vencimento < adm.hoje())
      OR (p_situacao = 'a_vencer' AND f.situacao = 'a_vencer' AND f.vencimento >= adm.hoje())
      OR (p_situacao NOT IN ('em_atraso', 'a_vencer') AND f.situacao = p_situacao)
   ORDER BY f.vencimento, e.razao_social;
END;
$$;

-- Fatura manual (sem gateway, ou para correção). O Asaas cria as dele pelo webhook (Fase 2).
CREATE FUNCTION public.adm_criar_fatura(p_empresa uuid, p_competencia date, p_vencimento date, p_valor numeric)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  INSERT INTO adm.faturas (empresa_id, competencia, vencimento, valor, forma)
  VALUES (p_empresa, pg_catalog.date_trunc('month', p_competencia)::date, p_vencimento, p_valor, 'manual')
  RETURNING id INTO v_id;
  INSERT INTO adm.eventos (empresa_id, fatura_id, tipo, detalhe, autor)
  VALUES (p_empresa, v_id, 'fatura_criada', pg_catalog.jsonb_build_object('valor', p_valor, 'vencimento', p_vencimento), adm.autor_atual());
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.adm_registrar_pagamento(p_fatura uuid, p_forma text DEFAULT 'manual', p_pago_em timestamptz DEFAULT NULL)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE adm.faturas f SET situacao = 'paga', pago_em = coalesce(p_pago_em, pg_catalog.now()),
         forma = coalesce(nullif(p_forma, ''), 'manual'), atualizado_em = pg_catalog.now()
   WHERE f.id = p_fatura AND f.situacao IN ('a_vencer', 'vencida')
  RETURNING f.empresa_id INTO v_empresa;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada ou já fechada.'; END IF;
  INSERT INTO adm.eventos (empresa_id, fatura_id, tipo, detalhe, autor)
  VALUES (v_empresa, p_fatura, 'pagamento_manual', pg_catalog.jsonb_build_object('forma', p_forma), adm.autor_atual());
  RETURN (SELECT e.situacao FROM adm.empresas e WHERE e.id = v_empresa);
END;
$$;

CREATE FUNCTION public.adm_conceder_prazo(p_empresa uuid, p_ate date, p_motivo text DEFAULT NULL) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF p_ate IS NOT NULL AND p_ate < adm.hoje() THEN RAISE EXCEPTION 'O prazo precisa ser hoje ou depois.'; END IF;
  UPDATE adm.empresas e SET prazo_extra_ate = p_ate, atualizado_em = pg_catalog.now() WHERE e.id = p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (p_empresa, 'prazo', pg_catalog.jsonb_build_object('ate', p_ate, 'motivo', p_motivo), adm.autor_atual());
  RETURN (SELECT e.situacao FROM adm.empresas e WHERE e.id = p_empresa);
END;
$$;

-- p_suspender = true: suspende agora; false: tira a suspensão manual (volta a seguir a cobrança).
CREATE FUNCTION public.adm_suspender(p_empresa uuid, p_suspender boolean, p_motivo text DEFAULT NULL) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE adm.empresas e SET suspensa_manual = p_suspender, atualizado_em = pg_catalog.now() WHERE e.id = p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (p_empresa, CASE WHEN p_suspender THEN 'suspensao_manual' ELSE 'suspensao_manual_removida' END,
          pg_catalog.jsonb_build_object('motivo', p_motivo), adm.autor_atual());
  RETURN (SELECT e.situacao FROM adm.empresas e WHERE e.id = p_empresa);
END;
$$;

CREATE FUNCTION public.adm_listar_sistemas()
  RETURNS TABLE (app text, nome text, url text, tipo_ref text, descricao_ref text, cobra boolean,
                 empresas bigint, suspensas bigint, ultima_verificacao_em timestamptz, controle_ativo boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN QUERY
  SELECT s.app, a.nome, a.url, s.tipo_ref, s.descricao_ref, s.cobra,
         (SELECT count(DISTINCT v.empresa_id) FROM adm.vinculos v WHERE v.app = s.app AND v.ativo),
         (SELECT count(*) FROM adm.vinculos v WHERE v.app = s.app AND v.ativo AND NOT adm.empresa_liberada_ref(v.app, v.ref)),
         a.ultima_verificacao_em, a.controle_ativo
    FROM adm.sistemas s JOIN acessos.aplicativos a ON a.schema_name = s.app
   ORDER BY a.nome;
END;
$$;

CREATE FUNCTION public.adm_salvar_sistema(p_app text, p_tipo_ref text, p_descricao_ref text, p_funcao_membro text, p_cobra boolean)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  INSERT INTO adm.sistemas (app, tipo_ref, descricao_ref, funcao_membro, cobra)
  VALUES (p_app, p_tipo_ref, nullif(p_descricao_ref, ''), nullif(p_funcao_membro, ''), coalesce(p_cobra, true))
  ON CONFLICT (app) DO UPDATE SET tipo_ref = excluded.tipo_ref, descricao_ref = excluded.descricao_ref,
    funcao_membro = excluded.funcao_membro, cobra = excluded.cobra;
END;
$$;

CREATE FUNCTION public.adm_regua() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN (SELECT pg_catalog.to_jsonb(r) FROM adm.regua r WHERE r.id);
END;
$$;

CREATE FUNCTION public.adm_salvar_regua(p_dias_tolerancia integer, p_reativar_automatico boolean, p_passos jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF p_passos IS NOT NULL AND pg_catalog.jsonb_typeof(p_passos) <> 'array' THEN
    RAISE EXCEPTION 'passos precisa ser uma lista.';
  END IF;
  UPDATE adm.regua r SET dias_tolerancia = coalesce(p_dias_tolerancia, r.dias_tolerancia),
         reativar_automatico = coalesce(p_reativar_automatico, r.reativar_automatico),
         passos = coalesce(p_passos, r.passos), atualizado_em = pg_catalog.now(), atualizado_por = auth.uid()
   WHERE r.id;
END;
$$;

-- ---------------------------------------------------------------------------------------
-- Permissões: nada para PUBLIC/anon; o site e o painel chamam só as funções public.*
-- ---------------------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA adm FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA adm TO service_role;

REVOKE ALL ON FUNCTION
  public.empresa_liberada(text, text),
  public.adm_painel(),
  public.adm_listar_empresas(text, text),
  public.adm_empresa(uuid),
  public.adm_salvar_empresa(jsonb),
  public.adm_salvar_vinculo(jsonb),
  public.adm_listar_faturas(text),
  public.adm_criar_fatura(uuid, date, date, numeric),
  public.adm_registrar_pagamento(uuid, text, timestamptz),
  public.adm_conceder_prazo(uuid, date, text),
  public.adm_suspender(uuid, boolean, text),
  public.adm_listar_sistemas(),
  public.adm_salvar_sistema(text, text, text, text, boolean),
  public.adm_regua(),
  public.adm_salvar_regua(integer, boolean, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.empresa_liberada(text, text),
  public.adm_painel(),
  public.adm_listar_empresas(text, text),
  public.adm_empresa(uuid),
  public.adm_salvar_empresa(jsonb),
  public.adm_salvar_vinculo(jsonb),
  public.adm_listar_faturas(text),
  public.adm_criar_fatura(uuid, date, date, numeric),
  public.adm_registrar_pagamento(uuid, text, timestamptz),
  public.adm_conceder_prazo(uuid, date, text),
  public.adm_suspender(uuid, boolean, text),
  public.adm_listar_sistemas(),
  public.adm_salvar_sistema(text, text, text, text, boolean),
  public.adm_regua(),
  public.adm_salvar_regua(integer, boolean, jsonb)
TO authenticated, service_role;
