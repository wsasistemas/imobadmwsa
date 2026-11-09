-- =====================================================================================
-- ImobAdm — Fase 7: Google Agenda e agendamento automático (aditiva)
-- A reserva acontece aqui, com trava: a reunião é gravada ANTES de chamar o Google. Se o Google falhar, ela é solta.
-- O refresh token de cada agenda fica no Vault; só as funções com_srv_* (service_role) o devolvem.
-- =====================================================================================

ALTER TABLE comercial.agendas_google
  ADD COLUMN IF NOT EXISTS token_valido boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detalhe text;
ALTER TABLE comercial.reunioes
  ADD COLUMN IF NOT EXISTS agenda_id uuid REFERENCES comercial.agendas_google(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reunioes_agenda_idx ON comercial.reunioes (agenda_id, inicio) WHERE situacao = 'marcada';
CREATE INDEX IF NOT EXISTS reunioes_negocio_idx ON comercial.reunioes (negocio_id);

CREATE TABLE IF NOT EXISTS comercial.agenda_limite (
  chave   text NOT NULL,
  minuto  timestamptz NOT NULL,
  total   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, minuto)
);
ALTER TABLE comercial.agenda_limite ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comercial.agenda_limite FROM PUBLIC, anon, authenticated;
GRANT ALL ON comercial.agenda_limite TO service_role;

-- Negócio de um token válido: link dentro da validade e negócio ainda aberto.
CREATE FUNCTION comercial.negocio_do_token(p_token text) RETURNS uuid
  LANGUAGE sql STABLE SET search_path TO ''
AS $$
  SELECT n.id FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
   WHERE n.token_agenda = p_token AND n.token_expira_em > pg_catalog.now() AND NOT e.final
$$;

CREATE FUNCTION comercial.reservar(p_negocio uuid, p_inicio timestamptz, p_agendas uuid[], p_origem text, p_substitui uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_c comercial.config_agenda;
  v_fim timestamptz;
  v_a comercial.agendas_google;
  v_id uuid;
BEGIN
  -- Uma reserva por vez: dois leads no mesmo horário ficam em fila e o segundo vê o horário já ocupado.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('comercial.reservar'));
  SELECT * INTO v_c FROM comercial.config_agenda WHERE id;
  v_fim := p_inicio + pg_catalog.make_interval(mins => v_c.duracao_min);

  IF p_origem = 'lead' THEN
    IF p_inicio < pg_catalog.now() + pg_catalog.make_interval(mins => v_c.antecedencia_min) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'ocupado');
    END IF;
    IF EXISTS (SELECT 1 FROM comercial.reunioes r WHERE r.negocio_id = p_negocio AND r.situacao = 'marcada'
                AND r.inicio > pg_catalog.now() AND r.id IS DISTINCT FROM p_substitui) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'ja_marcada');
    END IF;
  END IF;

  SELECT a.* INTO v_a FROM comercial.agendas_google a
   WHERE a.id = ANY (p_agendas) AND a.ativo AND a.token_valido
     AND NOT EXISTS (SELECT 1 FROM comercial.reunioes r
                      WHERE r.agenda_id = a.id AND r.situacao = 'marcada' AND r.id IS DISTINCT FROM p_substitui
                        AND r.inicio < v_fim + pg_catalog.make_interval(mins => v_c.intervalo_min)
                        AND r.fim > p_inicio - pg_catalog.make_interval(mins => v_c.intervalo_min))
   ORDER BY CASE WHEN v_c.distribuicao = 'rodizio'
                 THEN (SELECT count(*) FROM comercial.reunioes r WHERE r.agenda_id = a.id AND r.situacao = 'marcada' AND r.inicio > pg_catalog.now())
                 ELSE 0 END,
            a.criado_em
   LIMIT 1;
  IF v_a.id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'ocupado'); END IF;

  INSERT INTO comercial.reunioes (negocio_id, vendedor_id, agenda_id, inicio, fim, origem, google_calendar_id)
  VALUES (p_negocio, v_a.vendedor_id, v_a.id, p_inicio, v_fim, p_origem, v_a.calendar_id)
  RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'reuniao_id', v_id, 'agenda_id', v_a.id, 'calendar_id', v_a.calendar_id,
    'refresh_token', comercial.vault_ler(v_a.refresh_token_vault_id), 'inicio', p_inicio, 'fim', v_fim, 'criar_meet', v_c.criar_meet);
END;
$$;

