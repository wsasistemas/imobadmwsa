-- =====================================================================================
-- ImobAdm — Fase 5: funções do comercial (aditiva)
--   comercial.normalizar_telefone(text)       → só dígitos com 55 (E.164 sem +), ou null
--   comercial.receber_lead(...)                entrada única de lead (site, Meta, ponte, importação)
--   comercial.mover_etapa(...)                 muda a etapa e registra; Ganho cria a empresa no adm
--   adm.criar_empresa_do_negocio(negocio)      empresa cobrada a partir do negócio ganho
--   gatilhos ponte: public.leads e public.saas_leads → receber_lead (o site atual continua funcionando)
--   public.com_srv_*                           para Edge Functions (service_role)
--   public.com_*                               para o painel (super admin)
-- =====================================================================================

CREATE FUNCTION comercial.normalizar_telefone(p text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) < 10 THEN NULL
    WHEN length(d) IN (10, 11) THEN '55' || d
    WHEN d LIKE '55%' AND length(d) IN (12, 13) THEN d
    WHEN length(d) BETWEEN 12 AND 15 THEN d          -- outro país, já com DDI
    ELSE NULL
  END
  FROM (SELECT nullif(pg_catalog.regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') AS d) x
$$;

CREATE FUNCTION comercial.novo_token() RETURNS text
  LANGUAGE sql VOLATILE SET search_path TO ''
AS $$ SELECT substr(pg_catalog.encode(pg_catalog.sha256(convert_to(gen_random_uuid()::text || pg_catalog.clock_timestamp()::text, 'UTF8')), 'hex'), 1, 32) $$;

-- Vendedor que recebe o próximo lead: o ativo com menos negócios abertos (rodízio simples).
CREATE FUNCTION comercial.proximo_vendedor() RETURNS uuid
  LANGUAGE sql STABLE SET search_path TO ''
AS $$
  SELECT v.id FROM comercial.vendedores v
   WHERE v.ativo AND v.recebe_leads
   ORDER BY (SELECT count(*) FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
              WHERE n.vendedor_id = v.id AND NOT e.final), v.criado_em
   LIMIT 1
$$;

CREATE FUNCTION comercial.receber_lead(
  p_origem text, p_dados jsonb, p_fonte_id uuid DEFAULT NULL, p_id_externo text DEFAULT NULL,
  p_boas_vindas boolean DEFAULT true, p_ip_hash text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_nome    text := nullif(pg_catalog.btrim(coalesce(p_dados ->> 'nome', p_dados ->> 'full_name', '')), '');
  v_email   text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_dados ->> 'email', ''))), '');
  v_whats   text := comercial.normalizar_telefone(coalesce(p_dados ->> 'whatsapp', p_dados ->> 'telefone', p_dados ->> 'phone_number'));
  v_empresa text := nullif(pg_catalog.btrim(coalesce(p_dados ->> 'empresa', p_dados ->> 'empresa_nome', p_dados ->> 'company_name', '')), '');
  v_sistema text := nullif(pg_catalog.btrim(coalesce(p_dados ->> 'sistema', p_dados ->> 'produto', p_dados ->> 'produto_interesse', '')), '');
  v_msg     text := nullif(pg_catalog.btrim(coalesce(p_dados ->> 'mensagem', CASE WHEN pg_catalog.jsonb_typeof(p_dados -> 'interesse') = 'string' THEN p_dados ->> 'interesse' END, '')), '');
  v_consent boolean := coalesce((p_dados ->> 'consentimento')::boolean, (p_dados ->> 'consentimento_em') IS NOT NULL, false);
  v_rec     bigint;
  v_c       comercial.contatos;
  v_n       comercial.negocios;
  v_novo_negocio boolean := false;
  v_rotulo  text;
