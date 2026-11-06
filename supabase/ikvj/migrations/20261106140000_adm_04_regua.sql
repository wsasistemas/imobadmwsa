-- =====================================================================================
-- ImobAdm — Fase 3: régua de avisos de cobrança (aditiva)
--   adm.avisos_pendentes(data)          o que a régua deve enviar hoje (passo × canal × fatura)
--   public.adm_srv_avisos_pendentes()   mesma lista em jsonb, para a Edge Function adm-regua-enviar
--   public.adm_srv_reservar_aviso(...)  reserva o envio antes de mandar (evita duplicar)
--   public.adm_srv_resultado_aviso(...) grava o resultado; se falhou, libera para tentar de novo
--   adm.cron_chave() / public.adm_srv_cron_chave_ok(text)  chave do cron no Vault
--   public.adm_avisos(p_empresa)        histórico de avisos para o painel (super admin)
--   pg_cron adm-regua-diaria: 03:05 UTC (00:05 Brasília) → recalcula + chama adm-regua-enviar
-- =====================================================================================

-- Chave do cron (gerada aqui, guardada no Vault, nunca sai do banco) ---------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'adm_regua_cron') THEN
    PERFORM vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'), 'adm_regua_cron',
                                'ImobAdm: chave do pg_cron para chamar adm-regua-enviar');
  END IF;
END $$;

-- plpgsql (e não sql) para não exigir o Vault na criação: o teste local roda sem ele.
CREATE FUNCTION adm.cron_chave() RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  RETURN (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'adm_regua_cron' LIMIT 1);
END;
$$;

CREATE FUNCTION public.adm_srv_cron_chave_ok(p_chave text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT coalesce(p_chave, '') <> '' AND p_chave = adm.cron_chave() $$;

-- Passos devidos ----------------------------------------------------------------------
-- Um passo vale do dia "d" até 2 dias depois (se o cron falhar um dia, o aviso sai no seguinte),
-- mas nunca depois que o passo seguinte já começou. Só faturas em aberto de empresas pagantes.
CREATE FUNCTION adm.avisos_pendentes(p_data date DEFAULT NULL)
  RETURNS TABLE (
    fatura_id uuid, empresa_id uuid, passo text, d integer, canal text,
    nome text, destino text, valor numeric, vencimento date, invoice_url text,
    dias integer, suspende_em date
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  WITH r AS (SELECT * FROM adm.regua WHERE id),
  passos AS (
    SELECT p->>'passo' AS passo, (p->>'d')::int AS d, p->'canais' AS canais,
           lead((p->>'d')::int) OVER (ORDER BY (p->>'d')::int) AS d_seguinte
      FROM r, pg_catalog.jsonb_array_elements(r.passos) p
     WHERE coalesce((p->>'ativo')::boolean, true)
  ),
  hoje AS (SELECT coalesce(p_data, adm.hoje()) AS dia)
  SELECT f.id, e.id, ps.passo, ps.d, c.canal,
         coalesce(nullif(e.nome_fantasia, ''), e.razao_social),
         CASE c.canal WHEN 'whatsapp' THEN e.whatsapp ELSE e.email_financeiro END,
         f.valor, f.vencimento, f.invoice_url,
         (h.dia - f.vencimento),
         f.vencimento + (SELECT dias_tolerancia FROM r) + 1
    FROM adm.faturas f
    JOIN adm.empresas e ON e.id = f.empresa_id
    CROSS JOIN hoje h
    JOIN passos ps ON (h.dia - f.vencimento) BETWEEN ps.d AND ps.d + 2
                  AND (ps.d_seguinte IS NULL OR (h.dia - f.vencimento) < ps.d_seguinte)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(ps.canais) c(canal)
   WHERE f.situacao IN ('a_vencer', 'vencida')
     AND e.modalidade = 'pagante'
     AND (e.prazo_extra_ate IS NULL OR e.prazo_extra_ate < h.dia OR ps.d < 0)
     AND CASE c.canal WHEN 'whatsapp' THEN coalesce(e.whatsapp, '') ELSE coalesce(e.email_financeiro, '') END <> ''
     AND NOT EXISTS (SELECT 1 FROM adm.avisos_enviados a
                      WHERE a.fatura_id = f.id AND a.passo = ps.passo AND a.canal = c.canal)
   ORDER BY f.vencimento, ps.d, c.canal
$$;

CREATE FUNCTION public.adm_srv_avisos_pendentes() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)), '[]'::jsonb) FROM adm.avisos_pendentes() a $$;