-- Edge Functions públicas (agenda-horarios, agenda-marcar) ---------------------------------
CREATE FUNCTION public.com_srv_agenda_limite(p_chave text, p_max integer) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v integer;
BEGIN
  DELETE FROM comercial.agenda_limite WHERE minuto < pg_catalog.now() - interval '10 minutes';
  INSERT INTO comercial.agenda_limite (chave, minuto, total) VALUES (p_chave, pg_catalog.date_trunc('minute', pg_catalog.now()), 1)
  ON CONFLICT (chave, minuto) DO UPDATE SET total = comercial.agenda_limite.total + 1
  RETURNING total INTO v;
  RETURN v <= p_max;
END;
$$;

CREATE FUNCTION public.com_srv_agenda_contexto(p_token text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_n uuid := comercial.negocio_do_token(p_token);
BEGIN
  IF v_n IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'negocio_id', n.id, 'nome', coalesce(c.nome, ''), 'empresa', c.empresa_nome, 'email', c.email, 'whatsapp', c.whatsapp,
      'config', (SELECT pg_catalog.to_jsonb(x) FROM comercial.config_agenda x WHERE x.id),
      'agendas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', a.id, 'calendar_id', a.calendar_id,
                   'refresh_token', comercial.vault_ler(a.refresh_token_vault_id)) ORDER BY a.criado_em)
                   FROM comercial.agendas_google a WHERE a.ativo AND a.token_valido), '[]'::jsonb),
      'reunioes', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('agenda_id', r.agenda_id, 'inicio', r.inicio, 'fim', r.fim))
                   FROM comercial.reunioes r WHERE r.situacao = 'marcada' AND r.fim > pg_catalog.now()), '[]'::jsonb),
      'minha', (SELECT pg_catalog.jsonb_build_object('id', r.id, 'inicio', r.inicio, 'fim', r.fim, 'meet_url', r.meet_url)
                  FROM comercial.reunioes r WHERE r.negocio_id = n.id AND r.situacao = 'marcada' AND r.inicio > pg_catalog.now()
                 ORDER BY r.inicio LIMIT 1))
      FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id
     WHERE n.id = v_n);
END;
$$;

CREATE FUNCTION public.com_srv_agenda_reservar(p_token text, p_inicio timestamptz, p_agendas uuid[], p_substitui uuid DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_n uuid := comercial.negocio_do_token(p_token);
BEGIN
  IF v_n IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'token'); END IF;
  IF p_substitui IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comercial.reunioes r WHERE r.id = p_substitui AND r.negocio_id = v_n AND r.situacao = 'marcada') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'token');
  END IF;
  RETURN comercial.reservar(v_n, p_inicio, p_agendas, 'lead', p_substitui);
END;
$$;

CREATE FUNCTION public.com_srv_agenda_reservar_equipe(p_negocio uuid, p_inicio timestamptz, p_agendas uuid[]) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM comercial.negocios n WHERE n.id = p_negocio) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'negocio');
  END IF;
  RETURN comercial.reservar(p_negocio, p_inicio, p_agendas, 'equipe', NULL);
END;
$$;