BEGIN
  IF p_origem NOT IN ('site', 'instagram', 'facebook', 'linkedin', 'tiktok', 'manual', 'importado', 'whatsapp') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN v_email := NULL; END IF;
  IF v_sistema IS NULL AND p_fonte_id IS NOT NULL THEN
    SELECT f.sistema_padrao INTO v_sistema FROM comercial.fontes f WHERE f.id = p_fonte_id;
  END IF;

  -- Idempotência: o mesmo evento (id externo) só entra uma vez.
  INSERT INTO comercial.leads_recebidos (fonte_id, origem, id_externo, ip_hash, payload)
  VALUES (p_fonte_id, p_origem, p_id_externo, p_ip_hash, coalesce(p_dados, '{}'::jsonb))
  ON CONFLICT (origem, id_externo) WHERE id_externo IS NOT NULL DO NOTHING
  RETURNING id INTO v_rec;
  IF v_rec IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'evento_repetido', true,
      'negocio_id', (SELECT r.negocio_id FROM comercial.leads_recebidos r WHERE r.origem = p_origem AND r.id_externo = p_id_externo));
  END IF;

  IF v_email IS NULL AND v_whats IS NULL THEN
    UPDATE comercial.leads_recebidos SET erro = 'sem WhatsApp nem e-mail válido' WHERE id = v_rec;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'erro', 'Informe um WhatsApp ou e-mail válido.');
  END IF;

  -- Contato: pelo WhatsApp primeiro, depois pelo e-mail.
  SELECT * INTO v_c FROM comercial.contatos c
   WHERE (v_whats IS NOT NULL AND c.whatsapp = v_whats) OR (v_email IS NOT NULL AND c.email = v_email)
   ORDER BY (c.whatsapp IS NOT DISTINCT FROM v_whats) DESC, c.criado_em
   LIMIT 1;

  IF v_c.id IS NULL THEN
    INSERT INTO comercial.contatos (nome, whatsapp, email, empresa_nome, cargo, origem, fonte_id, campanha, formulario,
                                    consentimento_lgpd, consentimento_em)
    VALUES (v_nome, v_whats, v_email, v_empresa, nullif(p_dados ->> 'cargo', ''), p_origem, p_fonte_id,
            nullif(p_dados ->> 'campanha', ''), nullif(coalesce(p_dados ->> 'formulario', p_dados ->> 'origem'), ''),
            v_consent, CASE WHEN v_consent THEN coalesce((p_dados ->> 'consentimento_em')::timestamptz, pg_catalog.now()) END)
    RETURNING * INTO v_c;
  ELSE
    -- Completa o que faltava, sem roubar e-mail/WhatsApp de outro contato.
    UPDATE comercial.contatos c SET
      nome = coalesce(c.nome, v_nome),
      empresa_nome = coalesce(c.empresa_nome, v_empresa),
      whatsapp = CASE WHEN c.whatsapp IS NULL AND v_whats IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM comercial.contatos o WHERE o.whatsapp = v_whats) THEN v_whats ELSE c.whatsapp END,
      email = CASE WHEN c.email IS NULL AND v_email IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM comercial.contatos o WHERE o.email = v_email) THEN v_email ELSE c.email END,
      consentimento_lgpd = c.consentimento_lgpd OR v_consent,
      consentimento_em = coalesce(c.consentimento_em, CASE WHEN v_consent THEN pg_catalog.now() END),
      atualizado_em = pg_catalog.now()
    WHERE c.id = v_c.id
    RETURNING * INTO v_c;
  END IF;

  v_rotulo := CASE p_origem WHEN 'site' THEN 'site' WHEN 'importado' THEN 'importação' ELSE p_origem END
              || coalesce(' (' || nullif(coalesce(p_dados ->> 'formulario', p_dados ->> 'origem'), '') || ')', '');

  -- Negócio aberto do contato? Então é lead repetido; senão abre um novo em "Novo lead".
  SELECT n.* INTO v_n FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
   WHERE n.contato_id = v_c.id AND NOT e.final
   ORDER BY n.criado_em DESC LIMIT 1;

  IF v_n.id IS NOT NULL THEN
    UPDATE comercial.negocios n SET ultima_interacao = pg_catalog.now(), atualizado_em = pg_catalog.now(),
           sistemas = CASE WHEN v_sistema IS NULL OR v_sistema = ANY (n.sistemas) THEN n.sistemas ELSE n.sistemas || v_sistema END
     WHERE n.id = v_n.id;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe)
    VALUES (v_n.id, 'lead_repetido', 'Pediu contato de novo pelo ' || v_rotulo,
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('mensagem', v_msg, 'sistema', v_sistema)));
  ELSE
    INSERT INTO comercial.negocios (contato_id, etapa_id, sistemas, vendedor_id, token_agenda, boas_vindas)
    VALUES (v_c.id, (SELECT e.id FROM comercial.etapas e WHERE e.chave = 'novo_lead'),
            CASE WHEN v_sistema IS NULL THEN '{}'::text[] ELSE ARRAY[v_sistema] END,
            comercial.proximo_vendedor(), comercial.novo_token(),
            CASE WHEN p_boas_vindas AND v_c.whatsapp IS NOT NULL THEN 'pendente' ELSE 'nao_enviar' END)
    RETURNING * INTO v_n;
    v_novo_negocio := true;
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe)
    VALUES (v_n.id, 'sistema', 'Lead recebido pelo ' || v_rotulo,
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('mensagem', v_msg, 'sistema', v_sistema)));
  END IF;

  UPDATE comercial.leads_recebidos SET negocio_id = v_n.id WHERE id = v_rec;
  IF p_fonte_id IS NOT NULL THEN
    UPDATE comercial.fontes f SET total_leads = f.total_leads + 1, ultimo_lead_em = pg_catalog.now() WHERE f.id = p_fonte_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'contato_id', v_c.id, 'negocio_id', v_n.id,
    'novo_negocio', v_novo_negocio, 'repetido', NOT v_novo_negocio, 'token_agenda', v_n.token_agenda);
