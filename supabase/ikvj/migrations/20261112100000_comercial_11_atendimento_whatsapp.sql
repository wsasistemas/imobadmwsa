-- =====================================================================================
-- ImobAdm — Atendimento ONLINE (Fase 3): WhatsApp de verdade pelo OpeWA (sessão wsa-admin). Aditiva.
-- Boas-vindas na janela/limite/intervalo, entrada das mensagens (webhook), PARAR, passagem para consultor (rodízio),
-- 1 lembrete sem resposta e as conversas no painel. Edge Functions: atend-cron, atend-webhook, atend-painel.
-- =====================================================================================

ALTER TABLE comercial.atend_config
  ADD COLUMN IF NOT EXISTS proximo_envio_em timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_id text,
  ADD COLUMN IF NOT EXISTS webhook_vault_id uuid;

ALTER TABLE comercial.atend_conversas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'boas_vindas' CHECK (origem IN ('boas_vindas', 'lead')),
  ADD COLUMN IF NOT EXISTS chat_id text;                -- para onde responder (o id que o WhatsApp mandou)

ALTER TABLE comercial.atend_consultores ADD COLUMN IF NOT EXISTS ultimo_em timestamptz;

-- WhatsApp Web (OpeWA): começa com 30 boas-vindas por dia para não arriscar o número.
UPDATE comercial.atend_config SET bv_limite_dia = 30 WHERE bv_limite_dia = 80;

CREATE INDEX IF NOT EXISTS atend_conversas_criado_idx ON comercial.atend_conversas (criado_em) WHERE origem = 'boas_vindas';

-- Horário de São Paulo dentro da janela {"seg_sex": ["09:00","18:00"], "sab": [...], "dom": null}?
CREATE FUNCTION comercial.atend_na_janela(p_janela jsonb, p_ts timestamptz DEFAULT now()) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO ''
AS $$
  SELECT coalesce(pg_catalog.jsonb_typeof(f) = 'array' AND l::time >= (f ->> 0)::time AND l::time < (f ->> 1)::time, false)
    FROM (SELECT p_ts AT TIME ZONE 'America/Sao_Paulo' AS l) x
    CROSS JOIN LATERAL (SELECT p_janela -> CASE extract(dow FROM x.l)::int WHEN 0 THEN 'dom' WHEN 6 THEN 'sab' ELSE 'seg_sex' END AS f) y
$$;

