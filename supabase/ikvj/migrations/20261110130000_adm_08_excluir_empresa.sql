-- =====================================================================================
-- ImobAdm — excluir empresa (só cria uma função). Só o super admin.
-- Apaga a empresa e o que é dela no painel (vínculos, faturas, histórico e acessos). Os dados dentro de cada plataforma e os
-- logins não são apagados. Empresa com assinatura no Asaas não exclui: cancele a assinatura antes.
-- =====================================================================================

CREATE FUNCTION public.adm_excluir_empresa(p_empresa uuid, p_confirmacao text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_e adm.empresas;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = p_empresa;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  IF lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(coalesce(v_e.nome_fantasia, v_e.razao_social))) THEN
    RAISE EXCEPTION 'Digite o nome da empresa exatamente como aparece para confirmar.';
  END IF;
  IF v_e.asaas_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta empresa tem assinatura no Asaas. Cancele a assinatura antes de excluir.';
  END IF;
  DELETE FROM adm.empresas WHERE id = p_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.adm_excluir_empresa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adm_excluir_empresa(uuid, text) TO authenticated, service_role;