-- Reserva antes do envio: só quem conseguir inserir manda (duas execuções juntas não duplicam).
CREATE FUNCTION public.adm_srv_reservar_aviso(p_fatura uuid, p_passo text, p_canal text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v integer;
BEGIN
  INSERT INTO adm.avisos_enviados (fatura_id, passo, canal, resultado)
  VALUES (p_fatura, p_passo, p_canal, '{"estado":"enviando"}'::jsonb)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v > 0;
END;
$$;

-- Resultado. Falhou → apaga a reserva (tenta de novo na próxima execução) e registra o erro.
CREATE FUNCTION public.adm_srv_resultado_aviso(p_fatura uuid, p_passo text, p_canal text, p_ok boolean, p_resultado jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_empresa uuid;
BEGIN
  SELECT f.empresa_id INTO v_empresa FROM adm.faturas f WHERE f.id = p_fatura;
  IF p_ok THEN
    UPDATE adm.avisos_enviados SET resultado = coalesce(p_resultado, '{}'::jsonb) || '{"estado":"enviado"}'::jsonb,
                                   enviado_em = pg_catalog.now()
     WHERE fatura_id = p_fatura AND passo = p_passo AND canal = p_canal;
  ELSE
    DELETE FROM adm.avisos_enviados WHERE fatura_id = p_fatura AND passo = p_passo AND canal = p_canal;
  END IF;
  INSERT INTO adm.eventos (empresa_id, fatura_id, tipo, detalhe, autor)
  VALUES (v_empresa, p_fatura, 'aviso',
          pg_catalog.jsonb_build_object('passo', p_passo, 'canal', p_canal, 'ok', p_ok)
            || coalesce(p_resultado, '{}'::jsonb),
          'sistema');
END;
$$;

-- Histórico de avisos de uma empresa (painel) ----------------------------------------------
CREATE FUNCTION public.adm_avisos(p_empresa uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'fatura_id', a.fatura_id, 'passo', a.passo, 'canal', a.canal,
             'enviado_em', a.enviado_em, 'resultado', a.resultado, 'vencimento', f.vencimento)
           ORDER BY a.enviado_em DESC)
      FROM adm.avisos_enviados a JOIN adm.faturas f ON f.id = a.fatura_id
     WHERE f.empresa_id = p_empresa), '[]'::jsonb);
END;
$$;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION adm.cron_chave() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION adm.avisos_pendentes(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_srv_cron_chave_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_srv_avisos_pendentes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_srv_reservar_aviso(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_srv_resultado_aviso(uuid, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adm_avisos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION adm.avisos_pendentes(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.adm_srv_cron_chave_ok(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.adm_srv_avisos_pendentes() TO service_role;
GRANT EXECUTE ON FUNCTION public.adm_srv_reservar_aviso(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.adm_srv_resultado_aviso(uuid, text, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.adm_avisos(uuid) TO authenticated, service_role;

-- pg_cron: 03:05 UTC = 00:05 em Brasília (sem horário de verão desde 2019) ------------------
-- 1) recalcula as situações (suspende quem passou da tolerância); 2) chama o envio dos avisos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('adm-regua-diaria') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'adm-regua-diaria');
    PERFORM cron.schedule('adm-regua-diaria', '5 3 * * *', $job$
      select adm.processar_regua();
      select net.http_post(
        url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/adm-regua-enviar',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
        body := '{"origem":"cron"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$);
  END IF;
END $$;