-- Início do dia de hoje em São Paulo.
CREATE FUNCTION comercial.atend_hoje() RETURNS timestamptz
  LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT pg_catalog.date_trunc('day', pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' $$;

-- Contato pelo telefone que chegou no WhatsApp. Celular brasileiro pode vir com ou sem o 9 da frente.
CREATE FUNCTION comercial.atend_contato_por_fone(p_fone text) RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  d text := pg_catalog.regexp_replace(coalesce(p_fone, ''), '\D', '', 'g');
  v text[] := ARRAY[]::text[];
BEGIN
  IF d = '' THEN RETURN NULL; END IF;
  IF d ~ '^[0-9]{10,11}$' THEN d := '55' || d; END IF;
  v := v || d;
  IF d ~ '^55[0-9]{10}$' THEN v := v || (substr(d, 1, 4) || '9' || substr(d, 5)); END IF;
  IF d ~ '^55[0-9]{2}9[0-9]{8}$' THEN v := v || (substr(d, 1, 4) || substr(d, 6)); END IF;
  RETURN (SELECT c.id FROM comercial.contatos c WHERE c.whatsapp = ANY (v) ORDER BY c.atualizado_em DESC LIMIT 1);
END;
$$;

-- Edge Functions (service_role) ----------------------------------------------------------------------

-- Próximo lead da boas-vindas (1 por chamada). Já cria a conversa, o que tira o lead da fila.
CREATE FUNCTION public.com_srv_atend_bv_pegar() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  cfg comercial.atend_config;
  v_hoje integer;
  v_n record;
  v_conv uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('comercial.atend_bv'));
  SELECT * INTO cfg FROM comercial.atend_config c WHERE c.id;
  IF NOT cfg.ligado THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'desligado'); END IF;
  IF NOT comercial.atend_na_janela(cfg.bv_janela) THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'fora_da_janela'); END IF;
  IF cfg.proximo_envio_em IS NOT NULL AND pg_catalog.now() < cfg.proximo_envio_em THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'intervalo');
  END IF;
  SELECT count(*) INTO v_hoje FROM comercial.atend_conversas cv WHERE cv.origem = 'boas_vindas' AND cv.criado_em >= comercial.atend_hoje();
  IF v_hoje >= cfg.bv_limite_dia THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'limite_do_dia'); END IF;

  SELECT n.id, c.nome, c.whatsapp, n.sistemas INTO v_n
    FROM comercial.negocios n
    JOIN comercial.contatos c ON c.id = n.contato_id
    JOIN comercial.etapas e ON e.id = n.etapa_id
   WHERE c.whatsapp IS NOT NULL AND NOT c.nao_whatsapp AND NOT e.final
     AND e.chave = ANY (cfg.bv_etapas) AND n.temperatura = ANY (cfg.bv_temperaturas)
     AND NOT EXISTS (SELECT 1 FROM comercial.atend_conversas cv WHERE cv.negocio_id = n.id)
     -- o mesmo telefone não recebe duas vezes (contato com mais de um negócio)
     AND NOT EXISTS (SELECT 1 FROM comercial.atend_conversas cv JOIN comercial.negocios n2 ON n2.id = cv.negocio_id WHERE n2.contato_id = c.id)
     AND (cfg.bv_quando = 'na_hora' OR n.criado_em < comercial.atend_hoje())
   ORDER BY n.pontuacao DESC NULLS LAST, n.criado_em
   LIMIT 1;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'fila_vazia'); END IF;

  INSERT INTO comercial.atend_conversas (negocio_id, situacao, origem, chat_id)
  VALUES (v_n.id, 'aguardando', 'boas_vindas', v_n.whatsapp || '@c.us') RETURNING id INTO v_conv;
  UPDATE comercial.atend_config c SET proximo_envio_em = pg_catalog.now()
    + pg_catalog.make_interval(secs => cfg.bv_intervalo[1] + floor(random() * (cfg.bv_intervalo[2] - cfg.bv_intervalo[1] + 1)))
   WHERE c.id;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'conversa_id', v_conv, 'negocio_id', v_n.id, 'nome', v_n.nome,
    'chat_id', v_n.whatsapp || '@c.us', 'sistemas', pg_catalog.to_jsonb(v_n.sistemas));
END;
$$;

CREATE FUNCTION public.com_srv_atend_bv_resultado(p_conversa uuid, p_ok boolean, p_texto text, p_wa_id text, p_erro text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_neg uuid;
BEGIN
  IF p_ok THEN
    UPDATE comercial.atend_conversas cv SET bv_enviada_em = pg_catalog.now(), ultima_msg_em = pg_catalog.now(), bv_erro = NULL
     WHERE cv.id = p_conversa RETURNING cv.negocio_id INTO v_neg;
    INSERT INTO comercial.atend_mensagens (conversa_id, autor, texto, wa_id, detalhe)
    VALUES (p_conversa, 'robo', p_texto, nullif(p_wa_id, ''), '{"tipo": "boas_vindas"}'::jsonb) ON CONFLICT (wa_id) DO NOTHING;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor) VALUES (v_neg, 'whatsapp', 'Boas-vindas do Atendimento ONLINE enviada', 'Sophia');
  ELSE
    UPDATE comercial.atend_conversas cv SET situacao = 'falhou', bv_erro = left(coalesce(p_erro, 'erro'), 300)
     WHERE cv.id = p_conversa RETURNING cv.negocio_id INTO v_neg;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
    VALUES (v_neg, 'whatsapp', 'Boas-vindas do Atendimento ONLINE não saiu', pg_catalog.jsonb_build_object('erro', left(coalesce(p_erro, ''), 300)), 'Sophia');
  END IF;