-- O Google aceitou: guarda o evento, encerra a reunião antiga (remarcação) e move o card.
CREATE FUNCTION public.com_srv_agenda_confirmar(p_reuniao uuid, p_evento text, p_meet text, p_substitui uuid DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_r comercial.reunioes;
  v_antiga comercial.reunioes;
  v_antiga_agenda comercial.agendas_google;
BEGIN
  UPDATE comercial.reunioes SET google_event_id = p_evento, meet_url = nullif(p_meet, '') WHERE id = p_reuniao RETURNING * INTO v_r;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'Reunião não encontrada.'; END IF;

  IF p_substitui IS NOT NULL THEN
    UPDATE comercial.reunioes SET situacao = 'cancelada' WHERE id = p_substitui AND negocio_id = v_r.negocio_id RETURNING * INTO v_antiga;
    SELECT * INTO v_antiga_agenda FROM comercial.agendas_google a WHERE a.id = v_antiga.agenda_id;
  END IF;

  IF (SELECT c.mover_card FROM comercial.config_agenda c WHERE c.id) THEN
    UPDATE comercial.negocios n SET etapa_id = (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'reuniao_agendada')
     WHERE n.id = v_r.negocio_id AND n.etapa_id IN (SELECT e.id FROM comercial.etapas e WHERE e.chave IN ('novo_lead', 'qualificacao'));
  END IF;
  UPDATE comercial.negocios SET ultima_interacao = pg_catalog.now() WHERE id = v_r.negocio_id;
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
  VALUES (v_r.negocio_id, 'sistema',
          CASE WHEN p_substitui IS NOT NULL THEN 'Reunião remarcada' ELSE 'Reunião marcada' END,
          pg_catalog.jsonb_build_object('reuniao_id', v_r.id, 'inicio', v_r.inicio, 'origem', v_r.origem),
          CASE WHEN v_r.origem = 'lead' THEN 'agendamento automático' ELSE 'equipe' END);

  RETURN pg_catalog.jsonb_build_object('ok', true,
    'antiga_evento', v_antiga.google_event_id, 'antiga_calendar', v_antiga.google_calendar_id,
    'antiga_refresh', CASE WHEN v_antiga_agenda.id IS NULL THEN NULL ELSE comercial.vault_ler(v_antiga_agenda.refresh_token_vault_id) END);
END;
$$;

-- O Google recusou: a reserva nunca existiu.
CREATE FUNCTION public.com_srv_agenda_soltar(p_reuniao uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  DELETE FROM comercial.reunioes WHERE id = p_reuniao AND google_event_id IS NULL;
END;
$$;

CREATE FUNCTION public.com_srv_agenda_cancelar(p_token text, p_reuniao uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_n uuid := comercial.negocio_do_token(p_token);
  v_r comercial.reunioes;
BEGIN
  IF v_n IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'token'); END IF;
  UPDATE comercial.reunioes SET situacao = 'cancelada'
   WHERE id = p_reuniao AND negocio_id = v_n AND situacao = 'marcada' RETURNING * INTO v_r;
  IF v_r.id IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok', false, 'motivo', 'reuniao'); END IF;
  UPDATE comercial.negocios n SET etapa_id = (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'qualificacao')
   WHERE n.id = v_n AND n.etapa_id = (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'reuniao_agendada');
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
  VALUES (v_n, 'sistema', 'Reunião cancelada pelo lead', pg_catalog.jsonb_build_object('reuniao_id', v_r.id), 'agendamento automático');
  RETURN pg_catalog.jsonb_build_object('ok', true, 'evento', v_r.google_event_id, 'calendar', v_r.google_calendar_id,
    'refresh_token', (SELECT comercial.vault_ler(a.refresh_token_vault_id) FROM comercial.agendas_google a WHERE a.id = v_r.agenda_id));
END;
$$;

-- Lembretes: marca antes de devolver, assim a mesma reunião nunca é avisada duas vezes.
CREATE FUNCTION public.com_srv_lembretes_pegar() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_c comercial.config_agenda;
  v jsonb := '[]'::jsonb;
  v_h24 jsonb;
  v_h1 jsonb;
BEGIN
  SELECT * INTO v_c FROM comercial.config_agenda WHERE id;

  IF coalesce((v_c.lembretes ->> 'h24')::boolean, false) THEN
    WITH u AS (
      UPDATE comercial.reunioes r SET lembrete_24h_em = pg_catalog.now()
       WHERE r.situacao = 'marcada' AND r.lembrete_24h_em IS NULL AND r.google_event_id IS NOT NULL
         AND r.inicio > pg_catalog.now() + interval '1 hour' AND r.inicio <= pg_catalog.now() + interval '24 hours'
         AND r.inicio - r.criado_em > interval '24 hours'
      RETURNING r.*)
    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tipo', 'h24', 'reuniao_id', u.id, 'inicio', u.inicio, 'meet_url', u.meet_url,
             'nome', c.nome, 'whatsapp', c.whatsapp, 'token_agenda', n.token_agenda)), '[]'::jsonb) INTO v_h24
      FROM u JOIN comercial.negocios n ON n.id = u.negocio_id JOIN comercial.contatos c ON c.id = n.contato_id;
    v := v || v_h24;
  END IF;

  IF coalesce((v_c.lembretes ->> 'h1')::boolean, false) THEN
    WITH u AS (
      UPDATE comercial.reunioes r SET lembrete_1h_em = pg_catalog.now()
       WHERE r.situacao = 'marcada' AND r.lembrete_1h_em IS NULL AND r.google_event_id IS NOT NULL
         AND r.inicio > pg_catalog.now() AND r.inicio <= pg_catalog.now() + interval '1 hour'
         AND r.inicio - r.criado_em > interval '1 hour'
      RETURNING r.*)
    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tipo', 'h1', 'reuniao_id', u.id, 'inicio', u.inicio, 'meet_url', u.meet_url,
             'nome', c.nome, 'whatsapp', c.whatsapp, 'token_agenda', n.token_agenda)), '[]'::jsonb) INTO v_h1
      FROM u JOIN comercial.negocios n ON n.id = u.negocio_id JOIN comercial.contatos c ON c.id = n.contato_id;
    v := v || v_h1;
  END IF;
  RETURN v;
