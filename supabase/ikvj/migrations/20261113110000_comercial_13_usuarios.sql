-- =====================================================================================
-- ImobAdm — Configurações › Usuários (mockup aprovado em 13/11/2026). Aditiva.
-- Usuário = consultor (comercial.vendedores): papel, cargo, WhatsApp e os avisos que recebe pelo OpenWA.
-- A fila do Atendimento ONLINE continua em comercial.atend_consultores, editada por esta tela.
-- =====================================================================================

ALTER TABLE comercial.vendedores
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'consultor' CHECK (papel IN ('administrador', 'consultor')),
  ADD COLUMN IF NOT EXISTS avisos jsonb NOT NULL DEFAULT '{"reuniao_marcada": true, "pediu_consultor": true, "lembrete_1h": true, "remarcada": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

-- Desativar o usuário pausa a agenda dele; reativar devolve só as que foram pausadas assim.
ALTER TABLE comercial.agendas_google ADD COLUMN IF NOT EXISTS pausada_por_usuario boolean NOT NULL DEFAULT false;

-- Lembrete de 1 h antes para o consultor (o do lead é outro campo).
ALTER TABLE comercial.reunioes ADD COLUMN IF NOT EXISTS aviso_consultor_1h_em timestamptz;

-- O usuário criado sozinho ao conectar a agenda vira o Wagner (aprovado no mockup).
UPDATE comercial.vendedores v SET nome = 'Wagner Antunes', papel = 'administrador', atualizado_em = now()
 WHERE v.email = 'wsasistemas.ia@gmail.com' AND v.nome = 'wsasistemas.ia';