END;
$$;

-- Mensagem que chegou do WhatsApp: grava e diz o que fazer (responder, sair, só registrar ou ignorar).
CREATE FUNCTION public.com_srv_atend_entrada(p_fone text, p_texto text, p_wa_id text, p_chat_id text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  cfg comercial.atend_config;
  v_contato uuid;
  v_neg uuid;
  v_conv comercial.atend_conversas;
  v_txt text := left(pg_catalog.btrim(coalesce(p_texto, '')), 2000);
  v_lead jsonb;
BEGIN
  IF nullif(p_wa_id, '') IS NOT NULL AND EXISTS (SELECT 1 FROM comercial.atend_mensagens m WHERE m.wa_id = p_wa_id) THEN
    RETURN pg_catalog.jsonb_build_object('acao', 'duplicada');
  END IF;
  SELECT * INTO cfg FROM comercial.atend_config c WHERE c.id;
  v_contato := comercial.atend_contato_por_fone(p_fone);
  IF v_contato IS NULL THEN RETURN pg_catalog.jsonb_build_object('acao', 'ignorar', 'motivo', 'numero_desconhecido'); END IF;

  -- negócio aberto mais recente do contato (ou o mais recente, se todos fechados)
  SELECT n.id INTO v_neg FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
   WHERE n.contato_id = v_contato ORDER BY e.final, n.criado_em DESC LIMIT 1;
  SELECT cv.* INTO v_conv FROM comercial.atend_conversas cv JOIN comercial.negocios n ON n.id = cv.negocio_id
   WHERE n.contato_id = v_contato ORDER BY cv.criado_em DESC LIMIT 1;

  IF v_conv.id IS NULL THEN
    -- O lead escreveu primeiro: a Sophia só assume se ele estiver apto pelas regras e o robô estiver ligado.
    IF NOT cfg.ligado OR v_neg IS NULL OR comercial.atend_motivo_fora(v_neg) IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('acao', 'ignorar', 'motivo', 'fora_do_robo');
    END IF;
    INSERT INTO comercial.atend_conversas (negocio_id, situacao, origem, chat_id) VALUES (v_neg, 'robo', 'lead', p_chat_id) RETURNING * INTO v_conv;
  END IF;

  INSERT INTO comercial.atend_mensagens (conversa_id, autor, texto, wa_id) VALUES (v_conv.id, 'lead', v_txt, nullif(p_wa_id, ''));
  UPDATE comercial.atend_conversas cv SET ultima_msg_em = pg_catalog.now(), ultima_msg_lead_em = pg_catalog.now(),
         chat_id = coalesce(nullif(p_chat_id, ''), cv.chat_id) WHERE cv.id = v_conv.id;
  UPDATE comercial.negocios n SET ultima_interacao = pg_catalog.now() WHERE n.id = v_conv.negocio_id;

  -- PARAR / SAIR: a mensagem inteira é uma das palavras de saída.
  IF pg_catalog.upper(pg_catalog.regexp_replace(v_txt, '[[:punct:][:space:]]+$', '')) = ANY (cfg.palavras_sair) THEN
    UPDATE comercial.contatos c SET nao_whatsapp = true, atualizado_em = pg_catalog.now() WHERE c.id = v_contato;
    UPDATE comercial.atend_conversas cv SET situacao = 'saiu' WHERE cv.id = v_conv.id;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor) VALUES (v_conv.negocio_id, 'whatsapp', 'Pediu para não receber mais WhatsApp', 'Sophia');
    RETURN pg_catalog.jsonb_build_object('acao', 'sair', 'conversa_id', v_conv.id, 'chat_id', coalesce(nullif(p_chat_id, ''), v_conv.chat_id),
      'nome', (SELECT c.nome FROM comercial.contatos c WHERE c.id = v_contato));
  END IF;

  IF v_conv.situacao IN ('consultor', 'saiu', 'encerrada') THEN
    RETURN pg_catalog.jsonb_build_object('acao', 'registrar', 'situacao', v_conv.situacao);
  END IF;
  IF NOT cfg.ligado THEN RETURN pg_catalog.jsonb_build_object('acao', 'registrar', 'situacao', 'robo_desligado'); END IF;
  UPDATE comercial.atend_conversas cv SET situacao = 'robo' WHERE cv.id = v_conv.id AND cv.situacao <> 'robo';

  SELECT pg_catalog.jsonb_build_object('nome', coalesce(c.nome, 'Lead'), 'empresa', c.empresa_nome, 'temperatura', coalesce(n.temperatura, 'morno'),
           'pontuacao', coalesce(n.pontuacao, 50), 'sistemas', pg_catalog.to_jsonb(n.sistemas)), n.token_agenda
    INTO v_lead, v_txt
    FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id WHERE n.id = v_conv.negocio_id;

  RETURN pg_catalog.jsonb_build_object('acao', 'responder', 'conversa_id', v_conv.id,
    'chat_id', coalesce(nullif(p_chat_id, ''), v_conv.chat_id), 'lead', v_lead, 'token_agenda', v_txt,
    'fora_do_horario', NOT comercial.atend_na_janela(cfg.horario_consultores),
    'historico', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('autor', CASE WHEN m.autor = 'lead' THEN 'lead' ELSE 'robo' END, 'texto', m.texto) ORDER BY m.criado_em, m.id)
                 FROM (SELECT * FROM comercial.atend_mensagens m WHERE m.conversa_id = v_conv.id AND m.autor <> 'sistema' ORDER BY m.criado_em DESC, m.id DESC LIMIT 30) m), '[]'::jsonb));