END;
$$;

-- Conexão das agendas (adm-google) ---------------------------------------------------------
CREATE FUNCTION public.com_srv_google_gravar(p_email text, p_refresh text, p_vendedor uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_a comercial.agendas_google;
  v_vendedor uuid := p_vendedor;
BEGIN
  IF v_vendedor IS NULL THEN
    SELECT v.id INTO v_vendedor FROM comercial.vendedores v WHERE lower(v.email) = lower(p_email) ORDER BY v.criado_em LIMIT 1;
    IF v_vendedor IS NULL THEN
      INSERT INTO comercial.vendedores (nome, email) VALUES (split_part(p_email, '@', 1), p_email) RETURNING id INTO v_vendedor;
    END IF;
  END IF;
  SELECT * INTO v_a FROM comercial.agendas_google a WHERE lower(a.email) = lower(p_email) ORDER BY a.criado_em LIMIT 1;
  IF v_a.id IS NULL THEN
    INSERT INTO comercial.agendas_google (vendedor_id, email, refresh_token_vault_id)
    VALUES (v_vendedor, p_email, comercial.vault_gravar(NULL, p_refresh, 'adm_google_agenda')) RETURNING * INTO v_a;
  ELSE
    UPDATE comercial.agendas_google a SET vendedor_id = v_vendedor, ativo = true, token_valido = true, detalhe = NULL,
           refresh_token_vault_id = comercial.vault_gravar(a.refresh_token_vault_id, p_refresh, 'adm_google_agenda'),
           ultima_sincronizacao = pg_catalog.now()
     WHERE a.id = v_a.id RETURNING * INTO v_a;
  END IF;
  RETURN v_a.id;
END;
$$;

CREATE FUNCTION public.com_srv_google_agendas() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', a.id, 'email', a.email, 'calendar_id', a.calendar_id,
           'refresh_token', comercial.vault_ler(a.refresh_token_vault_id)) ORDER BY a.criado_em), '[]'::jsonb)
    FROM comercial.agendas_google a WHERE a.ativo AND a.token_valido
$$;

