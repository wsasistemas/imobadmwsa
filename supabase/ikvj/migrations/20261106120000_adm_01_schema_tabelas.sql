-- =====================================================================================
-- ImobAdm WSA · Fase 1 · Cobrança por empresa (schema adm) — tabelas
-- Supabase central ikvjaowvpvxojvcfwnct. Migration ADITIVA: só cria objetos novos.
-- Depende de acessos.aplicativos (migration 20261003220000_acessos_central do imobdocerias).
--
-- Regra de negócio: a empresa paga uma mensalidade (assinatura Asaas). Fatura vencida há mais
-- de adm.regua.dias_tolerancia dias (padrão 10) suspende TODOS os sistemas da empresa; ao pagar,
-- volta na hora. Empresa sem vínculo cadastrado continua liberada.
-- O schema adm NÃO é exposto na Data API: o acesso é por funções em public (próxima migration).
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS adm;
REVOKE ALL ON SCHEMA adm FROM PUBLIC;
GRANT USAGE ON SCHEMA adm TO service_role;

-- Régua (uma linha só) ----------------------------------------------------------------
CREATE TABLE adm.regua (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  dias_tolerancia     integer NOT NULL DEFAULT 10 CHECK (dias_tolerancia BETWEEN 0 AND 60),
  reativar_automatico boolean NOT NULL DEFAULT true,
  -- passos de aviso: d = dias em relação ao vencimento (negativo = antes); canais: whatsapp, email
  passos              jsonb NOT NULL DEFAULT '[
    {"passo":"d-3","d":-3,"canais":["whatsapp","email"],"ativo":true},
    {"passo":"d+1","d":1,"canais":["whatsapp"],"ativo":true},
    {"passo":"d+5","d":5,"canais":["whatsapp"],"ativo":true},
    {"passo":"d+8","d":8,"canais":["whatsapp","email"],"ativo":true},
    {"passo":"d+11","d":11,"canais":["whatsapp"],"ativo":false}
  ]'::jsonb,
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_por      uuid
);
INSERT INTO adm.regua (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Sistemas cobrados (complementa acessos.aplicativos) -----------------------------------
CREATE TABLE adm.sistemas (
  app             text PRIMARY KEY REFERENCES acessos.aplicativos(schema_name) ON UPDATE CASCADE,
  tipo_ref        text NOT NULL CHECK (tipo_ref IN ('schema', 'tenant')),
  descricao_ref   text,            -- ex.: 'um schema por loja (loja_<slug>)', 'coluna imobiliaria_id'
  -- função <schema>.<nome>(text) → boolean que diz se o usuário logado pertence à empresa (ref).
  -- Usada para não mostrar detalhes da cobrança a quem não é da empresa.
  funcao_membro   text CHECK (funcao_membro IS NULL OR funcao_membro ~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$'),
  cobra           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

-- Empresas (o cliente que paga) ------------------------------------------------------------
CREATE TABLE adm.empresas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj                   text UNIQUE CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),  -- só dígitos (CPF ou CNPJ)
  razao_social           text NOT NULL CHECK (length(btrim(razao_social)) > 0),
  nome_fantasia          text,
  dono_nome              text,
  whatsapp               text,     -- E.164 só dígitos, ex.: 5511987654321
  email_financeiro       text,
  modalidade             text NOT NULL DEFAULT 'pagante' CHECK (modalidade IN ('pagante', 'cortesia', 'cancelada')),
  -- situação calculada (cache para listas; a verdade é adm.situacao_calculada)
  situacao               text NOT NULL DEFAULT 'em_dia' CHECK (situacao IN ('em_dia', 'atraso', 'suspensa', 'cortesia', 'cancelada')),
  suspensa_manual        boolean NOT NULL DEFAULT false,
  prazo_extra_ate        date,
  dia_vencimento         integer CHECK (dia_vencimento BETWEEN 1 AND 28),
  asaas_customer_id      text UNIQUE,
  asaas_subscription_id  text UNIQUE,
  negocio_id             uuid,     -- negócio do funil que originou a empresa (schema comercial, Fase 5)
  observacoes            text,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX empresas_situacao_idx ON adm.empresas (situacao);

-- Vínculos: empresa × sistema × onde estão os dados ----------------------------------------
CREATE TABLE adm.vinculos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES adm.empresas(id) ON DELETE CASCADE,
  app            text NOT NULL REFERENCES adm.sistemas(app) ON UPDATE CASCADE,
  schema_ref     text CHECK (schema_ref IS NULL OR schema_ref ~ '^[a-z_][a-z0-9_]{0,62}$'),
  tenant_ref     text,
  ref            text GENERATED ALWAYS AS (coalesce(schema_ref, tenant_ref)) STORED,
  plano          text,
  valor_mensal   numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  ativo          boolean NOT NULL DEFAULT true,
  acesso_manual  text CHECK (acesso_manual IN ('liberado', 'bloqueado')),   -- null = segue a cobrança
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(schema_ref, tenant_ref) = 1)
);
CREATE UNIQUE INDEX vinculos_app_ref_uidx ON adm.vinculos (app, ref);
CREATE INDEX vinculos_empresa_idx ON adm.vinculos (empresa_id);