END;
$$;

-- Resposta da Sophia enviada: grava, atualiza nota e etapa e, se for o caso, passa para um consultor (rodízio).
CREATE FUNCTION public.com_srv_atend_resposta(p_conversa uuid, p_texto text, p_wa_id text, p_acoes jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_conv comercial.atend_conversas;
  v_n comercial.negocios;
  r jsonb;
  v_pts integer := nullif(p_acoes ->> 'temperatura', '')::numeric::integer;
  v_temp text;
  v_cons record;
BEGIN
  SELECT * INTO v_conv FROM comercial.atend_conversas cv WHERE cv.id = p_conversa;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok', false); END IF;
  SELECT * INTO v_n FROM comercial.negocios n WHERE n.id = v_conv.negocio_id;

  INSERT INTO comercial.atend_mensagens (conversa_id, autor, texto, wa_id, detalhe)
  VALUES (p_conversa, 'robo', p_texto, nullif(p_wa_id, ''), coalesce(p_acoes, '{}'::jsonb)) ON CONFLICT (wa_id) DO NOTHING;
  UPDATE comercial.atend_conversas cv SET ultima_msg_em = pg_catalog.now() WHERE cv.id = p_conversa;

  -- Nota e temperatura (pelos limites da Qualificação), menos quando a temperatura foi travada à mão.
  IF v_pts IS NOT NULL AND NOT coalesce((v_n.classificacao ->> 'manual')::boolean, false) THEN
    SELECT c.regras INTO r FROM comercial.config_qualificacao c WHERE c.id;
    v_pts := greatest(0, least(100, v_pts));
    v_temp := CASE WHEN v_pts >= coalesce((r #>> '{limites,quente}')::int, 60) THEN 'quente'
                   WHEN v_pts >= coalesce((r #>> '{limites,morno}')::int, 35) THEN 'morno' ELSE 'frio' END;
    UPDATE comercial.negocios n SET pontuacao = v_pts, temperatura = v_temp, classificado_em = pg_catalog.now(),
           classificacao = n.classificacao || pg_catalog.jsonb_build_object('robo', true)
     WHERE n.id = v_n.id AND (n.pontuacao IS DISTINCT FROM v_pts OR n.temperatura IS DISTINCT FROM v_temp);
  END IF;

  IF p_acoes ->> 'etapa' = 'qualificacao' AND v_n.etapa_id = (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'novo_lead') THEN
    UPDATE comercial.negocios n SET etapa_id = (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'qualificacao') WHERE n.id = v_n.id;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor) VALUES (v_n.id, 'etapa', 'Novo lead → Qualificação (Atendimento ONLINE)', 'Sophia');
  END IF;

  IF coalesce((p_acoes ->> 'passar_consultor')::boolean, false) AND v_conv.situacao <> 'consultor' THEN
    SELECT ac.vendedor_id, v.nome, v.whatsapp INTO v_cons
      FROM comercial.atend_consultores ac JOIN comercial.vendedores v ON v.id = ac.vendedor_id
     WHERE ac.apto AND v.ativo AND (cardinality(ac.apps) = 0 OR ac.apps && v_n.sistemas)
     ORDER BY ac.ultimo_em NULLS FIRST, ac.ordem
     LIMIT 1 FOR UPDATE OF ac;
    UPDATE comercial.atend_conversas cv SET situacao = 'consultor', consultor_id = v_cons.vendedor_id WHERE cv.id = p_conversa;
    IF v_cons.vendedor_id IS NOT NULL THEN
      UPDATE comercial.atend_consultores ac SET ultimo_em = pg_catalog.now() WHERE ac.vendedor_id = v_cons.vendedor_id;
      UPDATE comercial.negocios n SET vendedor_id = v_cons.vendedor_id WHERE n.id = v_n.id;
    END IF;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
    VALUES (v_n.id, 'whatsapp', 'Sophia passou a conversa para ' || coalesce(v_cons.nome, 'um consultor (aguardando)'),
            pg_catalog.jsonb_build_object('motivo', p_acoes ->> 'motivo_consultor'), 'Sophia');
    RETURN pg_catalog.jsonb_build_object('ok', true, 'consultor', CASE WHEN v_cons.vendedor_id IS NULL THEN NULL ELSE
      pg_catalog.jsonb_build_object('nome', v_cons.nome, 'whatsapp', v_cons.whatsapp) END,
      'lead', (SELECT pg_catalog.jsonb_build_object('nome', c.nome, 'whatsapp', c.whatsapp, 'empresa', c.empresa_nome)
                 FROM comercial.contatos c WHERE c.id = v_n.contato_id));
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true);
END;
$$;

-- Lembrete único para quem parou de responder (só dentro da janela de envio).
CREATE FUNCTION public.com_srv_atend_lembretes_pegar() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  cfg comercial.atend_config;
  v jsonb;
BEGIN
  SELECT * INTO cfg FROM comercial.atend_config c WHERE c.id;
  IF NOT cfg.ligado OR cfg.retomar_horas = 0 OR NOT comercial.atend_na_janela(cfg.bv_janela) THEN RETURN '[]'::jsonb; END IF;
  -- Última mensagem foi da Sophia, sem resposta há X horas, e ainda não houve lembrete nesta conversa.
  WITH alvo AS (
    SELECT cv.id FROM comercial.atend_conversas cv
     WHERE cv.lembrete_em IS NULL AND cv.situacao IN ('robo', 'aguardando')
       AND (cv.bv_enviada_em IS NOT NULL OR cv.origem = 'lead')
       AND cv.ultima_msg_em < pg_catalog.now() - pg_catalog.make_interval(hours => cfg.retomar_horas)
       AND (SELECT m.autor FROM comercial.atend_mensagens m WHERE m.conversa_id = cv.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) = 'robo'
     ORDER BY cv.ultima_msg_em
     LIMIT 10
     FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE comercial.atend_conversas cv SET lembrete_em = pg_catalog.now() FROM alvo WHERE cv.id = alvo.id
    RETURNING cv.id, cv.chat_id, cv.negocio_id)
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('conversa_id', u.id, 'chat_id', u.chat_id, 'nome', c.nome)), '[]'::jsonb) INTO v
    FROM u JOIN comercial.negocios n ON n.id = u.negocio_id JOIN comercial.contatos c ON c.id = n.contato_id;
  RETURN v;
END;
$$;

-- Registra uma mensagem enviada fora do fluxo da IA (lembrete, despedida, consultor).
CREATE FUNCTION public.com_srv_atend_registrar(p_conversa uuid, p_autor text, p_texto text, p_wa_id text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  INSERT INTO comercial.atend_mensagens (conversa_id, autor, texto, wa_id) VALUES (p_conversa, p_autor, p_texto, nullif(p_wa_id, ''))
  ON CONFLICT (wa_id) DO NOTHING;
  UPDATE comercial.atend_conversas cv SET ultima_msg_em = pg_catalog.now() WHERE cv.id = p_conversa;
$$;

-- Mensagem que saiu do celular da sessão (o consultor respondendo direto no WhatsApp). O que o próprio robô
-- enviou já está gravado pelo id e é ignorado. Responder pelo celular pausa a Sophia nessa conversa.
CREATE FUNCTION public.com_srv_atend_saida_celular(p_fone text, p_texto text, p_wa_id text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_contato uuid;
  v_conv comercial.atend_conversas;
BEGIN
  IF nullif(p_wa_id, '') IS NULL OR EXISTS (SELECT 1 FROM comercial.atend_mensagens m WHERE m.wa_id = p_wa_id) THEN
    RETURN pg_catalog.jsonb_build_object('acao', 'ja_registrada');
  END IF;
  v_contato := comercial.atend_contato_por_fone(p_fone);
  SELECT cv.* INTO v_conv FROM comercial.atend_conversas cv JOIN comercial.negocios n ON n.id = cv.negocio_id
   WHERE n.contato_id = v_contato ORDER BY cv.criado_em DESC LIMIT 1;
  IF v_conv.id IS NULL THEN RETURN pg_catalog.jsonb_build_object('acao', 'ignorar'); END IF;
  -- Eco de algo que o robô ou o painel acabou de enviar (quando o OpeWA não devolveu o id no envio).
  IF EXISTS (SELECT 1 FROM comercial.atend_mensagens m WHERE m.conversa_id = v_conv.id AND m.autor IN ('robo', 'consultor')
              AND m.texto = coalesce(p_texto, '') AND m.criado_em > pg_catalog.now() - interval '3 minutes') THEN
    RETURN pg_catalog.jsonb_build_object('acao', 'ja_registrada');
  END IF;
  INSERT INTO comercial.atend_mensagens (conversa_id, autor, texto, wa_id, detalhe)
  VALUES (v_conv.id, 'consultor', left(coalesce(p_texto, ''), 2000), p_wa_id, '{"pelo": "celular"}'::jsonb) ON CONFLICT (wa_id) DO NOTHING;
  UPDATE comercial.atend_conversas cv SET ultima_msg_em = pg_catalog.now(),
         situacao = CASE WHEN cv.situacao IN ('robo', 'aguardando', 'falhou') THEN 'consultor' ELSE cv.situacao END
   WHERE cv.id = v_conv.id;
  IF v_conv.situacao IN ('robo', 'aguardando', 'falhou') THEN
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor)
    VALUES (v_conv.negocio_id, 'whatsapp', 'Consultor respondeu pelo celular: a Sophia pausou nesta conversa', 'Sophia');
  END IF;
  RETURN pg_catalog.jsonb_build_object('acao', 'consultor', 'conversa_id', v_conv.id);
END;
$$;

-- Destino de uma conversa (consultor respondendo pelo painel). Pausa o robô nela.
CREATE FUNCTION public.com_srv_atend_destino(p_conversa uuid) RETURNS text
  LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  UPDATE comercial.atend_conversas cv SET situacao = 'consultor' WHERE cv.id = p_conversa AND cv.situacao IN ('robo', 'aguardando', 'falhou')
  RETURNING cv.chat_id;
  SELECT coalesce(cv.chat_id, c.whatsapp || '@c.us') FROM comercial.atend_conversas cv
    JOIN comercial.negocios n ON n.id = cv.negocio_id JOIN comercial.contatos c ON c.id = n.contato_id
   WHERE cv.id = p_conversa AND cv.situacao <> 'saiu';
$$;

-- Segredo do webhook do OpeWA (assinatura HMAC), guardado no Vault.
CREATE FUNCTION public.com_srv_atend_webhook_segredo() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT comercial.vault_ler(c.webhook_vault_id) FROM comercial.atend_config c WHERE c.id $$;

CREATE FUNCTION public.com_srv_atend_webhook_gravar(p_segredo text, p_webhook_id text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v uuid;
BEGIN
  SELECT c.webhook_vault_id INTO v FROM comercial.atend_config c WHERE c.id;
  v := comercial.vault_gravar(v, p_segredo, 'atend_webhook');
  UPDATE comercial.atend_config c SET webhook_vault_id = v, webhook_id = p_webhook_id WHERE c.id;
END;
$$;

CREATE FUNCTION public.com_srv_atend_webhook_id() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT c.webhook_id FROM comercial.atend_config c WHERE c.id $$;

-- Painel (super admin) ----------------------------------------------------------------------------------
CREATE FUNCTION public.com_atend_conversas(p_busca text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  b text := nullif(pg_catalog.btrim(coalesce(p_busca, '')), '');
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.ord DESC NULLS LAST) FROM (
    SELECT pg_catalog.jsonb_build_object('id', cv.id, 'negocio_id', cv.negocio_id, 'nome', c.nome, 'empresa', c.empresa_nome, 'whatsapp', c.whatsapp,
             'temperatura', n.temperatura, 'pontuacao', n.pontuacao, 'situacao', cv.situacao, 'origem', cv.origem,
             'consultor', v.nome, 'bv_erro', cv.bv_erro, 'ultima_msg_em', cv.ultima_msg_em, 'ultima_msg_lead_em', cv.ultima_msg_lead_em,
             'ultima', (SELECT pg_catalog.jsonb_build_object('autor', m.autor, 'texto', left(m.texto, 120)) FROM comercial.atend_mensagens m
                         WHERE m.conversa_id = cv.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1)) AS x,
           coalesce(cv.ultima_msg_em, cv.criado_em) AS ord
      FROM comercial.atend_conversas cv
      JOIN comercial.negocios n ON n.id = cv.negocio_id
      JOIN comercial.contatos c ON c.id = n.contato_id
      LEFT JOIN comercial.vendedores v ON v.id = cv.consultor_id
     WHERE b IS NULL OR c.nome ILIKE '%' || b || '%' OR c.whatsapp LIKE '%' || pg_catalog.regexp_replace(b, '\D', '', 'g') || '%'
     ORDER BY coalesce(cv.ultima_msg_em, cv.criado_em) DESC NULLS LAST
     LIMIT 300) x), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_atend_mensagens(p_conversa uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto, 'detalhe', m.detalhe,
                     'criado_em', m.criado_em) ORDER BY m.criado_em, m.id)
                   FROM comercial.atend_mensagens m WHERE m.conversa_id = p_conversa), '[]'::jsonb);
