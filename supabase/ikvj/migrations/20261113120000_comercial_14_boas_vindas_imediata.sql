-- =====================================================================================
-- ImobAdm — Atendimento ONLINE: boas-vindas imediata para quem acabou de chegar. Aditiva.
-- * Lead que entrou há pouco (padrão: 2 h) recebe na hora, mesmo fora da janela de envio; a janela vale para os antigos.
-- * Quem acabou de chegar vai na frente da fila (entre eles, o mais quente primeiro).
-- * Pedido de demonstração (formulário do site) é avisado ao robô, que já oferece os horários da agenda.
-- * Lead novo dispara o robô na mesma hora (sem esperar o cron de 1 minuto).
-- =====================================================================================

ALTER TABLE comercial.atend_config
  ADD COLUMN IF NOT EXISTS bv_imediato boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bv_imediato_horas integer NOT NULL DEFAULT 2 CHECK (bv_imediato_horas BETWEEN 1 AND 48);

-- Quando o lead chegou pela última vez (formulário ou importação) e se pediu demonstração.
CREATE FUNCTION comercial.atend_ultima_entrada(p_negocio uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'em', coalesce(max(lr.recebido_em), (SELECT n.criado_em FROM comercial.negocios n WHERE n.id = p_negocio)),
    'pediu_demo', coalesce(bool_or(lr.recebido_em > pg_catalog.now() - interval '7 days' AND (
        coalesce(lr.payload ->> 'origem', '') ILIKE '%demonstra%' OR coalesce(lr.payload ->> 'mensagem', '') ILIKE '%demonstra%'
        OR coalesce(lr.payload ->> 'interesse', '') ILIKE '%demonstra%')), false))
    FROM comercial.leads_recebidos lr WHERE lr.negocio_id = p_negocio
$$;

-- Mesma regra da Fase 3, agora com a exceção de quem acabou de chegar.
CREATE OR REPLACE FUNCTION public.com_srv_atend_bv_pegar() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  cfg comercial.atend_config;
  v_hoje integer;
  v_janela boolean;
  v_recente timestamptz;
  v_n record;
  v_conv uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('comercial.atend_bv'));
  SELECT * INTO cfg FROM comercial.atend_config c WHERE c.id;
  IF NOT cfg.ligado THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'desligado'); END IF;
  v_janela := comercial.atend_na_janela(cfg.bv_janela);
  v_recente := CASE WHEN cfg.bv_imediato THEN pg_catalog.now() - pg_catalog.make_interval(hours => cfg.bv_imediato_horas) END;
  IF NOT v_janela AND v_recente IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'fora_da_janela'); END IF;
  IF cfg.proximo_envio_em IS NOT NULL AND pg_catalog.now() < cfg.proximo_envio_em THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'intervalo');
  END IF;
  SELECT count(*) INTO v_hoje FROM comercial.atend_conversas cv WHERE cv.origem = 'boas_vindas' AND cv.criado_em >= comercial.atend_hoje();
  IF v_hoje >= cfg.bv_limite_dia THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'limite_do_dia'); END IF;

  SELECT n.id, c.nome, c.whatsapp, n.sistemas, n.token_agenda, ue.ent INTO v_n
    FROM comercial.negocios n
    JOIN comercial.contatos c ON c.id = n.contato_id
    JOIN comercial.etapas e ON e.id = n.etapa_id
    CROSS JOIN LATERAL (SELECT comercial.atend_ultima_entrada(n.id) AS ent) ue
   WHERE c.whatsapp IS NOT NULL AND NOT c.nao_whatsapp AND NOT e.final
     AND e.chave = ANY (cfg.bv_etapas) AND n.temperatura = ANY (cfg.bv_temperaturas)
     AND NOT EXISTS (SELECT 1 FROM comercial.atend_conversas cv WHERE cv.negocio_id = n.id)
     AND NOT EXISTS (SELECT 1 FROM comercial.atend_conversas cv JOIN comercial.negocios n2 ON n2.id = cv.negocio_id WHERE n2.contato_id = c.id)
     -- fora da janela, só quem acabou de chegar; dentro dela, também os antigos (respeitando "uma vez por dia, às 9h")
     AND ((v_recente IS NOT NULL AND (ue.ent ->> 'em')::timestamptz >= v_recente)
          OR (v_janela AND (cfg.bv_quando = 'na_hora' OR n.criado_em < comercial.atend_hoje())))
   ORDER BY ((v_recente IS NOT NULL AND (ue.ent ->> 'em')::timestamptz >= v_recente)) DESC,
            n.pontuacao DESC NULLS LAST, (ue.ent ->> 'em')::timestamptz DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', CASE WHEN v_janela THEN 'fila_vazia' ELSE 'fora_da_janela' END); END IF;

  INSERT INTO comercial.atend_conversas (negocio_id, situacao, origem, chat_id)
  VALUES (v_n.id, 'aguardando', 'boas_vindas', v_n.whatsapp || '@c.us') RETURNING id INTO v_conv;
  UPDATE comercial.atend_config c SET proximo_envio_em = pg_catalog.now()
    + pg_catalog.make_interval(secs => cfg.bv_intervalo[1] + floor(random() * (cfg.bv_intervalo[2] - cfg.bv_intervalo[1] + 1)))
   WHERE c.id;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'conversa_id', v_conv, 'negocio_id', v_n.id, 'nome', v_n.nome,
    'chat_id', v_n.whatsapp || '@c.us', 'sistemas', pg_catalog.to_jsonb(v_n.sistemas), 'token_agenda', v_n.token_agenda,
    'pediu_demo', coalesce((v_n.ent ->> 'pediu_demo')::boolean, false));
END;
$$;

-- Lead novo chegou: chama o robô na hora (o envio em si respeita todas as regras acima).
CREATE FUNCTION comercial.atend_disparar_robo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NEW.negocio_id IS NOT NULL AND EXISTS (SELECT 1 FROM comercial.atend_config c WHERE c.id AND c.ligado AND c.bv_imediato)
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'net') THEN
    PERFORM net.http_post(
      url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/atend-cron',
      headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
      body := '{"lead_novo": true}'::jsonb,
      timeout_milliseconds := 55000);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- nunca atrapalha a entrada do lead
END;
$$;

DROP TRIGGER IF EXISTS atend_disparar_robo ON comercial.leads_recebidos;
CREATE TRIGGER atend_disparar_robo AFTER INSERT OR UPDATE OF negocio_id ON comercial.leads_recebidos
  FOR EACH ROW EXECUTE FUNCTION comercial.atend_disparar_robo();

-- Painel: liga/desliga a boas-vindas imediata e o prazo de "acabou de chegar".
CREATE FUNCTION public.com_atend_imediato_salvar(p_ativo boolean, p_horas integer) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE comercial.atend_config c SET bv_imediato = p_ativo, bv_imediato_horas = p_horas, atualizado_em = pg_catalog.now() WHERE c.id;
END;
$$;

REVOKE ALL ON FUNCTION comercial.atend_ultima_entrada(uuid), comercial.atend_disparar_robo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_atend_imediato_salvar(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_atend_imediato_salvar(boolean, integer) TO authenticated;
