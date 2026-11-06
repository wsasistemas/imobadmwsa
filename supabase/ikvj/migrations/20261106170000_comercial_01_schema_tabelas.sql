-- =====================================================================================
-- ImobAdm — Fase 5: schema comercial (funil B2B da WSA: leads → reunião → Ganho → empresa cobrada)
-- Aditiva. Não exposto na API: o painel usa RPCs public.com_* (super admin) e as Edge Functions usam
-- public.com_srv_* (service_role).
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS comercial;
REVOKE ALL ON SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA comercial TO service_role;

-- Vendedores (quem recebe os leads e as reuniões) -------------------------------------
CREATE TABLE comercial.vendedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid UNIQUE,                 -- auth.users (login compartilhado), quando tiver
  nome          text NOT NULL CHECK (length(btrim(nome)) > 0),
  email         text,
  whatsapp      text,
  ativo         boolean NOT NULL DEFAULT true,
  recebe_leads  boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Etapas do funil -----------------------------------------------------------------------
CREATE TABLE comercial.etapas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave   text NOT NULL UNIQUE CHECK (chave ~ '^[a-z_]+$'),
  nome    text NOT NULL,
  ordem   integer NOT NULL,
  cor     text NOT NULL DEFAULT 'primary',
  final   boolean NOT NULL DEFAULT false,
  ganho   boolean NOT NULL DEFAULT false
);
INSERT INTO comercial.etapas (chave, nome, ordem, cor, final, ganho) VALUES
  ('novo_lead',         'Novo lead',          1, 'info',     false, false),
  ('qualificacao',      'Qualificação',       2, 'primary',  false, false),
  ('reuniao_agendada',  'Reunião agendada',   3, 'abobora',  false, false),
  ('demonstracao',      'Demonstração feita', 4, 'primary',  false, false),
  ('proposta',          'Proposta enviada',   5, 'warning',  false, false),
  ('negociacao',        'Negociação',         6, 'warning',  false, false),
  ('ganho',             'Ganho',              7, 'success',  true,  true),
  ('perdido',           'Perdido',            8, 'muted',    true,  false);

-- Fontes de lead (site, landing pages, Meta, ...) ------------------------------------------
CREATE TABLE comercial.fontes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('site', 'meta', 'linkedin', 'tiktok', 'manual', 'whatsapp')),
  nome            text NOT NULL,
  dominio         text,
  chave_hash      text UNIQUE,     -- sha256 da chave do site; a chave em si nunca é guardada
  chave_prefixo   text,            -- 6 primeiros caracteres, só para identificar na tela
  sistema_padrao  text,            -- sistema de interesse quando o formulário não informa
  ativo           boolean NOT NULL DEFAULT true,
  total_leads     integer NOT NULL DEFAULT 0,
  ultimo_lead_em  timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO comercial.fontes (tipo, nome, dominio) VALUES ('site', 'Site WSA Sistemas', 'www.imobsystems.com.br');