END;
$$;

-- Empresa cobrada a partir do negócio ganho (os vínculos com schema/tenant são feitos na ficha).
CREATE FUNCTION adm.criar_empresa_do_negocio(p_negocio uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_n comercial.negocios;
  v_c comercial.contatos;
  v_id uuid;
BEGIN
  SELECT * INTO v_n FROM comercial.negocios n WHERE n.id = p_negocio;
  IF v_n.id IS NULL THEN RAISE EXCEPTION 'Negócio não encontrado.'; END IF;
  IF v_n.empresa_id IS NOT NULL THEN RETURN v_n.empresa_id; END IF;
  SELECT * INTO v_c FROM comercial.contatos c WHERE c.id = v_n.contato_id;
  INSERT INTO adm.empresas (razao_social, nome_fantasia, dono_nome, whatsapp, email_financeiro, negocio_id)
  VALUES (coalesce(v_c.empresa_nome, v_c.nome, 'Empresa sem nome'), v_c.empresa_nome, v_c.nome, v_c.whatsapp, v_c.email, v_n.id)
  RETURNING id INTO v_id;
  INSERT INTO adm.eventos (empresa_id, tipo, detalhe, autor)
  VALUES (v_id, 'empresa_criada', pg_catalog.jsonb_build_object('negocio_id', v_n.id, 'sistemas', v_n.sistemas), adm.autor_atual());
  UPDATE comercial.negocios SET empresa_id = v_id WHERE id = v_n.id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION comercial.mover_etapa(p_negocio uuid, p_etapa text, p_motivo text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_e  comercial.etapas;
  v_de text;
  v_empresa uuid;
BEGIN
  SELECT * INTO v_e FROM comercial.etapas e WHERE e.chave = p_etapa;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Etapa inválida: %', p_etapa; END IF;
  SELECT e.nome INTO v_de FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id WHERE n.id = p_negocio;
  IF v_de IS NULL THEN RAISE EXCEPTION 'Negócio não encontrado.'; END IF;
  IF p_etapa = 'perdido' AND coalesce(pg_catalog.btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo da perda.'; END IF;

  UPDATE comercial.negocios n SET etapa_id = v_e.id, ultima_interacao = pg_catalog.now(), atualizado_em = pg_catalog.now(),
         motivo_perda = CASE WHEN p_etapa = 'perdido' THEN p_motivo ELSE NULL END,
         fechado_em = CASE WHEN v_e.final THEN pg_catalog.now() ELSE NULL END
   WHERE n.id = p_negocio;
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe, autor)
  VALUES (p_negocio, 'etapa', v_de || ' → ' || v_e.nome,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('para', p_etapa, 'motivo', p_motivo)), adm.autor_atual());

  IF v_e.ganho THEN v_empresa := adm.criar_empresa_do_negocio(p_negocio); END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'etapa', p_etapa, 'empresa_id', v_empresa);
END;
$$;

