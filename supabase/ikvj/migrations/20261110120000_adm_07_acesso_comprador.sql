-- =====================================================================================
-- ImobAdm — Acesso do comprador (aditiva). Mockup aprovado: docs/mockups/acesso-comprador.html
-- Regra para todas as plataformas: o administrador libera, o login nasce com senha provisória de 7 dias e a pessoa cria a
-- própria senha no primeiro acesso, em qualquer plataforma.
-- Cada plataforma se liga preenchendo adm.sistemas.funcao_provisionar: função <schema>.<nome>(usuario uuid, ref text,
-- email text, nome text) que coloca a pessoa como dona da empresa. Sem essa função, o botão não aparece.
-- =====================================================================================

ALTER TABLE adm.empresas
  ADD COLUMN IF NOT EXISTS comprador_nome text,
  ADD COLUMN IF NOT EXISTS comprador_email text CHECK (comprador_email IS NULL OR comprador_email = lower(comprador_email)),
  ADD COLUMN IF NOT EXISTS comprador_whatsapp text,
  ADD COLUMN IF NOT EXISTS comprador_cargo text;
ALTER TABLE adm.sistemas
  ADD COLUMN IF NOT EXISTS funcao_provisionar text CHECK (funcao_provisionar IS NULL OR funcao_provisionar ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  ADD COLUMN IF NOT EXISTS url_login text;

CREATE TABLE IF NOT EXISTS adm.acessos_comprador (
  vinculo_id          uuid PRIMARY KEY REFERENCES adm.vinculos(id) ON DELETE CASCADE,
  empresa_id          uuid NOT NULL REFERENCES adm.empresas(id) ON DELETE CASCADE,
  usuario_id          uuid,
  email               text NOT NULL,
  login_novo          boolean NOT NULL DEFAULT false,
  situacao            text NOT NULL DEFAULT 'enviando' CHECK (situacao IN ('enviando', 'enviado', 'falhou', 'primeiro_acesso')),
  sem_pagamento       boolean NOT NULL DEFAULT false,
  envios              integer NOT NULL DEFAULT 0,
  erro                text,
  enviado_em          timestamptz,
  primeiro_acesso_em  timestamptz,
  criado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acessos_comprador_usuario_idx ON adm.acessos_comprador (usuario_id);

-- A senha em si nunca fica aqui. O hash inicial serve só para conferir que a pessoa trocou de verdade.
CREATE TABLE IF NOT EXISTS adm.senhas_provisorias (
  usuario_id    uuid PRIMARY KEY,
  hash_inicial  text,
  expira_em     timestamptz NOT NULL,
  trocada_em    timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE adm.acessos_comprador ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.senhas_provisorias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON adm.acessos_comprador, adm.senhas_provisorias FROM PUBLIC, anon, authenticated;
GRANT ALL ON adm.acessos_comprador, adm.senhas_provisorias TO service_role;

-- Pode liberar: tem fatura paga ou é cortesia.
CREATE FUNCTION adm.pagamento_ok(p_empresa uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM adm.empresas e WHERE e.id = p_empresa AND e.modalidade = 'cortesia')
      OR EXISTS (SELECT 1 FROM adm.faturas f WHERE f.empresa_id = p_empresa AND f.situacao = 'paga')
$$;

-- Painel -----------------------------------------------------------------------------------
CREATE FUNCTION public.adm_salvar_comprador(p_empresa uuid, p jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_email text := nullif(lower(btrim(coalesce(p ->> 'comprador_email', ''))), '');
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'E-mail do comprador inválido.'; END IF;
  UPDATE adm.empresas SET comprador_nome = nullif(btrim(coalesce(p ->> 'comprador_nome', '')), ''), comprador_email = v_email,
         comprador_whatsapp = nullif(pg_catalog.regexp_replace(coalesce(p ->> 'comprador_whatsapp', ''), '\D', '', 'g'), ''),
         comprador_cargo = nullif(btrim(coalesce(p ->> 'comprador_cargo', '')), ''), atualizado_em = pg_catalog.now()
   WHERE id = p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
END;
$$;

CREATE FUNCTION public.adm_acessos_comprador(p_empresa uuid DEFAULT NULL, p_app text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'vinculo_id', v.id, 'empresa_id', e.id, 'empresa', coalesce(e.nome_fantasia, e.razao_social), 'app', v.app, 'sistema', a.nome, 'ref', v.ref,
      'comprador_nome', e.comprador_nome, 'comprador_email', e.comprador_email,
      'pago', adm.pagamento_ok(e.id), 'ativo', v.ativo, 'disponivel', s.funcao_provisionar IS NOT NULL,
      'url_login', coalesce(s.url_login, a.url),
      'situacao', x.situacao, 'login_novo', x.login_novo, 'enviado_em', x.enviado_em, 'primeiro_acesso_em', x.primeiro_acesso_em, 'erro', x.erro))
    FROM adm.vinculos v JOIN adm.empresas e ON e.id = v.empresa_id JOIN adm.sistemas s ON s.app = v.app
    JOIN acessos.aplicativos a ON a.schema_name = v.app LEFT JOIN adm.acessos_comprador x ON x.vinculo_id = v.id
   WHERE (p_empresa IS NULL OR v.empresa_id = p_empresa) AND (p_app IS NULL OR v.app = p_app)), '[]'::jsonb);
END;
$$;

-- Edge adm-liberar-acesso ------------------------------------------------------------------
CREATE FUNCTION public.adm_srv_acesso_preparar(p_vinculo uuid, p_sem_pagamento boolean) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v record;
  v_usuario uuid;
BEGIN
  SELECT e.id empresa_id, coalesce(e.nome_fantasia, e.razao_social) empresa, e.comprador_nome, e.comprador_email, e.modalidade,
         vi.app, vi.ref, vi.ativo, s.funcao_provisionar, coalesce(s.url_login, a.url) url, a.nome sistema
    INTO v FROM adm.vinculos vi JOIN adm.empresas e ON e.id = vi.empresa_id JOIN adm.sistemas s ON s.app = vi.app
    JOIN acessos.aplicativos a ON a.schema_name = vi.app WHERE vi.id = p_vinculo;
  IF v.empresa_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Vínculo não encontrado.'); END IF;
  IF NOT v.ativo OR v.modalidade = 'cancelada' THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Este vínculo está desligado ou a empresa foi cancelada.'); END IF;
  IF v.funcao_provisionar IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Esta plataforma ainda não foi ligada à liberação automática.'); END IF;
  IF v.comprador_email IS NULL OR v.comprador_nome IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Preencha o nome e o e-mail do comprador no cadastro da empresa.'); END IF;
  IF v.url IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Cadastre o link de login desta plataforma.'); END IF;
  IF NOT coalesce(p_sem_pagamento, false) AND NOT adm.pagamento_ok(v.empresa_id) THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'O pagamento ainda não foi confirmado.'); END IF;
  SELECT u.id INTO v_usuario FROM auth.users u WHERE lower(u.email) = v.comprador_email LIMIT 1;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'empresa', v.empresa, 'sistema', v.sistema, 'app', v.app, 'url', v.url,
    'nome', v.comprador_nome, 'email', v.comprador_email, 'usuario_id', v_usuario,
    'senha_pendente', EXISTS (SELECT 1 FROM adm.senhas_provisorias p WHERE p.usuario_id = v_usuario AND p.trocada_em IS NULL));
