-- =====================================================================================
-- ImobAdm — cadastro de sistemas a partir dos schemas do banco (aditiva)
-- Antes: adm.sistemas só tinha os 6 apps da Central de Acessos (carga da adm_01). Schemas como
-- imobpesagens e imobeducacional não apareciam porque não estão em acessos.aplicativos (FK).
--   public.adm_schemas_disponiveis()   schemas do banco que ainda não são sistemas cobrados
--   public.adm_adicionar_sistema(...)  registra na Central (controle desligado: não muda nenhum login) e em adm.sistemas
-- =====================================================================================

CREATE FUNCTION public.adm_schemas_disponiveis()
  RETURNS TABLE (schema_name text, tabelas bigint, na_central boolean, nome_central text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN QUERY
  SELECT n.nspname::text,
         (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.relnamespace = n.oid AND c.relkind = 'r'),
         a.schema_name IS NOT NULL, a.nome
    FROM pg_catalog.pg_namespace n
    LEFT JOIN acessos.aplicativos a ON a.schema_name = n.nspname
   WHERE n.nspname !~ '^(pg_|loja_)'
     AND n.nspname NOT IN ('information_schema', 'public', 'auth', 'storage', 'realtime', '_realtime', 'extensions',
                           'graphql', 'graphql_public', 'vault', 'net', 'cron', 'supabase_functions',
                           'supabase_migrations', 'pgbouncer', 'pgsodium', 'pgsodium_masks', '_analytics', 'pgmq',
                           'topology', 'acessos', 'adm', 'comercial')
     AND n.nspname NOT LIKE '%\_modelo'
     AND NOT EXISTS (SELECT 1 FROM adm.sistemas s WHERE s.app = n.nspname)
   ORDER BY n.nspname;
END;
$$;

CREATE FUNCTION public.adm_adicionar_sistema(p_schema text, p_nome text, p_url text, p_tipo_ref text, p_descricao_ref text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = p_schema) THEN
    RAISE EXCEPTION 'O schema % não existe no banco.', p_schema;
  END IF;
  IF coalesce(pg_catalog.btrim(p_nome), '') = '' THEN RAISE EXCEPTION 'Informe o nome do sistema.'; END IF;
  IF p_tipo_ref NOT IN ('schema', 'tenant') THEN RAISE EXCEPTION 'Separação inválida: use schema ou tenant.'; END IF;

  -- Central de Acessos: entra com o controle DESLIGADO (todo login continua entrando como hoje).
  INSERT INTO acessos.aplicativos (schema_name, nome, url, schema_dados)
  VALUES (p_schema, pg_catalog.btrim(p_nome), nullif(pg_catalog.btrim(coalesce(p_url, '')), ''), p_schema)
  ON CONFLICT (schema_name) DO NOTHING;

  INSERT INTO adm.sistemas (app, tipo_ref, descricao_ref)
  VALUES (p_schema, p_tipo_ref, nullif(pg_catalog.btrim(coalesce(p_descricao_ref, '')), ''))
  ON CONFLICT (app) DO UPDATE SET tipo_ref = excluded.tipo_ref, descricao_ref = excluded.descricao_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.adm_schemas_disponiveis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adm_adicionar_sistema(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_schemas_disponiveis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adm_adicionar_sistema(text, text, text, text, text) TO authenticated, service_role;