-- Ponte: o site e as landings antigas gravam em public.leads / public.saas_leads; o lead também entra no funil.
-- Nunca derruba o insert do site: qualquer erro vira só um aviso no log.
CREATE FUNCTION comercial.trg_ponte_site() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_dados jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  BEGIN
    PERFORM comercial.receber_lead(
      CASE WHEN coalesce(v_dados ->> 'origem', '') ILIKE 'whatsapp%' THEN 'whatsapp' ELSE 'site' END,
      v_dados || pg_catalog.jsonb_build_object('formulario', coalesce(v_dados ->> 'origem', TG_TABLE_NAME)),
      (SELECT f.id FROM comercial.fontes f WHERE f.tipo = 'site' ORDER BY f.criado_em LIMIT 1),
      TG_TABLE_NAME || ':' || (v_dados ->> 'id'),
      true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[comercial] ponte % falhou: %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.leads') IS NOT NULL THEN
    CREATE TRIGGER comercial_ponte AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION comercial.trg_ponte_site();
  END IF;
  IF pg_catalog.to_regclass('public.saas_leads') IS NOT NULL THEN
    CREATE TRIGGER comercial_ponte AFTER INSERT ON public.saas_leads FOR EACH ROW EXECUTE FUNCTION comercial.trg_ponte_site();
  END IF;
END $$;

-- Carga inicial: o que já está em public.leads e public.saas_leads entra como "importado", sem WhatsApp.
DO $$
DECLARE r record;
BEGIN
  IF pg_catalog.to_regclass('public.leads') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT id, to_jsonb(l) AS d FROM public.leads l ORDER BY created_at' LOOP
      PERFORM comercial.receber_lead('importado', r.d || jsonb_build_object('formulario', coalesce(r.d ->> 'origem', 'leads')),
                                     (SELECT f.id FROM comercial.fontes f WHERE f.tipo = 'site' ORDER BY f.criado_em LIMIT 1), 'leads:' || r.id, false);
    END LOOP;
  END IF;
  IF pg_catalog.to_regclass('public.saas_leads') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT id, to_jsonb(l) AS d FROM public.saas_leads l ORDER BY criado_em' LOOP
      PERFORM comercial.receber_lead('importado', r.d || jsonb_build_object('formulario', coalesce(r.d ->> 'origem', 'saas_leads')),
                                     (SELECT f.id FROM comercial.fontes f WHERE f.tipo = 'site' ORDER BY f.criado_em LIMIT 1), 'saas_leads:' || r.id, false);
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- Para as Edge Functions (service_role)
-- ---------------------------------------------------------------------------------------
CREATE FUNCTION public.com_srv_fonte_por_chave(p_hash text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object('id', f.id, 'tipo', f.tipo, 'nome', f.nome, 'dominio', f.dominio)
    FROM comercial.fontes f WHERE f.chave_hash = p_hash AND f.ativo
$$;

/** Quantos leads esse IP mandou nos últimos minutos (limite contra robô). */
CREATE FUNCTION public.com_srv_leads_do_ip(p_ip_hash text, p_minutos integer) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT count(*)::integer FROM comercial.leads_recebidos r
   WHERE r.ip_hash = p_ip_hash AND r.recebido_em > pg_catalog.now() - pg_catalog.make_interval(mins => p_minutos)
$$;

CREATE FUNCTION public.com_srv_receber_lead(p_origem text, p_dados jsonb, p_fonte_id uuid, p_id_externo text, p_ip_hash text)
  RETURNS jsonb
  LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$ SELECT comercial.receber_lead(p_origem, p_dados, p_fonte_id, p_id_externo, true, p_ip_hash) $$;

/** Boas-vindas pendentes: só leads das últimas 48 h (lead antigo não recebe mensagem atrasada). */
CREATE FUNCTION public.com_srv_boas_vindas_pendentes() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'negocio_id', n.id, 'nome', coalesce(c.nome, ''), 'whatsapp', c.whatsapp, 'token_agenda', n.token_agenda)
           ORDER BY n.criado_em), '[]'::jsonb)
    FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id
   WHERE n.boas_vindas = 'pendente' AND c.whatsapp IS NOT NULL AND n.criado_em > pg_catalog.now() - interval '48 hours'
$$;