END;
$$;

-- Assumir (consultor) ou devolver para a Sophia.
CREATE FUNCTION public.com_atend_assumir(p_conversa uuid, p_assumir boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_neg uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE comercial.atend_conversas cv SET situacao = CASE WHEN p_assumir THEN 'consultor' ELSE 'robo' END,
         consultor_id = CASE WHEN p_assumir THEN cv.consultor_id ELSE NULL END
   WHERE cv.id = p_conversa AND cv.situacao <> 'saiu' RETURNING cv.negocio_id INTO v_neg;
  IF v_neg IS NULL THEN RAISE EXCEPTION 'Conversa não encontrada ou o lead pediu para sair.'; END IF;
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor)
  VALUES (v_neg, 'whatsapp', CASE WHEN p_assumir THEN 'Consultor assumiu a conversa do Atendimento ONLINE' ELSE 'Conversa devolvida para a Sophia' END,
          coalesce((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), 'painel'));
END;
$$;

CREATE FUNCTION public.com_atend_whatsapp_info() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN (SELECT pg_catalog.jsonb_build_object(
    'webhook_conectado', c.webhook_id IS NOT NULL, 'proximo_envio_em', c.proximo_envio_em,
    'na_janela', comercial.atend_na_janela(c.bv_janela),
    'enviadas_hoje', (SELECT count(*) FROM comercial.atend_conversas cv WHERE cv.origem = 'boas_vindas' AND cv.criado_em >= comercial.atend_hoje()),
    'limite_dia', c.bv_limite_dia,
    'falhas_hoje', (SELECT count(*) FROM comercial.atend_conversas cv WHERE cv.situacao = 'falhou' AND cv.criado_em >= comercial.atend_hoje()))
    FROM comercial.atend_config c WHERE c.id);