-- Contatos ----------------------------------------------------------------------------------
CREATE TABLE comercial.contatos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text,
  whatsapp           text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),   -- só dígitos, com 55
  email              text CHECK (email IS NULL OR email = lower(email)),
  empresa_nome       text,
  cargo              text,
  origem             text NOT NULL CHECK (origem IN ('site', 'instagram', 'facebook', 'linkedin', 'tiktok', 'manual', 'importado', 'whatsapp')),
  fonte_id           uuid REFERENCES comercial.fontes(id) ON DELETE SET NULL,
  campanha           text,
  formulario         text,
  consentimento_lgpd boolean NOT NULL DEFAULT false,
  consentimento_em   timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CHECK (whatsapp IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX contatos_whatsapp_uq ON comercial.contatos (whatsapp) WHERE whatsapp IS NOT NULL;
CREATE UNIQUE INDEX contatos_email_uq ON comercial.contatos (email) WHERE email IS NOT NULL;

-- Negócios (cards do funil) ---------------------------------------------------------------
CREATE TABLE comercial.negocios (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id             uuid NOT NULL REFERENCES comercial.contatos(id) ON DELETE CASCADE,
  etapa_id               uuid NOT NULL REFERENCES comercial.etapas(id),
  sistemas               text[] NOT NULL DEFAULT '{}',     -- chaves dos apps de interesse (adm.sistemas.app)
  valor_mensal_previsto  numeric(12,2),
  vendedor_id            uuid REFERENCES comercial.vendedores(id) ON DELETE SET NULL,
  motivo_perda           text,
  empresa_id             uuid REFERENCES adm.empresas(id) ON DELETE SET NULL,  -- preenchido no Ganho
  token_agenda           text NOT NULL UNIQUE,
  token_expira_em        timestamptz NOT NULL DEFAULT now() + interval '30 days',
  boas_vindas            text NOT NULL DEFAULT 'pendente' CHECK (boas_vindas IN ('pendente', 'enviada', 'falhou', 'nao_enviar')),
  boas_vindas_em         timestamptz,
  ultima_interacao       timestamptz NOT NULL DEFAULT now(),
  fechado_em             timestamptz,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX negocios_contato_idx ON comercial.negocios (contato_id);
CREATE INDEX negocios_etapa_idx ON comercial.negocios (etapa_id, ultima_interacao DESC);
CREATE INDEX negocios_boas_vindas_idx ON comercial.negocios (criado_em) WHERE boas_vindas = 'pendente';

-- Atividades (linha do tempo do negócio) ------------------------------------------------------
CREATE TABLE comercial.atividades (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  negocio_id  uuid NOT NULL REFERENCES comercial.negocios(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('nota', 'ligacao', 'whatsapp', 'email', 'lead_repetido', 'etapa', 'reuniao', 'sistema')),
  texto       text,
  detalhe     jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor       text NOT NULL DEFAULT 'sistema',
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atividades_negocio_idx ON comercial.atividades (negocio_id, criado_em DESC);

-- Reuniões (Fase 7: Google Agenda) ------------------------------------------------------------
CREATE TABLE comercial.reunioes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id          uuid NOT NULL REFERENCES comercial.negocios(id) ON DELETE CASCADE,
  vendedor_id         uuid REFERENCES comercial.vendedores(id) ON DELETE SET NULL,
  inicio              timestamptz NOT NULL,
  fim                 timestamptz NOT NULL CHECK (fim > inicio),
  situacao            text NOT NULL DEFAULT 'marcada' CHECK (situacao IN ('marcada', 'realizada', 'cancelada', 'nao_compareceu')),
  origem              text NOT NULL DEFAULT 'lead' CHECK (origem IN ('lead', 'equipe')),
  google_event_id     text,
  google_calendar_id  text,
  meet_url            text,
  lembrete_24h_em     timestamptz,
  lembrete_1h_em      timestamptz,
  criado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reunioes_inicio_idx ON comercial.reunioes (inicio) WHERE situacao = 'marcada';

-- Meta Lead Ads (Fase 6) -------------------------------------------------------------------
CREATE TABLE comercial.meta_conexoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         text NOT NULL UNIQUE,
  page_nome       text,
  ig_usuario      text,
  conectado_por   uuid,
  token_vault_id  uuid,          -- o token da página fica no Vault
  token_valido    boolean NOT NULL DEFAULT true,
  verificado_em   timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE comercial.meta_formularios (
  form_id     text PRIMARY KEY,
  conexao_id  uuid NOT NULL REFERENCES comercial.meta_conexoes(id) ON DELETE CASCADE,
  nome        text,
  plataforma  text,
  sistema     text,
  ativo       boolean NOT NULL DEFAULT true
);

-- Entrada bruta (idempotência e auditoria) ----------------------------------------------------
CREATE TABLE comercial.leads_recebidos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte_id     uuid REFERENCES comercial.fontes(id) ON DELETE SET NULL,
  origem       text NOT NULL,
  id_externo   text,
  ip_hash      text,
  payload      jsonb NOT NULL,
  recebido_em  timestamptz NOT NULL DEFAULT now(),
  negocio_id   uuid REFERENCES comercial.negocios(id) ON DELETE SET NULL,
  erro         text
);
CREATE UNIQUE INDEX leads_recebidos_externo_uq ON comercial.leads_recebidos (origem, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX leads_recebidos_ip_idx ON comercial.leads_recebidos (ip_hash, recebido_em) WHERE ip_hash IS NOT NULL;
CREATE INDEX leads_recebidos_data_idx ON comercial.leads_recebidos (recebido_em DESC);

-- Google Agenda (Fase 7) -------------------------------------------------------------------
CREATE TABLE comercial.agendas_google (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id             uuid REFERENCES comercial.vendedores(id) ON DELETE CASCADE,
  email                   text NOT NULL,
  calendar_id             text NOT NULL DEFAULT 'primary',
  refresh_token_vault_id  uuid,
  ativo                   boolean NOT NULL DEFAULT true,
  ultima_sincronizacao    timestamptz,
  criado_em               timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE comercial.config_agenda (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  duracao_min       integer NOT NULL DEFAULT 30 CHECK (duracao_min BETWEEN 10 AND 240),
  intervalo_min     integer NOT NULL DEFAULT 15 CHECK (intervalo_min BETWEEN 0 AND 120),
  horario           jsonb NOT NULL DEFAULT '{"dias":[1,2,3,4,5],"inicio":"09:00","fim":"18:00"}'::jsonb,
  antecedencia_min  integer NOT NULL DEFAULT 120 CHECK (antecedencia_min >= 0),
  criar_meet        boolean NOT NULL DEFAULT true,
  lembretes         jsonb NOT NULL DEFAULT '{"h24":true,"h1":true}'::jsonb,
  distribuicao      text NOT NULL DEFAULT 'rodizio' CHECK (distribuicao IN ('rodizio', 'primeiro_livre')),
  mover_card        boolean NOT NULL DEFAULT true,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO comercial.config_agenda (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Segurança: nada exposto; só service_role (Edge Functions) e as funções SECURITY DEFINER ------
ALTER TABLE comercial.vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.negocios ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.meta_conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.meta_formularios ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.leads_recebidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.agendas_google ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.config_agenda ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA comercial TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA comercial TO service_role;
