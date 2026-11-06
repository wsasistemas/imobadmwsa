-- =====================================================================================
-- ImobAdm WSA · Fase 2 · Asaas — funções usadas SÓ pelas Edge Functions (service_role)
-- Migration ADITIVA.
--
--   public.adm_srv_empresa_cobranca(empresa)          dados para criar cliente/assinatura no Asaas
--   public.adm_srv_gravar_asaas(empresa, cus, sub)    grava os ids devolvidos pelo Asaas
--   public.adm_srv_asaas_evento(id, evento, payload)  processa o webhook (idempotente)

-- =====================================================================================

-- Dados da empresa para o Asaas: valor = soma dos vínculos ativos; próximo vencimento pelo dia_vencimento.
CREATE FUNCTION public.adm_srv_empresa_cobranca(p_empresa uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_e adm.empresas;
  v_valor numeric;
  v_dia integer;
  v_hoje date := adm.hoje();
  v_prox date;
BEGIN
  SELECT * INTO v_e FROM adm.empresas e WHERE e.id = p_empresa;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  SELECT coalesce(sum(v.valor_mensal), 0) INTO v_valor FROM adm.vinculos v WHERE v.empresa_id = p_empresa AND v.ativo;
  v_dia := coalesce(v_e.dia_vencimento, 10);
  -- próximo dia v_dia a partir de amanhã
  v_prox := pg_catalog.make_date(extract(year FROM v_hoje)::int, extract(month FROM v_hoje)::int, v_dia);
  IF v_prox <= v_hoje THEN v_prox := (v_prox + interval '1 month')::date; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'id', v_e.id,
    'nome', coalesce(v_e.razao_social, v_e.nome_fantasia),
    'cpf_cnpj', v_e.cnpj,
    'email', v_e.email_financeiro,
    'whatsapp', v_e.whatsapp,
    'modalidade', v_e.modalidade,
    'valor', v_valor,
    'proximo_vencimento', v_prox,
    'asaas_customer_id', v_e.asaas_customer_id,
    'asaas_subscription_id', v_e.asaas_subscription_id,
    'descricao', 'Mensalidade WSA Sistemas - ' || coalesce(v_e.nome_fantasia, v_e.razao_social)
  );
END;
$$;

CREATE FUNCTION public.adm_srv_gravar_asaas(p_empresa uuid, p_customer text, p_subscription text, p_autor uuid DEFAULT NULL)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE adm.empresas e SET asaas_customer_id = coalesce(p_customer, e.asaas_customer_id),
         asaas_subscription_id = coalesce(p_subscription, e.asaas_subscription_id), atualizado_em = pg_catalog.now()
   WHERE e.id = p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (p_empresa, 'asaas_assinatura', pg_catalog.jsonb_build_object('customer', p_customer, 'subscription', p_subscription),
          coalesce(p_autor::text, 'sistema'));
END;
$$;