END;
$$;

-- Permissões -------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION comercial.atend_na_janela(jsonb, timestamptz), comercial.atend_hoje(), comercial.atend_contato_por_fone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comercial.atend_na_janela(jsonb, timestamptz), comercial.atend_hoje(), comercial.atend_contato_por_fone(text) TO service_role;

REVOKE ALL ON FUNCTION public.com_srv_atend_bv_pegar(), public.com_srv_atend_bv_resultado(uuid, boolean, text, text, text),
  public.com_srv_atend_entrada(text, text, text, text), public.com_srv_atend_resposta(uuid, text, text, jsonb),
  public.com_srv_atend_lembretes_pegar(), public.com_srv_atend_registrar(uuid, text, text, text), public.com_srv_atend_destino(uuid), public.com_srv_atend_saida_celular(text, text, text),
  public.com_srv_atend_webhook_segredo(), public.com_srv_atend_webhook_gravar(text, text), public.com_srv_atend_webhook_id()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_atend_bv_pegar(), public.com_srv_atend_bv_resultado(uuid, boolean, text, text, text),
  public.com_srv_atend_entrada(text, text, text, text), public.com_srv_atend_resposta(uuid, text, text, jsonb),
  public.com_srv_atend_lembretes_pegar(), public.com_srv_atend_registrar(uuid, text, text, text), public.com_srv_atend_destino(uuid), public.com_srv_atend_saida_celular(text, text, text),
  public.com_srv_atend_webhook_segredo(), public.com_srv_atend_webhook_gravar(text, text), public.com_srv_atend_webhook_id()
  TO service_role;

REVOKE ALL ON FUNCTION public.com_atend_conversas(text), public.com_atend_mensagens(uuid), public.com_atend_assumir(uuid, boolean),
  public.com_atend_whatsapp_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_atend_conversas(text), public.com_atend_mensagens(uuid), public.com_atend_assumir(uuid, boolean),
  public.com_atend_whatsapp_info() TO authenticated;

-- Cron: a cada minuto, só com o robô ligado (boas-vindas e lembretes) -----------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('com-atend') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'com-atend');
    PERFORM cron.schedule('com-atend', '* * * * *', $job$
      select net.http_post(
        url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/atend-cron',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (select 1 from comercial.atend_config c where c.ligado);
    $job$);
  END IF;
END;
$$;
