-- =====================================================================================
-- ImobAdm — Fase 6: Facebook e Instagram (Lead Ads), aditiva
-- Um app da Meta da WSA; as páginas conectadas ficam em comercial.meta_conexoes e o TOKEN de cada página fica
-- no Vault (nunca numa coluna). O login do Facebook guarda o token do usuário por 30 min (comercial.meta_sessoes,
-- também no Vault) só para escolher a página.
-- =====================================================================================

ALTER TABLE comercial.meta_conexoes
  ADD COLUMN IF NOT EXISTS ig_id text,
  ADD COLUMN IF NOT EXISTS assinada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detalhe text,
  ADD COLUMN IF NOT EXISTS ultimo_lead_em timestamptz,
  ADD COLUMN IF NOT EXISTS total_leads integer NOT NULL DEFAULT 0;
ALTER TABLE comercial.meta_formularios
  ADD COLUMN IF NOT EXISTS situacao text,
  ADD COLUMN IF NOT EXISTS total_leads integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS comercial.meta_sessoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL,
  token_vault_id  uuid NOT NULL,
  expira_em       timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  criado_em       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE comercial.meta_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comercial.meta_sessoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON comercial.meta_sessoes TO service_role;

INSERT INTO comercial.fontes (tipo, nome, dominio)
SELECT 'meta', 'Facebook e Instagram', 'Lead Ads'
 WHERE NOT EXISTS (SELECT 1 FROM comercial.fontes WHERE tipo = 'meta');

-- Vault (plpgsql para não exigir o Vault na criação: o teste local roda sem ele) -------------
CREATE FUNCTION comercial.vault_gravar(p_id uuid, p_segredo text, p_nome text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.id = p_id) THEN
    PERFORM vault.update_secret(p_id, p_segredo);
    RETURN p_id;
  END IF;
  RETURN vault.create_secret(p_segredo, p_nome || '_' || replace(gen_random_uuid()::text, '-', ''), 'ImobAdm: token da Meta');
END;
$$;

CREATE FUNCTION comercial.vault_ler(p_id uuid) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  RETURN (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.id = p_id);
END;
$$;