-- WhatsApp só com dígitos e 55 na frente; NULL quando vazio. Erro claro quando não dá para entender.
CREATE FUNCTION comercial.fone_normalizado(p text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $$
DECLARE
  d text := pg_catalog.regexp_replace(coalesce(p, ''), '\D', '', 'g');
BEGIN
  IF d = '' THEN RETURN NULL; END IF;
  IF d ~ '^[0-9]{10,11}$' THEN d := '55' || d; END IF;
  IF d !~ '^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'WhatsApp inválido: use DDD + número, ex.: (21) 99999-9999.'; END IF;
  RETURN d;
END;
$$;

-- Painel (super admin) ----------------------------------------------------------------------------
CREATE FUNCTION public.com_usuarios() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', v.id, 'nome', v.nome, 'email', v.email, 'whatsapp', v.whatsapp, 'cargo', v.cargo, 'papel', v.papel, 'ativo', v.ativo,
      'avisos', v.avisos, 'na_fila', ac.vendedor_id IS NOT NULL, 'apto', coalesce(ac.apto, false), 'apps', coalesce(ac.apps, '{}'),
      'agenda', (SELECT pg_catalog.jsonb_build_object('email', a.email, 'conectada', a.ativo AND a.token_valido, 'detalhe', a.detalhe)
                   FROM comercial.agendas_google a WHERE a.vendedor_id = v.id ORDER BY a.ativo DESC, a.criado_em DESC LIMIT 1),
      'reunioes_futuras', (SELECT count(*) FROM comercial.reunioes r WHERE r.vendedor_id = v.id AND r.situacao = 'marcada' AND r.inicio > pg_catalog.now()))
      ORDER BY v.ativo DESC, ac.ordem NULLS LAST, v.nome)
    FROM comercial.vendedores v LEFT JOIN comercial.atend_consultores ac ON ac.vendedor_id = v.id), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_usuario_salvar(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_nome text := pg_catalog.btrim(coalesce(p ->> 'nome', ''));
  v_whats text := comercial.fone_normalizado(p ->> 'whatsapp');
  v_papel text := coalesce(nullif(p ->> 'papel', ''), 'consultor');
  v_fila boolean := coalesce((p ->> 'na_fila')::boolean, false);
  v_apps text[] := coalesce((SELECT pg_catalog.array_agg(a) FROM pg_catalog.jsonb_array_elements_text(coalesce(p -> 'apps', '[]'::jsonb)) a), '{}');
  v_avisos jsonb := '{"reuniao_marcada": true, "pediu_consultor": true, "lembrete_1h": true, "remarcada": false}'::jsonb;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF length(v_nome) < 2 THEN RAISE EXCEPTION 'Informe o nome do usuário.'; END IF;
  IF v_papel NOT IN ('administrador', 'consultor') THEN RAISE EXCEPTION 'Papel inválido.'; END IF;
  IF v_fila AND v_whats IS NULL THEN RAISE EXCEPTION 'Para entrar na fila do atendimento, cadastre o WhatsApp.'; END IF;
  IF v_whats IS NOT NULL AND EXISTS (SELECT 1 FROM comercial.vendedores x WHERE x.whatsapp = v_whats AND x.ativo AND x.id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'Esse WhatsApp já é de outro usuário ativo.';
  END IF;
  IF pg_catalog.jsonb_typeof(p -> 'avisos') = 'object' THEN v_avisos := v_avisos || (p -> 'avisos'); END IF;
  IF v_id IS NOT NULL THEN
    SELECT v.avisos || coalesce(CASE WHEN pg_catalog.jsonb_typeof(p -> 'avisos') = 'object' THEN p -> 'avisos' END, '{}'::jsonb)
      INTO v_avisos FROM comercial.vendedores v WHERE v.id = v_id;
    UPDATE comercial.vendedores v SET nome = v_nome, email = nullif(pg_catalog.lower(pg_catalog.btrim(p ->> 'email')), ''), whatsapp = v_whats,
           cargo = nullif(pg_catalog.btrim(p ->> 'cargo'), ''), papel = v_papel, avisos = v_avisos, recebe_leads = v_fila, atualizado_em = pg_catalog.now()
     WHERE v.id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  ELSE
    INSERT INTO comercial.vendedores (nome, email, whatsapp, cargo, papel, avisos, recebe_leads)
    VALUES (v_nome, nullif(pg_catalog.lower(pg_catalog.btrim(p ->> 'email')), ''), v_whats, nullif(pg_catalog.btrim(p ->> 'cargo'), ''), v_papel, v_avisos, v_fila)
    RETURNING id INTO v_id;
  END IF;

  IF v_fila THEN
    INSERT INTO comercial.atend_consultores (vendedor_id, apps, apto, ordem)
    VALUES (v_id, v_apps, coalesce((p ->> 'apto')::boolean, true), coalesce((SELECT max(ac.ordem) FROM comercial.atend_consultores ac), 0) + 1)
    ON CONFLICT (vendedor_id) DO UPDATE SET apps = EXCLUDED.apps, apto = EXCLUDED.apto;
  ELSE
    DELETE FROM comercial.atend_consultores ac WHERE ac.vendedor_id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.com_usuario_ativo(p_id uuid, p_ativo boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE comercial.vendedores v SET ativo = p_ativo, recebe_leads = CASE WHEN p_ativo THEN v.recebe_leads ELSE false END, atualizado_em = pg_catalog.now()
   WHERE v.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF p_ativo THEN
    UPDATE comercial.agendas_google a SET ativo = true, pausada_por_usuario = false WHERE a.vendedor_id = p_id AND a.pausada_por_usuario;
  ELSE
    DELETE FROM comercial.atend_consultores ac WHERE ac.vendedor_id = p_id;
    UPDATE comercial.agendas_google a SET ativo = false, pausada_por_usuario = true WHERE a.vendedor_id = p_id AND a.ativo;
  END IF;
END;
$$;

-- Edge Functions (service_role) ------------------------------------------------------------------
-- O consultor com esse WhatsApp quer este aviso? (reuniao_marcada | pediu_consultor | lembrete_1h | remarcada)
CREATE FUNCTION public.com_srv_aviso_permitido(p_whatsapp text, p_tipo text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT coalesce((SELECT (v.avisos ->> p_tipo)::boolean FROM comercial.vendedores v
                    WHERE v.ativo AND v.whatsapp = pg_catalog.regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g') LIMIT 1), false)
$$;

-- Lembretes de 1 h antes para o consultor: marca e devolve só quem quer o aviso e tem WhatsApp.
CREATE FUNCTION public.com_srv_usuario_lembretes_pegar() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v jsonb;
BEGIN
  WITH alvo AS (
    SELECT r.id FROM comercial.reunioes r
     WHERE r.situacao = 'marcada' AND r.aviso_consultor_1h_em IS NULL
       AND r.inicio > pg_catalog.now() AND r.inicio <= pg_catalog.now() + interval '60 minutes'
     LIMIT 20 FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE comercial.reunioes r SET aviso_consultor_1h_em = pg_catalog.now() FROM alvo WHERE r.id = alvo.id
    RETURNING r.id, r.inicio, r.meet_url, r.negocio_id, r.vendedor_id, r.agenda_id)
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('reuniao_id', u.id, 'inicio', u.inicio, 'meet_url', u.meet_url,
           'consultor', vd.nome, 'whatsapp', vd.whatsapp, 'lead', c.nome, 'empresa', c.empresa_nome, 'lead_whatsapp', c.whatsapp)), '[]'::jsonb) INTO v
    FROM u
    LEFT JOIN comercial.agendas_google a ON a.id = u.agenda_id
    JOIN comercial.vendedores vd ON vd.id = coalesce(u.vendedor_id, a.vendedor_id)
    JOIN comercial.negocios n ON n.id = u.negocio_id
    JOIN comercial.contatos c ON c.id = n.contato_id
   WHERE vd.ativo AND vd.whatsapp IS NOT NULL AND coalesce((vd.avisos ->> 'lembrete_1h')::boolean, false);
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION comercial.fone_normalizado(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_usuarios(), public.com_usuario_salvar(jsonb), public.com_usuario_ativo(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_usuarios(), public.com_usuario_salvar(jsonb), public.com_usuario_ativo(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.com_srv_aviso_permitido(text, text), public.com_srv_usuario_lembretes_pegar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_aviso_permitido(text, text), public.com_srv_usuario_lembretes_pegar() TO service_role;

-- Cron: a cada 5 min, só quando há demonstração na próxima hora sem aviso ao consultor.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('com-avisos-consultor') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'com-avisos-consultor');
    PERFORM cron.schedule('com-avisos-consultor', '*/5 * * * *', $job$
      select net.http_post(
        url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/atend-cron',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
        body := '{"so_avisos": true}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (select 1 from comercial.reunioes r where r.situacao = 'marcada' and r.aviso_consultor_1h_em is null
                     and r.inicio > now() and r.inicio <= now() + interval '60 minutes');
    $job$);
  END IF;
END;
$$;