-- Webhook do Asaas. Grava o evento (idempotente pelo id), acha a empresa pela assinatura, pelo
-- cliente ou pelo externalReference e espelha o payment em adm.faturas. Os gatilhos da Fase 1
-- recalculam a situação: pagou → reativa na hora.
CREATE FUNCTION public.adm_srv_asaas_evento(p_id text, p_evento text, p_payload jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pay jsonb := p_payload -> 'payment';
  v_empresa uuid;
  v_fatura uuid;
  v_venc date;
  v_situacao text;
  v_pago timestamptz;
  v_novo integer;
BEGIN
  INSERT INTO adm.asaas_eventos (id, evento, payload) VALUES (p_id, p_evento, p_payload)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_novo = ROW_COUNT;
  IF v_novo = 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'repetido', true);
  END IF;

  IF v_pay IS NULL OR v_pay ->> 'id' IS NULL THEN
    UPDATE adm.asaas_eventos SET processado = true, erro = 'sem payment' WHERE id = p_id;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'ignorado', 'sem payment');
  END IF;

  SELECT e.id INTO v_empresa FROM adm.empresas e
   WHERE (v_pay ->> 'subscription' IS NOT NULL AND e.asaas_subscription_id = v_pay ->> 'subscription')
      OR (v_pay ->> 'customer' IS NOT NULL AND e.asaas_customer_id = v_pay ->> 'customer')
      OR e.id::text = v_pay ->> 'externalReference'
   ORDER BY (e.asaas_subscription_id = v_pay ->> 'subscription') DESC NULLS LAST
   LIMIT 1;
  IF v_empresa IS NULL THEN
    UPDATE adm.asaas_eventos SET processado = true, erro = 'empresa não encontrada' WHERE id = p_id;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'ignorado', 'empresa não encontrada');
  END IF;

  v_venc := (v_pay ->> 'dueDate')::date;
  SELECT f.id, f.situacao INTO v_fatura, v_situacao FROM adm.faturas f WHERE f.asaas_payment_id = v_pay ->> 'id';

  IF v_fatura IS NULL THEN
    IF p_evento IN ('PAYMENT_DELETED') THEN
      UPDATE adm.asaas_eventos SET processado = true WHERE id = p_id;
      RETURN pg_catalog.jsonb_build_object('ok', true, 'ignorado', 'fatura inexistente apagada');
    END IF;
    INSERT INTO adm.faturas (empresa_id, competencia, vencimento, valor, asaas_payment_id, invoice_url, forma)
    VALUES (v_empresa, pg_catalog.date_trunc('month', v_venc)::date, v_venc, (v_pay ->> 'value')::numeric,
            v_pay ->> 'id', v_pay ->> 'invoiceUrl', pg_catalog.lower(v_pay ->> 'billingType'))
    RETURNING id, situacao INTO v_fatura, v_situacao;
  ELSE
    UPDATE adm.faturas f SET
      vencimento = coalesce(v_venc, f.vencimento),
      competencia = coalesce(pg_catalog.date_trunc('month', v_venc)::date, f.competencia),
      valor = coalesce((v_pay ->> 'value')::numeric, f.valor),
      invoice_url = coalesce(v_pay ->> 'invoiceUrl', f.invoice_url),
      atualizado_em = pg_catalog.now()
    WHERE f.id = v_fatura;
  END IF;

  v_pago := coalesce((v_pay ->> 'confirmedDate')::timestamptz, (v_pay ->> 'paymentDate')::timestamptz,
                     (v_pay ->> 'clientPaymentDate')::timestamptz, pg_catalog.now());

  IF p_evento IN ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH') THEN
    UPDATE adm.faturas f SET situacao = 'paga', pago_em = v_pago,
           forma = coalesce(pg_catalog.lower(v_pay ->> 'billingType'), f.forma), atualizado_em = pg_catalog.now()
     WHERE f.id = v_fatura AND f.situacao <> 'paga';
  ELSIF p_evento = 'PAYMENT_OVERDUE' THEN
    UPDATE adm.faturas f SET situacao = 'vencida', atualizado_em = pg_catalog.now()
     WHERE f.id = v_fatura AND f.situacao = 'a_vencer';
  ELSIF p_evento = 'PAYMENT_DELETED' THEN
    UPDATE adm.faturas f SET situacao = 'cancelada', atualizado_em = pg_catalog.now()
     WHERE f.id = v_fatura AND f.situacao IN ('a_vencer', 'vencida');
  ELSIF p_evento = 'PAYMENT_RESTORED' THEN
    UPDATE adm.faturas f SET situacao = CASE WHEN f.vencimento < adm.hoje() THEN 'vencida' ELSE 'a_vencer' END,
           atualizado_em = pg_catalog.now()
     WHERE f.id = v_fatura AND f.situacao = 'cancelada';
  ELSIF p_evento IN ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE') THEN
    -- dinheiro voltou: a dívida reabre (e a régua volta a contar)
    UPDATE adm.faturas f SET situacao = CASE WHEN f.vencimento < adm.hoje() THEN 'vencida' ELSE 'a_vencer' END,
           pago_em = NULL, atualizado_em = pg_catalog.now()
     WHERE f.id = v_fatura AND f.situacao = 'paga';
  END IF;

  INSERT INTO adm.eventos (empresa_id, fatura_id, tipo, detalhe, autor)
  VALUES (v_empresa, v_fatura, 'asaas',
          pg_catalog.jsonb_build_object('evento', p_evento, 'payment', v_pay ->> 'id', 'status', v_pay ->> 'status',
                                        'valor', v_pay ->> 'value'),
          'asaas');
  UPDATE adm.asaas_eventos SET processado = true WHERE id = p_id;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'empresa', v_empresa, 'fatura', v_fatura,
         'situacao_empresa', (SELECT e.situacao FROM adm.empresas e WHERE e.id = v_empresa));
END;
$$;

REVOKE ALL ON FUNCTION
  public.adm_srv_empresa_cobranca(uuid),
  public.adm_srv_gravar_asaas(uuid, text, text, uuid),
  public.adm_srv_asaas_evento(text, text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.adm_srv_empresa_cobranca(uuid),
  public.adm_srv_gravar_asaas(uuid, text, text, uuid),
  public.adm_srv_asaas_evento(text, text, jsonb)
TO service_role;
