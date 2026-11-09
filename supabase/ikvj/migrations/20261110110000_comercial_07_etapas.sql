-- =====================================================================================
-- ImobAdm — Fase 8: configurar as etapas do funil pela tela (aditiva: só cria funções)
-- As etapas de fábrica podem ser renomeadas, recoloridas e reordenadas, mas não excluídas: a automação usa as chaves delas.
-- Ganho e Perdido ficam sempre no fim. Só etapa criada na tela e sem negócios pode ser excluída.
-- =====================================================================================

CREATE FUNCTION public.com_etapas() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', e.id, 'chave', e.chave, 'nome', e.nome, 'ordem', e.ordem, 'cor', e.cor, 'final', e.final,
      'de_fabrica', e.chave NOT LIKE 'etapa\_%',
      'negocios', (SELECT count(*) FROM comercial.negocios n WHERE n.etapa_id = e.id)) ORDER BY e.ordem)
    FROM comercial.etapas e), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_etapa_salvar(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_cor text := coalesce(p ->> 'cor', 'primary');
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_ordem integer;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_nome = '' OR length(v_nome) > 40 THEN RAISE EXCEPTION 'Informe um nome de até 40 letras.'; END IF;
  IF v_cor NOT IN ('info', 'primary', 'abobora', 'warning', 'success', 'muted') THEN RAISE EXCEPTION 'Cor inválida.'; END IF;
  IF EXISTS (SELECT 1 FROM comercial.etapas e WHERE lower(e.nome) = lower(v_nome) AND e.id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'Já existe uma etapa com esse nome.';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE comercial.etapas SET nome = v_nome, cor = v_cor WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada.'; END IF;
    RETURN v_id;
  END IF;

  SELECT min(e.ordem) INTO v_ordem FROM comercial.etapas e WHERE e.final;
  UPDATE comercial.etapas SET ordem = ordem + 1 WHERE final;
  INSERT INTO comercial.etapas (chave, nome, ordem, cor)
  VALUES ('etapa_' || pg_catalog.translate(pg_catalog.md5(gen_random_uuid()::text), '0123456789', 'ghijklmnop'), v_nome, v_ordem, v_cor)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.com_etapa_mover(p_etapa uuid, p_direcao integer) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_a comercial.etapas;
  v_b comercial.etapas;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_a FROM comercial.etapas e WHERE e.id = p_etapa AND NOT e.final;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Essa etapa não pode mudar de posição.'; END IF;
  IF p_direcao < 0 THEN
    SELECT * INTO v_b FROM comercial.etapas e WHERE NOT e.final AND e.ordem < v_a.ordem ORDER BY e.ordem DESC LIMIT 1;
  ELSE
    SELECT * INTO v_b FROM comercial.etapas e WHERE NOT e.final AND e.ordem > v_a.ordem ORDER BY e.ordem LIMIT 1;
  END IF;
  IF v_b.id IS NULL THEN RETURN; END IF;
  UPDATE comercial.etapas SET ordem = v_b.ordem WHERE id = v_a.id;
  UPDATE comercial.etapas SET ordem = v_a.ordem WHERE id = v_b.id;
END;
$$;

CREATE FUNCTION public.com_etapa_excluir(p_etapa uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF NOT EXISTS (SELECT 1 FROM comercial.etapas e WHERE e.id = p_etapa AND e.chave LIKE 'etapa\_%') THEN
    RAISE EXCEPTION 'As etapas de fábrica não podem ser excluídas. Você pode renomear.';
  END IF;
  IF EXISTS (SELECT 1 FROM comercial.negocios n WHERE n.etapa_id = p_etapa) THEN
    RAISE EXCEPTION 'Mova os negócios desta etapa antes de excluir.';
  END IF;
  DELETE FROM comercial.etapas WHERE id = p_etapa;
END;
$$;

REVOKE ALL ON FUNCTION public.com_etapas(), public.com_etapa_salvar(jsonb), public.com_etapa_mover(uuid, integer), public.com_etapa_excluir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_etapas(), public.com_etapa_salvar(jsonb), public.com_etapa_mover(uuid, integer), public.com_etapa_excluir(uuid) TO authenticated, service_role;
