-- =====================================================================================
-- ImobAdm — empresas vinculadas a um sistema (tela "Sistemas e schemas", aditiva)
-- =====================================================================================

CREATE FUNCTION public.adm_empresas_do_sistema(p_app text, p_busca text DEFAULT NULL)
  RETURNS TABLE (vinculo_id uuid, empresa_id uuid, empresa text, cnpj text, schema_ref text, tenant_ref text,
                 plano text, valor_mensal numeric, ativo boolean, acesso_manual text, liberado boolean,
                 situacao text, dias_atraso integer, suspende_em date, desde timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN QUERY
  SELECT v.id, e.id, coalesce(nullif(e.nome_fantasia, ''), e.razao_social), e.cnpj, v.schema_ref, v.tenant_ref,
         v.plano, v.valor_mensal, v.ativo, v.acesso_manual, adm.empresa_liberada_ref(v.app, v.ref),
         s.situacao, s.dias_atraso, s.suspende_em, v.criado_em
    FROM adm.vinculos v
    JOIN adm.empresas e ON e.id = v.empresa_id
    CROSS JOIN LATERAL adm.situacao_calculada(e.id) s
   WHERE v.app = p_app
     AND (p_busca IS NULL OR e.razao_social ILIKE '%' || p_busca || '%' OR e.nome_fantasia ILIKE '%' || p_busca || '%'
          OR v.ref ILIKE '%' || p_busca || '%'
          OR e.cnpj LIKE '%' || nullif(pg_catalog.regexp_replace(p_busca, '\D', '', 'g'), '') || '%')
   ORDER BY v.ativo DESC, CASE s.situacao WHEN 'suspensa' THEN 0 WHEN 'atraso' THEN 1 ELSE 2 END, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.adm_empresas_do_sistema(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_empresas_do_sistema(text, text) TO authenticated, service_role;