CREATE FUNCTION public.com_srv_boas_vindas_resultado(p_negocio uuid, p_ok boolean, p_detalhe jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  UPDATE comercial.negocios SET boas_vindas = CASE WHEN p_ok THEN 'enviada' ELSE 'falhou' END,
         boas_vindas_em = pg_catalog.now()
   WHERE id = p_negocio AND boas_vindas = 'pendente';
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe)
  VALUES (p_negocio, 'whatsapp', CASE WHEN p_ok THEN 'Boas-vindas enviada no WhatsApp' ELSE 'Boas-vindas não enviada' END,
          coalesce(p_detalhe, '{}'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------------------
-- Para o painel (super admin)
-- ---------------------------------------------------------------------------------------
CREATE FUNCTION public.com_listar_fontes() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', f.id, 'tipo', f.tipo, 'nome', f.nome, 'dominio', f.dominio, 'tem_chave', f.chave_hash IS NOT NULL,
      'chave_prefixo', f.chave_prefixo, 'sistema_padrao', f.sistema_padrao, 'ativo', f.ativo,
      'total_leads', f.total_leads, 'ultimo_lead_em', f.ultimo_lead_em, 'criado_em', f.criado_em) ORDER BY f.criado_em)
    FROM comercial.fontes f), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.com_salvar_fonte(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_id uuid := nullif(p ->> 'id', '')::uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_id IS NULL THEN
    INSERT INTO comercial.fontes (tipo, nome, dominio, sistema_padrao)
    VALUES (coalesce(nullif(p ->> 'tipo', ''), 'site'), p ->> 'nome', nullif(p ->> 'dominio', ''), nullif(p ->> 'sistema_padrao', ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE comercial.fontes f SET
      nome = coalesce(nullif(p ->> 'nome', ''), f.nome),
      dominio = CASE WHEN p ? 'dominio' THEN nullif(p ->> 'dominio', '') ELSE f.dominio END,
      sistema_padrao = CASE WHEN p ? 'sistema_padrao' THEN nullif(p ->> 'sistema_padrao', '') ELSE f.sistema_padrao END,
      ativo = coalesce((p ->> 'ativo')::boolean, f.ativo)
    WHERE f.id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

/** Gera uma chave nova para a fonte e devolve-a UMA vez (só o hash fica guardado). A anterior para de valer. */
CREATE FUNCTION public.com_gerar_chave_fonte(p_fonte uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_chave text := 'wsa_' || comercial.novo_token();
BEGIN
  PERFORM adm.exigir_super_admin();
  UPDATE comercial.fontes SET chave_hash = pg_catalog.encode(pg_catalog.sha256(convert_to(v_chave, 'UTF8')), 'hex'),
         chave_prefixo = substr(v_chave, 1, 10)
   WHERE id = p_fonte;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fonte não encontrada.'; END IF;
  RETURN v_chave;
END;
$$;

CREATE FUNCTION public.com_leads_recebidos(p_fonte uuid DEFAULT NULL, p_limite integer DEFAULT 50) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(x ORDER BY x.recebido_em DESC) FROM (
    SELECT r.id, r.origem, r.recebido_em, r.erro, r.negocio_id, f.nome AS fonte,
           c.nome, c.whatsapp, c.email, c.empresa_nome, e.nome AS etapa, n.boas_vindas,
           (SELECT a.tipo = 'lead_repetido' FROM comercial.atividades a WHERE a.negocio_id = n.id
             AND a.criado_em BETWEEN r.recebido_em - interval '5 seconds' AND r.recebido_em + interval '5 seconds'
             ORDER BY a.id DESC LIMIT 1) AS repetido
      FROM comercial.leads_recebidos r
      LEFT JOIN comercial.fontes f ON f.id = r.fonte_id
      LEFT JOIN comercial.negocios n ON n.id = r.negocio_id
      LEFT JOIN comercial.contatos c ON c.id = n.contato_id
      LEFT JOIN comercial.etapas e ON e.id = n.etapa_id
     WHERE p_fonte IS NULL OR r.fonte_id = p_fonte
     ORDER BY r.recebido_em DESC
     LIMIT least(coalesce(p_limite, 50), 500)) x), '[]'::jsonb);
END;
$$;

-- Permissões ----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA comercial TO service_role;
REVOKE ALL ON FUNCTION adm.criar_empresa_do_negocio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adm.criar_empresa_do_negocio(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.com_srv_fonte_por_chave(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_leads_do_ip(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_receber_lead(text, jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_boas_vindas_pendentes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.com_srv_boas_vindas_resultado(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_fonte_por_chave(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_leads_do_ip(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_receber_lead(text, jsonb, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_boas_vindas_pendentes() TO service_role;
GRANT EXECUTE ON FUNCTION public.com_srv_boas_vindas_resultado(uuid, boolean, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.com_listar_fontes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_salvar_fonte(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_gerar_chave_fonte(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_leads_recebidos(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_listar_fontes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_salvar_fonte(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_gerar_chave_fonte(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.com_leads_recebidos(uuid, integer) TO authenticated, service_role;

-- pg_cron: boas-vindas a cada minuto, só quando houver pendente (usa a mesma chave do Vault da régua).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('com-boas-vindas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'com-boas-vindas');
    PERFORM cron.schedule('com-boas-vindas', '* * * * *', $job$
      select net.http_post(
        url := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/com-boas-vindas',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-adm-chave', adm.cron_chave()),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      )
      where exists (select 1 from comercial.negocios n
                     where n.boas_vindas = 'pendente' and n.criado_em > now() - interval '48 hours');
    $job$);
  END IF;
END $$;