END;
$$;

-- p_senha_nova = a Edge acabou de definir uma senha provisória para este usuário.
CREATE FUNCTION public.adm_srv_acesso_gravar(p_vinculo uuid, p_usuario uuid, p_senha_nova boolean, p_sem_pagamento boolean, p_autor text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v record;
BEGIN
  SELECT vi.empresa_id, vi.app, vi.ref, e.comprador_nome, e.comprador_email, s.funcao_provisionar
    INTO v FROM adm.vinculos vi JOIN adm.empresas e ON e.id = vi.empresa_id JOIN adm.sistemas s ON s.app = vi.app WHERE vi.id = p_vinculo;
  IF v.funcao_provisionar IS NULL THEN RAISE EXCEPTION 'Plataforma sem função de provisionamento.'; END IF;

  -- funcao_provisionar é validada pelo CHECK (schema.nome) e só o super admin altera.
  EXECUTE pg_catalog.format('SELECT %s($1, $2, $3, $4)', v.funcao_provisionar) USING p_usuario, v.ref, v.comprador_email, v.comprador_nome;

  IF p_senha_nova THEN
    INSERT INTO adm.senhas_provisorias (usuario_id, hash_inicial, expira_em)
    VALUES (p_usuario, (SELECT u.encrypted_password FROM auth.users u WHERE u.id = p_usuario), pg_catalog.now() + interval '7 days')
    ON CONFLICT (usuario_id) DO UPDATE SET hash_inicial = excluded.hash_inicial, expira_em = excluded.expira_em, trocada_em = NULL;
  END IF;

  INSERT INTO adm.acessos_comprador (vinculo_id, empresa_id, usuario_id, email, login_novo, sem_pagamento, situacao)
  VALUES (p_vinculo, v.empresa_id, p_usuario, v.comprador_email, p_senha_nova, coalesce(p_sem_pagamento, false), 'enviando')
  ON CONFLICT (vinculo_id) DO UPDATE SET usuario_id = excluded.usuario_id, email = excluded.email, login_novo = excluded.login_novo,
    sem_pagamento = adm.acessos_comprador.sem_pagamento OR excluded.sem_pagamento, situacao = 'enviando', erro = NULL;

  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (v.empresa_id, 'acesso_liberado', pg_catalog.jsonb_build_object('app', v.app, 'email', v.comprador_email, 'sem_pagamento', coalesce(p_sem_pagamento, false)), coalesce(p_autor, 'painel'));
END;
$$;

CREATE FUNCTION public.adm_srv_acesso_resultado(p_vinculo uuid, p_ok boolean, p_erro text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE adm.acessos_comprador SET situacao = CASE WHEN p_ok THEN 'enviado' ELSE 'falhou' END, erro = CASE WHEN p_ok THEN NULL ELSE p_erro END,
         envios = envios + CASE WHEN p_ok THEN 1 ELSE 0 END, enviado_em = CASE WHEN p_ok THEN pg_catalog.now() ELSE enviado_em END
   WHERE vinculo_id = p_vinculo;
END;
$$;

-- Plataformas (login do próprio usuário) -----------------------------------------------------
CREATE FUNCTION public.primeiro_acesso_situacao() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'precisa', EXISTS (SELECT 1 FROM adm.senhas_provisorias p WHERE p.usuario_id = (SELECT auth.uid()) AND p.trocada_em IS NULL),
    'expirada', EXISTS (SELECT 1 FROM adm.senhas_provisorias p WHERE p.usuario_id = (SELECT auth.uid()) AND p.trocada_em IS NULL AND p.expira_em < pg_catalog.now()))
$$;

CREATE FUNCTION public.primeiro_acesso_concluir() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_p adm.senhas_provisorias;
BEGIN
  SELECT * INTO v_p FROM adm.senhas_provisorias p WHERE p.usuario_id = v_uid AND p.trocada_em IS NULL;
  IF v_p.usuario_id IS NULL THEN RETURN; END IF;
  IF v_p.hash_inicial = (SELECT u.encrypted_password FROM auth.users u WHERE u.id = v_uid) THEN
    RAISE EXCEPTION 'Crie uma nova senha antes de continuar.';
  END IF;
  UPDATE adm.senhas_provisorias SET trocada_em = pg_catalog.now() WHERE usuario_id = v_uid;
  UPDATE adm.acessos_comprador SET situacao = 'primeiro_acesso', primeiro_acesso_em = pg_catalog.now() WHERE usuario_id = v_uid AND situacao = 'enviado';
END;
$$;

-- Suprimentos (primeira plataforma ligada) ----------------------------------------------------
-- plpgsql: o schema suprimentos só é exigido na hora de rodar.
CREATE FUNCTION adm.provisionar_suprimentos(p_usuario uuid, p_ref text, p_email text, p_nome text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM suprimentos.usuarios u WHERE u.id = p_usuario AND u.imobiliaria_id <> p_ref::uuid) THEN
    RAISE EXCEPTION 'Este e-mail já é usuário de outra empresa no Suprimentos.';
  END IF;
  INSERT INTO suprimentos.usuarios (id, imobiliaria_id, email, nome, perfil, ativo)
  VALUES (p_usuario, p_ref::uuid, p_email, p_nome, 'admin', true)
  ON CONFLICT (id) DO UPDATE SET perfil = 'admin', ativo = true, nome = coalesce(suprimentos.usuarios.nome, excluded.nome);
END;
$$;
UPDATE adm.sistemas SET funcao_provisionar = 'adm.provisionar_suprimentos' WHERE app = 'suprimentos' AND funcao_provisionar IS NULL;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION adm.pagamento_ok(uuid), adm.provisionar_suprimentos(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adm.pagamento_ok(uuid), adm.provisionar_suprimentos(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.adm_srv_acesso_preparar(uuid, boolean), public.adm_srv_acesso_gravar(uuid, uuid, boolean, boolean, text),
  public.adm_srv_acesso_resultado(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adm_srv_acesso_preparar(uuid, boolean), public.adm_srv_acesso_gravar(uuid, uuid, boolean, boolean, text),
  public.adm_srv_acesso_resultado(uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.adm_salvar_comprador(uuid, jsonb), public.adm_acessos_comprador(uuid, text),
  public.primeiro_acesso_situacao(), public.primeiro_acesso_concluir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_salvar_comprador(uuid, jsonb), public.adm_acessos_comprador(uuid, text),
  public.primeiro_acesso_situacao(), public.primeiro_acesso_concluir() TO authenticated, service_role;
