-- =====================================================================================
-- ImobAdm — Atendimento ONLINE: a Sophia marca a demonstração com os horários livres do Google Agenda. Aditiva.
-- Guarda a oferta de horários de cada conversa, entrega a agenda ao simulador e diz quem avisar da reunião.
-- =====================================================================================

ALTER TABLE comercial.atend_conversas ADD COLUMN IF NOT EXISTS oferta jsonb;

-- Passo 4 do roteiro pré-preenchido: o sistema mostra os horários (a Sophia não manda mais link).
UPDATE comercial.atend_config c
   SET roteiro = jsonb_set(c.roteiro, '{3,descricao}',
       '"Ofereça 30 minutos com um consultor para ver o sistema funcionando. Quando o lead aceitar, o sistema mostra os horários livres da agenda para ele escolher."'::jsonb)
 WHERE c.roteiro -> 3 ->> 'descricao' = 'Ofereça 30 minutos com um consultor para ver o sistema funcionando e envie o link de agendamento.';

CREATE FUNCTION public.com_srv_atend_oferta(p_conversa uuid, p_oferta jsonb) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$ UPDATE comercial.atend_conversas cv SET oferta = p_oferta WHERE cv.id = p_conversa $$;

CREATE FUNCTION public.com_srv_atend_oferta_ler(p_conversa uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT cv.oferta FROM comercial.atend_conversas cv WHERE cv.id = p_conversa $$;

-- Agenda sem lead (simulador): mesmas peças de com_srv_agenda_contexto.
CREATE FUNCTION public.com_srv_atend_agenda_geral() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'negocio_id', NULL, 'nome', '', 'empresa', NULL, 'email', NULL, 'whatsapp', NULL, 'minha', NULL,
    'config', (SELECT pg_catalog.to_jsonb(x) FROM comercial.config_agenda x WHERE x.id),
    'agendas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', a.id, 'calendar_id', a.calendar_id,
                 'refresh_token', comercial.vault_ler(a.refresh_token_vault_id)) ORDER BY a.criado_em)
                 FROM comercial.agendas_google a WHERE a.ativo AND a.token_valido), '[]'::jsonb),
    'reunioes', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('agenda_id', r.agenda_id, 'inicio', r.inicio, 'fim', r.fim))
                 FROM comercial.reunioes r WHERE r.situacao = 'marcada' AND r.fim > pg_catalog.now()), '[]'::jsonb))
$$;

-- Quem avisar de uma reunião marcada pela Sophia (o vendedor da agenda) e os dados do lead para o aviso.
CREATE FUNCTION public.com_srv_atend_reuniao_aviso(p_reuniao uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'consultor', (SELECT pg_catalog.jsonb_build_object('nome', v.nome, 'whatsapp', v.whatsapp) FROM comercial.vendedores v
                   WHERE v.id = coalesce(r.vendedor_id, a.vendedor_id)),
    'lead', pg_catalog.jsonb_build_object('nome', c.nome, 'whatsapp', c.whatsapp, 'empresa', c.empresa_nome),
    'inicio', r.inicio, 'meet_url', r.meet_url)
    FROM comercial.reunioes r
    JOIN comercial.negocios n ON n.id = r.negocio_id
    JOIN comercial.contatos c ON c.id = n.contato_id
    LEFT JOIN comercial.agendas_google a ON a.id = r.agenda_id
   WHERE r.id = p_reuniao
$$;

REVOKE ALL ON FUNCTION public.com_srv_atend_oferta(uuid, jsonb), public.com_srv_atend_oferta_ler(uuid), public.com_srv_atend_agenda_geral(),
  public.com_srv_atend_reuniao_aviso(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_atend_oferta(uuid, jsonb), public.com_srv_atend_oferta_ler(uuid), public.com_srv_atend_agenda_geral(),
  public.com_srv_atend_reuniao_aviso(uuid) TO service_role;