CREATE FUNCTION public.com_srv_google_situacao(p_agenda uuid, p_valido boolean, p_detalhe text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE comercial.agendas_google SET token_valido = p_valido, detalhe = p_detalhe, ultima_sincronizacao = pg_catalog.now() WHERE id = p_agenda;
END;
$$;

CREATE FUNCTION public.com_srv_google_desligar(p_agenda uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_a comercial.agendas_google;
  v_token text;
BEGIN
  SELECT * INTO v_a FROM comercial.agendas_google a WHERE a.id = p_agenda;
  IF v_a.id IS NULL THEN RETURN NULL; END IF;
  v_token := comercial.vault_ler(v_a.refresh_token_vault_id);
  PERFORM comercial.vault_apagar(v_a.refresh_token_vault_id);
  UPDATE comercial.agendas_google SET ativo = false, token_valido = false, refresh_token_vault_id = NULL, detalhe = 'Desconectada' WHERE id = p_agenda;
  RETURN v_token;
END;
$$;

CREATE FUNCTION public.com_agenda_duracao() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT c.duracao_min FROM comercial.config_agenda c WHERE c.id $$;
REVOKE ALL ON FUNCTION public.com_agenda_duracao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_agenda_duracao() TO service_role;

-- Painel (super admin) ---------------------------------------------------------------------
CREATE FUNCTION public.com_agenda_painel() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN pg_catalog.jsonb_build_object(
    'config', (SELECT pg_catalog.to_jsonb(c) FROM comercial.config_agenda c WHERE c.id),
    'agendas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', a.id, 'email', a.email, 'calendar_id', a.calendar_id, 'ativo', a.ativo,
        'token_valido', a.token_valido, 'detalhe', a.detalhe, 'vendedor_id', a.vendedor_id, 'vendedor', v.nome, 'ultima_sincronizacao', a.ultima_sincronizacao) ORDER BY a.criado_em)
        FROM comercial.agendas_google a LEFT JOIN comercial.vendedores v ON v.id = a.vendedor_id WHERE a.ativo), '[]'::jsonb),
    'vendedores', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id, 'nome', v.nome, 'email', v.email) ORDER BY v.nome)
        FROM comercial.vendedores v WHERE v.ativo), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.com_agenda_config_salvar(p jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF NOT (p -> 'horario' ->> 'inicio' < p -> 'horario' ->> 'fim') THEN RAISE EXCEPTION 'O início do atendimento precisa ser antes do fim.'; END IF;
  IF pg_catalog.jsonb_array_length(p -> 'horario' -> 'dias') = 0 THEN RAISE EXCEPTION 'Escolha pelo menos um dia de atendimento.'; END IF;
  UPDATE comercial.config_agenda SET
    duracao_min = (p ->> 'duracao_min')::integer, intervalo_min = (p ->> 'intervalo_min')::integer, horario = p -> 'horario',
    antecedencia_min = (p ->> 'antecedencia_min')::integer, criar_meet = (p ->> 'criar_meet')::boolean, lembretes = p -> 'lembretes',
    distribuicao = p ->> 'distribuicao', mover_card = (p ->> 'mover_card')::boolean, atualizado_em = pg_catalog.now()
   WHERE id;
END;
$$;

CREATE FUNCTION public.com_reunioes(p_de timestamptz, p_ate timestamptz) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', r.id, 'negocio_id', r.negocio_id, 'inicio', r.inicio, 'fim', r.fim, 'situacao', r.situacao, 'origem', r.origem, 'meet_url', r.meet_url,
      'lead', c.nome, 'empresa', c.empresa_nome, 'vendedor', v.nome) ORDER BY r.inicio)
    FROM comercial.reunioes r JOIN comercial.negocios n ON n.id = r.negocio_id JOIN comercial.contatos c ON c.id = n.contato_id
    LEFT JOIN comercial.vendedores v ON v.id = r.vendedor_id
   WHERE r.inicio >= p_de AND r.inicio < p_ate AND r.situacao <> 'cancelada'), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_reuniao_situacao(p_reuniao uuid, p_situacao text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF p_situacao NOT IN ('marcada', 'realizada', 'nao_compareceu') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
  UPDATE comercial.reunioes SET situacao = p_situacao WHERE id = p_reuniao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reunião não encontrada.'; END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('com-agenda-lembretes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'com-agenda-lembretes');
    PERFORM cron.schedule('com-agenda-lembretes', '*/5 * * * *', $job$
      select net.http_post(
        url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/agenda-lembretes',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (select 1 from comercial.reunioes r where r.situacao = 'marcada'
                     and r.inicio between now() and now() + interval '24 hours'
                     and (r.lembrete_24h_em is null or r.lembrete_1h_em is null));
    $job$);
  END IF;
END $$;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION comercial.negocio_do_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.reservar(uuid, timestamptz, uuid[], text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comercial.negocio_do_token(text), comercial.reservar(uuid, timestamptz, uuid[], text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.com_srv_agenda_limite(text, integer), public.com_srv_agenda_contexto(text),
  public.com_srv_agenda_reservar(text, timestamptz, uuid[], uuid), public.com_srv_agenda_reservar_equipe(uuid, timestamptz, uuid[]),
  public.com_srv_agenda_confirmar(uuid, text, text, uuid), public.com_srv_agenda_soltar(uuid), public.com_srv_agenda_cancelar(text, uuid),
  public.com_srv_lembretes_pegar(), public.com_srv_google_gravar(text, text, uuid), public.com_srv_google_agendas(),
  public.com_srv_google_situacao(uuid, boolean, text), public.com_srv_google_desligar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_agenda_limite(text, integer), public.com_srv_agenda_contexto(text),
  public.com_srv_agenda_reservar(text, timestamptz, uuid[], uuid), public.com_srv_agenda_reservar_equipe(uuid, timestamptz, uuid[]),
  public.com_srv_agenda_confirmar(uuid, text, text, uuid), public.com_srv_agenda_soltar(uuid), public.com_srv_agenda_cancelar(text, uuid),
  public.com_srv_lembretes_pegar(), public.com_srv_google_gravar(text, text, uuid), public.com_srv_google_agendas(),
  public.com_srv_google_situacao(uuid, boolean, text), public.com_srv_google_desligar(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.com_agenda_painel(), public.com_agenda_config_salvar(jsonb), public.com_reunioes(timestamptz, timestamptz),
  public.com_reuniao_situacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_agenda_painel(), public.com_agenda_config_salvar(jsonb), public.com_reunioes(timestamptz, timestamptz),
  public.com_reuniao_situacao(uuid, text) TO authenticated, service_role;