CREATE FUNCTION comercial.vault_apagar(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF p_id IS NOT NULL THEN DELETE FROM vault.secrets s WHERE s.id = p_id; END IF;
END;
$$;

-- Sessão do login (token do usuário por 30 min) ------------------------------------------
CREATE FUNCTION public.com_srv_meta_sessao_criar(p_usuario uuid, p_token text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_id uuid;
BEGIN
  -- limpa sessões vencidas (e os tokens delas)
  PERFORM comercial.vault_apagar(s.token_vault_id) FROM comercial.meta_sessoes s WHERE s.expira_em < pg_catalog.now();
  DELETE FROM comercial.meta_sessoes WHERE expira_em < pg_catalog.now();
  INSERT INTO comercial.meta_sessoes (usuario_id, token_vault_id)
  VALUES (p_usuario, comercial.vault_gravar(NULL, p_token, 'adm_meta_sessao'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.com_srv_meta_sessao_token(p_id uuid, p_usuario uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT comercial.vault_ler(s.token_vault_id) FROM comercial.meta_sessoes s
   WHERE s.id = p_id AND s.usuario_id = p_usuario AND s.expira_em > pg_catalog.now()
$$;

CREATE FUNCTION public.com_srv_meta_sessao_apagar(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM comercial.vault_apagar(s.token_vault_id) FROM comercial.meta_sessoes s WHERE s.id = p_id;
  DELETE FROM comercial.meta_sessoes WHERE id = p_id;
END;
$$;

-- Conexões (página) ------------------------------------------------------------------------
CREATE FUNCTION public.com_srv_meta_conexao_gravar(p jsonb, p_token text, p_usuario uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_c comercial.meta_conexoes;
BEGIN
  SELECT * INTO v_c FROM comercial.meta_conexoes c WHERE c.page_id = p ->> 'page_id';
  IF v_c.id IS NULL THEN
    INSERT INTO comercial.meta_conexoes (page_id, page_nome, ig_id, ig_usuario, conectado_por, token_vault_id, token_valido, assinada, verificado_em)
    VALUES (p ->> 'page_id', p ->> 'page_nome', nullif(p ->> 'ig_id', ''), nullif(p ->> 'ig_usuario', ''), p_usuario,
            comercial.vault_gravar(NULL, p_token, 'adm_meta_pagina'), true, coalesce((p ->> 'assinada')::boolean, false), pg_catalog.now())
    RETURNING * INTO v_c;
  ELSE
    UPDATE comercial.meta_conexoes c SET page_nome = p ->> 'page_nome', ig_id = nullif(p ->> 'ig_id', ''),
           ig_usuario = nullif(p ->> 'ig_usuario', ''), conectado_por = p_usuario,
           token_vault_id = comercial.vault_gravar(c.token_vault_id, p_token, 'adm_meta_pagina'),
           token_valido = true, assinada = coalesce((p ->> 'assinada')::boolean, false), detalhe = NULL,
           verificado_em = pg_catalog.now()
     WHERE c.id = v_c.id
    RETURNING * INTO v_c;
  END IF;
  RETURN v_c.id;
END;
$$;

CREATE FUNCTION public.com_srv_meta_conexao_token(p_conexao uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object('id', c.id, 'page_id', c.page_id, 'token', comercial.vault_ler(c.token_vault_id))
    FROM comercial.meta_conexoes c WHERE c.id = p_conexao
$$;

/** Webhook: token da página que mandou o lead, e o formulário (sistema e se está ligado). */
CREATE FUNCTION public.com_srv_meta_por_pagina(p_page_id text, p_form_id text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
           'conexao_id', c.id, 'token', comercial.vault_ler(c.token_vault_id), 'token_valido', c.token_valido,
           'form_ativo', coalesce(f.ativo, true), 'form_nome', f.nome, 'sistema', f.sistema,
           'fonte_id', (SELECT x.id FROM comercial.fontes x WHERE x.tipo = 'meta' ORDER BY x.criado_em LIMIT 1))
    FROM comercial.meta_conexoes c
    LEFT JOIN comercial.meta_formularios f ON f.form_id = p_form_id AND f.conexao_id = c.id
   WHERE c.page_id = p_page_id
$$;

CREATE FUNCTION public.com_srv_meta_lead_recebido(p_conexao uuid, p_form_id text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE comercial.meta_conexoes SET total_leads = total_leads + 1, ultimo_lead_em = pg_catalog.now() WHERE id = p_conexao;
  UPDATE comercial.meta_formularios SET total_leads = total_leads + 1 WHERE form_id = p_form_id;
END;
$$;

CREATE FUNCTION public.com_srv_meta_formularios_sincronizar(p_conexao uuid, p_forms jsonb) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v integer;
BEGIN
  INSERT INTO comercial.meta_formularios (form_id, conexao_id, nome, situacao, plataforma)
  SELECT f ->> 'id', p_conexao, f ->> 'nome', f ->> 'situacao', 'meta'
    FROM pg_catalog.jsonb_array_elements(coalesce(p_forms, '[]'::jsonb)) f
   WHERE coalesce(f ->> 'id', '') <> ''
  ON CONFLICT (form_id) DO UPDATE SET nome = excluded.nome, situacao = excluded.situacao, conexao_id = excluded.conexao_id,
                                      atualizado_em = pg_catalog.now();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

CREATE FUNCTION public.com_srv_meta_conexao_situacao(p_conexao uuid, p_valido boolean, p_detalhe text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE comercial.meta_conexoes SET token_valido = p_valido, detalhe = p_detalhe, verificado_em = pg_catalog.now()
   WHERE id = p_conexao;
END;
$$;

CREATE FUNCTION public.com_srv_meta_conexao_desligar(p_conexao uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM comercial.vault_apagar(c.token_vault_id) FROM comercial.meta_conexoes c WHERE c.id = p_conexao;
  DELETE FROM comercial.meta_conexoes WHERE id = p_conexao;   -- os formulários saem junto (cascade)
END;
$$;

-- Painel (super admin) ---------------------------------------------------------------------
CREATE FUNCTION public.com_meta_conexoes() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', c.id, 'page_id', c.page_id, 'page_nome', c.page_nome, 'ig_usuario', c.ig_usuario, 'token_valido', c.token_valido,
      'assinada', c.assinada, 'detalhe', c.detalhe, 'verificado_em', c.verificado_em, 'ultimo_lead_em', c.ultimo_lead_em,
      'total_leads', c.total_leads, 'criado_em', c.criado_em,
      'formularios', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'form_id', f.form_id, 'nome', f.nome, 'situacao', f.situacao, 'sistema', f.sistema, 'ativo', f.ativo,
          'total_leads', f.total_leads) ORDER BY f.nome) FROM comercial.meta_formularios f WHERE f.conexao_id = c.id), '[]'::jsonb))
      ORDER BY c.criado_em) FROM comercial.meta_conexoes c), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_meta_formulario_salvar(p_form_id text, p_sistema text, p_ativo boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE comercial.meta_formularios SET sistema = nullif(p_sistema, ''), ativo = coalesce(p_ativo, ativo), atualizado_em = pg_catalog.now()
   WHERE form_id = p_form_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Formulário não encontrado.'; END IF;
END;
$$;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION comercial.vault_gravar(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.vault_ler(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.vault_apagar(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.com_srv_meta_sessao_criar(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_sessao_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_sessao_apagar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_conexao_gravar(jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_conexao_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_por_pagina(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_lead_recebido(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_formularios_sincronizar(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_conexao_situacao(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_meta_conexao_desligar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_sessao_criar(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_sessao_token(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_sessao_apagar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_conexao_gravar(jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_conexao_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_por_pagina(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_lead_recebido(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_formularios_sincronizar(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_conexao_situacao(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_meta_conexao_desligar(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.com_meta_conexoes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_meta_formulario_salvar(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_meta_conexoes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_meta_formulario_salvar(text, text, boolean) TO authenticated, service_role;
