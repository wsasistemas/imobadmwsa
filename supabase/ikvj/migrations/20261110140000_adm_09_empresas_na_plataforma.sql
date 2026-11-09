-- =====================================================================================
-- ImobAdm — vínculo sem digitar código (aditiva). O administrador escolhe "Criar a empresa na plataforma" ou
-- "Usar empresa que já existe" (lista pelo nome). Cada plataforma se liga preenchendo, em adm.sistemas:
--   funcao_criar_empresa   <schema>.<nome>(nome text) → text (o código da empresa criada)
--   funcao_listar_empresas <schema>.<nome>() → jsonb [{ref, nome}]
-- Primeira plataforma completa: Imobimoveis (criar, listar e liberar acesso). Suprimentos ganha a lista.
-- =====================================================================================

ALTER TABLE adm.sistemas
  ADD COLUMN IF NOT EXISTS funcao_criar_empresa text CHECK (funcao_criar_empresa IS NULL OR funcao_criar_empresa ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  ADD COLUMN IF NOT EXISTS funcao_listar_empresas text CHECK (funcao_listar_empresas IS NULL OR funcao_listar_empresas ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$');

-- Imobimoveis -----------------------------------------------------------------------------
-- plpgsql: o schema imobimoveis só é exigido na hora de rodar.
CREATE FUNCTION adm.listar_empresas_imobimoveis() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ref', t.id::text, 'nome', t.nome) ORDER BY t.nome)
                     FROM imobimoveis.tenants t), '[]'::jsonb);
END;
$$;