-- Faturas (uma por mensalidade; espelham os payments do Asaas) --------------------------
CREATE TABLE adm.faturas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES adm.empresas(id) ON DELETE CASCADE,
  competencia       date NOT NULL CHECK (extract(day FROM competencia) = 1),
  vencimento        date NOT NULL,
  valor             numeric(12,2) NOT NULL CHECK (valor >= 0),
  situacao          text NOT NULL DEFAULT 'a_vencer' CHECK (situacao IN ('a_vencer', 'vencida', 'paga', 'cancelada', 'estornada')),
  pago_em           timestamptz,
  forma             text,          -- pix, boleto, cartao, manual
  asaas_payment_id  text UNIQUE,
  invoice_url       text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faturas_empresa_idx ON adm.faturas (empresa_id, vencimento);
CREATE INDEX faturas_abertas_idx ON adm.faturas (vencimento) WHERE situacao IN ('a_vencer', 'vencida');

-- Histórico ---------------------------------------------------------------------------------
CREATE TABLE adm.eventos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id  uuid REFERENCES adm.empresas(id) ON DELETE CASCADE,
  fatura_id   uuid REFERENCES adm.faturas(id) ON DELETE SET NULL,
  tipo        text NOT NULL,   -- situacao, aviso, prazo, pagamento_manual, vinculo, asaas, ...
  detalhe     jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor       text NOT NULL DEFAULT 'sistema',   -- uuid do usuário, 'sistema' ou 'asaas'
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_empresa_idx ON adm.eventos (empresa_id, criado_em DESC);

-- Idempotência dos avisos e dos webhooks ------------------------------------------------
CREATE TABLE adm.avisos_enviados (
  fatura_id   uuid NOT NULL REFERENCES adm.faturas(id) ON DELETE CASCADE,
  passo       text NOT NULL,
  canal       text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  enviado_em  timestamptz NOT NULL DEFAULT now(),
  resultado   jsonb,
  PRIMARY KEY (fatura_id, passo, canal)
);

CREATE TABLE adm.asaas_eventos (
  id           text PRIMARY KEY,   -- id do evento enviado pelo Asaas
  evento       text NOT NULL,
  payload      jsonb NOT NULL,
  recebido_em  timestamptz NOT NULL DEFAULT now(),
  processado   boolean NOT NULL DEFAULT false,
  erro         text
);

-- Segurança: RLS ligada e nenhum acesso direto fora da service_role -----------------------
ALTER TABLE adm.regua ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.sistemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.avisos_enviados ENABLE ROW LEVEL SECURITY;
ALTER TABLE adm.asaas_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA adm FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA adm TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA adm TO service_role;

-- Carga: os aplicativos que já estão na Central de Acessos ------------------------------
INSERT INTO adm.sistemas (app, tipo_ref, descricao_ref, funcao_membro)
SELECT a.schema_name,
       CASE a.schema_name WHEN 'imobdoces' THEN 'schema' ELSE 'tenant' END,
       CASE a.schema_name
         WHEN 'imobdoces' THEN 'um schema por loja (loja_<slug>)'
         WHEN 'imobsystem' THEN 'coluna imobiliaria_id no public'
       END,
       CASE a.schema_name WHEN 'imobdoces' THEN 'imobdoces.membro_da_loja' END
  FROM acessos.aplicativos a
 WHERE NOT a.oculto
ON CONFLICT (app) DO NOTHING;