-- Os gatilhos de imobimoveis.tenants já provisionam perfis, funil, distribuição e o resto da empresa nova.
CREATE FUNCTION adm.criar_empresa_imobimoveis(p_nome text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_base text := btrim(pg_catalog.regexp_replace(lower(pg_catalog.translate(coalesce(p_nome, ''),
                   'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '-', 'g'), '-');
  v_id uuid;
BEGIN
  IF btrim(coalesce(p_nome, '')) = '' THEN RAISE EXCEPTION 'A empresa precisa de um nome.'; END IF;
  INSERT INTO imobimoveis.tenants (nome, slug, status)
  VALUES (btrim(p_nome), left(coalesce(nullif(v_base, ''), 'empresa'), 40) || '-' || left(pg_catalog.md5(gen_random_uuid()::text), 5), 'ativo')
  RETURNING id INTO v_id;
  RETURN v_id::text;
END;
$$;

CREATE FUNCTION adm.provisionar_imobimoveis(p_usuario uuid, p_ref text, p_email text, p_nome text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM imobimoveis.tenants t WHERE t.id = p_ref::uuid) THEN
    RAISE EXCEPTION 'A empresa vinculada não existe mais no Imobimoveis.';
  END IF;
  -- O Imobimoveis abre a primeira imobiliária do login: um comprador fica em uma só.
  IF EXISTS (SELECT 1 FROM imobimoveis.tenant_users tu WHERE tu.user_id = p_usuario AND tu.ativo AND tu.tenant_id <> p_ref::uuid) THEN
    RAISE EXCEPTION 'Este e-mail já é usuário de outra imobiliária no Imobimoveis. Use outro e-mail para o comprador.';
  END IF;
  INSERT INTO imobimoveis.tenant_users (tenant_id, user_id, role, perfil, ativo)
  VALUES (p_ref::uuid, p_usuario, 'admin', 'admin', true)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'admin', perfil = 'admin', ativo = true;
  INSERT INTO imobimoveis.user_roles (user_id, role) VALUES (p_usuario, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO imobimoveis.profiles (user_id, full_name) VALUES (p_usuario, nullif(btrim(p_nome), '')) ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Suprimentos: só a lista (criar a imobiliária fica para quando ele for ligado por completo) ---------
CREATE FUNCTION adm.listar_empresas_suprimentos() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ref', i.id::text, 'nome', i.nome) ORDER BY i.nome)
                     FROM suprimentos.imobiliarias i), '[]'::jsonb);
END;
$$;

UPDATE adm.sistemas SET funcao_provisionar = coalesce(funcao_provisionar, 'adm.provisionar_imobimoveis'),
       funcao_criar_empresa = coalesce(funcao_criar_empresa, 'adm.criar_empresa_imobimoveis'),
       funcao_listar_empresas = coalesce(funcao_listar_empresas, 'adm.listar_empresas_imobimoveis')
 WHERE app = 'imobimoveis';
UPDATE adm.sistemas SET funcao_listar_empresas = coalesce(funcao_listar_empresas, 'adm.listar_empresas_suprimentos') WHERE app = 'suprimentos';

-- Painel -----------------------------------------------------------------------------------
CREATE FUNCTION public.adm_plataforma_empresas(p_app text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_s adm.sistemas;
  v_lista jsonb := '[]'::jsonb;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_s FROM adm.sistemas s WHERE s.app = p_app;
  IF v_s.app IS NULL THEN RAISE EXCEPTION 'Sistema não encontrado.'; END IF;
  -- As funções vêm de adm.sistemas, validadas pelo CHECK (schema.nome); só o super admin altera.
  IF v_s.funcao_listar_empresas IS NOT NULL THEN
    EXECUTE pg_catalog.format('SELECT %s()', v_s.funcao_listar_empresas) INTO v_lista;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'pode_criar', v_s.funcao_criar_empresa IS NOT NULL,
    'pode_listar', v_s.funcao_listar_empresas IS NOT NULL,
    'pode_liberar', v_s.funcao_provisionar IS NOT NULL,
    'empresas', coalesce((SELECT pg_catalog.jsonb_agg(x.e || pg_catalog.jsonb_build_object('vinculada_a',
                   (SELECT coalesce(em.nome_fantasia, em.razao_social) FROM adm.vinculos v JOIN adm.empresas em ON em.id = v.empresa_id
                     WHERE v.app = p_app AND v.ref = x.e ->> 'ref' LIMIT 1)))
                 FROM pg_catalog.jsonb_array_elements(coalesce(v_lista, '[]'::jsonb)) x(e)), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.adm_vincular_criando(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_s adm.sistemas;
  v_e adm.empresas;
  v_ref text;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_s FROM adm.sistemas s WHERE s.app = p ->> 'app';
  IF v_s.funcao_criar_empresa IS NULL THEN RAISE EXCEPTION 'Esta plataforma ainda não cria empresas pelo painel.'; END IF;
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = (p ->> 'empresa_id')::uuid;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  EXECUTE pg_catalog.format('SELECT %s($1)', v_s.funcao_criar_empresa) INTO v_ref USING coalesce(v_e.nome_fantasia, v_e.razao_social);
  RETURN public.adm_salvar_vinculo(pg_catalog.jsonb_build_object(
    'empresa_id', v_e.id, 'app', v_s.app, 'plano', p ->> 'plano', 'valor_mensal', p ->> 'valor_mensal',
    CASE WHEN v_s.tipo_ref = 'schema' THEN 'schema_ref' ELSE 'tenant_ref' END, v_ref));
END;
$$;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION adm.listar_empresas_imobimoveis(), adm.criar_empresa_imobimoveis(text), adm.provisionar_imobimoveis(uuid, text, text, text),
  adm.listar_empresas_suprimentos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adm.listar_empresas_imobimoveis(), adm.criar_empresa_imobimoveis(text), adm.provisionar_imobimoveis(uuid, text, text, text),
  adm.listar_empresas_suprimentos() TO service_role;
REVOKE ALL ON FUNCTION public.adm_plataforma_empresas(text), public.adm_vincular_criando(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_plataforma_empresas(text), public.adm_vincular_criando(jsonb) TO authenticated, service_role;
