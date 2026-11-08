-- Fase 8 (parte 1): classificação automática do lead pelas respostas do formulário + RPCs das telas
-- Leads & Contatos e Funil de Vendas. Migration aditiva: só acrescenta colunas, tabela e funções.
--
-- Como funciona:
--   comercial.receber_lead grava o lead em leads_recebidos e, no fim, preenche negocio_id.
--   O gatilho comercial_classificar (AFTER UPDATE OF negocio_id) chama comercial.aplicar_classificacao:
--     pontos (0–100) pelas regras de comercial.config_qualificacao → temperatura quente / morno / frio,
--     sistema de interesse pelas palavras-chave, próxima ação e prazo.
--   Lead quente que está em "Novo lead" vai sozinho para "Qualificação".
--   Erro na classificação nunca derruba a entrada do lead (vira aviso no log).

-- ---------------------------------------------------------------- Colunas novas no negócio
ALTER TABLE comercial.negocios
  ADD COLUMN IF NOT EXISTS pontuacao integer,
  ADD COLUMN IF NOT EXISTS temperatura text,
  ADD COLUMN IF NOT EXISTS classificacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS classificado_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negocios_temperatura_check') THEN
    ALTER TABLE comercial.negocios ADD CONSTRAINT negocios_temperatura_check CHECK (temperatura IN ('quente', 'morno', 'frio'));
  END IF;
END $$;

-- Novo tipo de atividade 'classificacao' (só amplia a lista aceita; nenhum dado muda).
ALTER TABLE comercial.atividades DROP CONSTRAINT IF EXISTS atividades_tipo_check;
ALTER TABLE comercial.atividades ADD CONSTRAINT atividades_tipo_check
  CHECK (tipo IN ('nota', 'ligacao', 'whatsapp', 'email', 'lead_repetido', 'etapa', 'reuniao', 'sistema', 'classificacao'));

CREATE INDEX IF NOT EXISTS negocios_temperatura_idx ON comercial.negocios (temperatura, criado_em DESC);

-- ---------------------------------------------------------------- Regras (uma linha, editável pela tela)
CREATE TABLE IF NOT EXISTS comercial.config_qualificacao (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  regras jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE comercial.config_qualificacao ENABLE ROW LEVEL SECURITY;

INSERT INTO comercial.config_qualificacao (id, regras) VALUES (true, $json$
{
  "limites": { "quente": 60, "morno": 35 },
  "mover_quente": true,
  "pontos": {
    "whatsapp": 20,
    "email_corporativo": 10,
    "empresa": 15,
    "cargo_decisor": 20,
    "sistema": 15,
    "urgencia": 20,
    "intencao": 10,
    "pesquisando": -25
  },
  "cargos_decisores": ["dono", "dona", "proprietari", "socio", "socia", "diretor", "diretora", "ceo", "presidente", "fundador",
                       "gerente", "gestor", "gestora", "coordenador", "coordenadora", "administrador", "responsavel", "empresario", "empresaria"],
  "palavras_urgencia": ["imediat", "urgente", "este mes", "esse mes", "proximos 30", "30 dias", "o quanto antes", "essa semana", "esta semana", "hoje"],
  "palavras_intencao": ["demonstra", "orcamento", "preco", "valores", "contratar", "comprar", "assinar", "proposta", "teste gratis", "implantar", "reuniao"],
  "palavras_pesquisando": ["so pesquisando", "apenas pesquisando", "so conhecendo", "curiosidade", "sem previsao", "ano que vem", "mais para frente", "nao tenho interesse"],
  "emails_pessoais": ["gmail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.com.br", "icloud.com", "bol.com.br",
                      "uol.com.br", "terra.com.br", "msn.com", "ig.com.br", "globo.com"],
  "sistemas": {
    "imobsystem":      ["imobiliari", "corretor", "corretora", "imoveis", "imovel", "construtora", "loteadora", "incorporadora", "crm", "imobsystem"],
    "imobdoces":       ["doce", "doceria", "confeitaria", "confeiteir", "bolo", "brigadeiro", "imobdoce"],
    "imobpesagens":    ["pesagem", "pesagens", "balanca", "imobpesage"],
    "imobeducacional": ["escola", "educacion", "colegio", "faculdade", "curso", "imobeducacional"],
    "imobenviomassa":  ["envio em massa", "disparo", "mensagens em massa", "campanha de whatsapp", "imobenvio"],
    "imobdesk":        ["helpdesk", "help desk", "chamados", "service desk", "imobdesk"],
    "suprimentos":     ["suprimento", "compras", "cotacao", "fornecedor", "totvs"]
  }
}
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- Funções auxiliares
CREATE OR REPLACE FUNCTION comercial.sem_acento(p text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $$
  SELECT pg_catalog.translate(pg_catalog.lower(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$;

-- Alguma das palavras aparece no texto (no começo de uma palavra; "dono" não casa com "abandono")?
CREATE OR REPLACE FUNCTION comercial.tem_palavra(p_texto text, p_palavras jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $$
  SELECT w FROM pg_catalog.jsonb_array_elements_text(coalesce(p_palavras, '[]'::jsonb)) w
   WHERE w <> '' AND p_texto ~ ('(^|[^a-z0-9])' || pg_catalog.regexp_replace(comercial.sem_acento(w), '([.*+?^${}()|\[\]\\])', '\\\1', 'g'))
   LIMIT 1
$$;

-- Classifica um lead pelos dados recebidos. Não grava nada.
CREATE OR REPLACE FUNCTION comercial.classificar(p_dados jsonb, p_origem text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  r jsonb;
  pt jsonb;
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_txt text;
  v_cargo text;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(v_dados ->> 'email', '')));
  v_whats text := comercial.normalizar_telefone(coalesce(v_dados ->> 'whatsapp', v_dados ->> 'telefone', v_dados ->> 'phone_number'));
  v_empresa text := nullif(pg_catalog.btrim(coalesce(v_dados ->> 'empresa', v_dados ->> 'empresa_nome', v_dados ->> 'company_name', '')), '');
  v_pts integer := 0;
  v_motivos jsonb := '[]'::jsonb;
  v_sist text[] := '{}';
  v_achou text;
  v_app text;
  v_palavras jsonb;
  v_temp text;
  v_acao text;
  v_prazo integer;
BEGIN
  SELECT c.regras INTO r FROM comercial.config_qualificacao c WHERE c.id;
  r := coalesce(r, '{}'::jsonb);
  pt := coalesce(r -> 'pontos', '{}'::jsonb);

  -- Texto analisado: os valores respondidos (sem nome, e-mail, telefone e campos técnicos).
  SELECT comercial.sem_acento(coalesce(pg_catalog.string_agg(e.value, ' '), '')) INTO v_txt
    FROM pg_catalog.jsonb_each_text(v_dados - ARRAY['email', 'nome', 'full_name', 'first_name', 'last_name', 'telefone', 'whatsapp',
                                                    'phone_number', 'id', 'created_at', 'criado_em', 'consentimento', 'consentimento_em',
                                                    'notificado_em', 'status']) e;
  v_cargo := comercial.sem_acento(coalesce(v_dados ->> 'cargo', v_dados ->> 'job_title', ''));

  IF v_whats IS NOT NULL THEN
    v_pts := v_pts + coalesce((pt ->> 'whatsapp')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'WhatsApp válido', 'pontos', coalesce((pt ->> 'whatsapp')::int, 0));
  END IF;

  IF v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     AND NOT (pg_catalog.split_part(v_email, '@', 2) IN (SELECT pg_catalog.jsonb_array_elements_text(coalesce(r -> 'emails_pessoais', '[]'::jsonb)))) THEN
    v_pts := v_pts + coalesce((pt ->> 'email_corporativo')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'E-mail da empresa (' || pg_catalog.split_part(v_email, '@', 2) || ')',
                                                            'pontos', coalesce((pt ->> 'email_corporativo')::int, 0));
  END IF;

  IF v_empresa IS NOT NULL AND pg_catalog.length(v_empresa) >= 2 THEN
    v_pts := v_pts + coalesce((pt ->> 'empresa')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Informou a empresa', 'pontos', coalesce((pt ->> 'empresa')::int, 0));
  END IF;

  v_achou := coalesce(comercial.tem_palavra(v_cargo, r -> 'cargos_decisores'), comercial.tem_palavra(v_txt, r -> 'cargos_decisores'));
  IF v_achou IS NOT NULL THEN
    v_pts := v_pts + coalesce((pt ->> 'cargo_decisor')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Quem decide (' || v_achou || ')', 'pontos', coalesce((pt ->> 'cargo_decisor')::int, 0));
  END IF;

  -- Sistema de interesse: código exato do app ou palavra-chave.
  FOR v_app, v_palavras IN SELECT k, v FROM pg_catalog.jsonb_each(coalesce(r -> 'sistemas', '{}'::jsonb)) AS x(k, v) LOOP
    IF comercial.tem_palavra(v_txt, pg_catalog.jsonb_build_array(v_app)) IS NOT NULL
       OR comercial.tem_palavra(v_txt, v_palavras) IS NOT NULL THEN
      v_sist := v_sist || v_app;
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(v_sist) > 0 THEN
    v_pts := v_pts + coalesce((pt ->> 'sistema')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Sistema de interesse: ' || pg_catalog.array_to_string(v_sist, ', '),
                                                            'pontos', coalesce((pt ->> 'sistema')::int, 0));
  END IF;

  v_achou := comercial.tem_palavra(v_txt, r -> 'palavras_urgencia');
  IF v_achou IS NOT NULL THEN
    v_pts := v_pts + coalesce((pt ->> 'urgencia')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Tem pressa ("' || v_achou || '")', 'pontos', coalesce((pt ->> 'urgencia')::int, 0));
  END IF;

  v_achou := comercial.tem_palavra(v_txt, r -> 'palavras_intencao');
  IF v_achou IS NOT NULL THEN
    v_pts := v_pts + coalesce((pt ->> 'intencao')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Quer comprar ("' || v_achou || '")', 'pontos', coalesce((pt ->> 'intencao')::int, 0));
  END IF;

  v_achou := comercial.tem_palavra(v_txt, r -> 'palavras_pesquisando');
  IF v_achou IS NOT NULL THEN
    v_pts := v_pts + coalesce((pt ->> 'pesquisando')::int, 0);
    v_motivos := v_motivos || pg_catalog.jsonb_build_object('motivo', 'Só pesquisando ("' || v_achou || '")', 'pontos', coalesce((pt ->> 'pesquisando')::int, 0));
  END IF;

  v_pts := greatest(0, least(100, v_pts));
  v_temp := CASE WHEN v_pts >= coalesce((r #>> '{limites,quente}')::int, 60) THEN 'quente'
                 WHEN v_pts >= coalesce((r #>> '{limites,morno}')::int, 35) THEN 'morno'
                 ELSE 'frio' END;
  v_acao := CASE v_temp WHEN 'quente' THEN 'Ligar ou chamar no WhatsApp em até 1 hora'
                        WHEN 'morno'  THEN 'Fazer o primeiro contato em até 24 horas'
                        ELSE 'Nutrir: mandar material e tentar de novo em 3 dias' END;
  v_prazo := CASE v_temp WHEN 'quente' THEN 60 WHEN 'morno' THEN 1440 ELSE 4320 END;

  RETURN pg_catalog.jsonb_build_object(
    'pontos', v_pts, 'temperatura', v_temp, 'motivos', v_motivos, 'sistemas', pg_catalog.to_jsonb(v_sist),
    'proxima_acao', v_acao, 'prazo_min', v_prazo, 'origem', p_origem);
END;
$$;

-- Aplica a classificação no negócio. Lead repetido não rebaixa: fica a maior pontuação.
CREATE OR REPLACE FUNCTION comercial.aplicar_classificacao(p_negocio uuid, p_dados jsonb, p_origem text, p_mover boolean DEFAULT true)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  c jsonb := comercial.classificar(p_dados, p_origem);
  v_n comercial.negocios;
  v_etapa text;
  v_pts integer;
  v_temp text;
  v_sist text[];
  v_antes text;
  v_mover boolean;
BEGIN
  SELECT * INTO v_n FROM comercial.negocios n WHERE n.id = p_negocio FOR UPDATE;
  IF v_n.id IS NULL THEN RETURN NULL; END IF;
  -- Temperatura definida à mão pela equipe não é sobrescrita.
  IF coalesce((v_n.classificacao ->> 'manual')::boolean, false) THEN RETURN v_n.classificacao; END IF;

  SELECT e.chave INTO v_etapa FROM comercial.etapas e WHERE e.id = v_n.etapa_id;
  v_antes := v_n.temperatura;
  v_pts := greatest(coalesce(v_n.pontuacao, 0), (c ->> 'pontos')::int);
  IF v_n.pontuacao IS NOT NULL AND v_n.pontuacao > (c ->> 'pontos')::int THEN
    c := v_n.classificacao;  -- mantém os motivos da classificação mais forte
  END IF;
  v_temp := c ->> 'temperatura';

  -- Sistemas: troca o texto cru (ex.: "imobdoceria") pelos códigos dos apps quando a classificação achou algum.
  SELECT coalesce(pg_catalog.array_agg(DISTINCT s), '{}') INTO v_sist FROM (
    SELECT pg_catalog.jsonb_array_elements_text(coalesce(c -> 'sistemas', '[]'::jsonb)) s
    UNION SELECT s FROM pg_catalog.unnest(v_n.sistemas) s
     WHERE pg_catalog.jsonb_array_length(coalesce(c -> 'sistemas', '[]'::jsonb)) = 0
        OR EXISTS (SELECT 1 FROM comercial.config_qualificacao q WHERE q.regras -> 'sistemas' ? s)) x;

  UPDATE comercial.negocios n SET pontuacao = v_pts, temperatura = v_temp, classificacao = c,
         classificado_em = pg_catalog.now(), sistemas = v_sist, atualizado_em = pg_catalog.now()
   WHERE n.id = p_negocio;

  IF v_antes IS DISTINCT FROM v_temp THEN
    INSERT INTO comercial.atividades (negocio_id, tipo, texto, detalhe)
    VALUES (p_negocio, 'classificacao',
            'Classificado como ' || CASE v_temp WHEN 'quente' THEN 'quente' WHEN 'morno' THEN 'morno' ELSE 'frio' END
              || ' (' || v_pts || ' pontos). Próximo passo: ' || (c ->> 'proxima_acao'),
            pg_catalog.jsonb_build_object('pontos', v_pts, 'temperatura', v_temp, 'motivos', c -> 'motivos'));
  END IF;

  SELECT coalesce((q.regras ->> 'mover_quente')::boolean, true) INTO v_mover FROM comercial.config_qualificacao q WHERE q.id;
  IF p_mover AND coalesce(v_mover, true) AND v_temp = 'quente' AND v_etapa = 'novo_lead' THEN
    PERFORM comercial.mover_etapa(p_negocio, 'qualificacao', NULL);
    UPDATE comercial.atividades a SET texto = a.texto || ' (lead quente, movido sozinho)', autor = 'classificação automática'
     WHERE a.id = (SELECT max(b.id) FROM comercial.atividades b WHERE b.negocio_id = p_negocio AND b.tipo = 'etapa');
  END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION comercial.trg_classificar() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  BEGIN
    PERFORM comercial.aplicar_classificacao(NEW.negocio_id, NEW.payload, NEW.origem, NEW.origem <> 'importado');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[comercial] classificação do lead % falhou: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comercial_classificar ON comercial.leads_recebidos;
CREATE TRIGGER comercial_classificar AFTER UPDATE OF negocio_id ON comercial.leads_recebidos
  FOR EACH ROW WHEN (NEW.negocio_id IS NOT NULL AND OLD.negocio_id IS DISTINCT FROM NEW.negocio_id)
  EXECUTE FUNCTION comercial.trg_classificar();

-- ---------------------------------------------------------------- RPCs das telas (super admin)
CREATE OR REPLACE FUNCTION comercial.card(n comercial.negocios) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'negocio_id', n.id, 'contato_id', c.id, 'nome', coalesce(c.nome, c.email, c.whatsapp, 'Sem nome'),
    'empresa', c.empresa_nome, 'cargo', c.cargo, 'whatsapp', c.whatsapp, 'email', c.email,
    'origem', c.origem, 'formulario', c.formulario, 'campanha', c.campanha,
    'sistemas', pg_catalog.to_jsonb(n.sistemas), 'valor', n.valor_mensal_previsto,
    'etapa', e.chave, 'etapa_nome', e.nome, 'etapa_cor', e.cor,
    'temperatura', n.temperatura, 'pontuacao', n.pontuacao,
    'proxima_acao', n.classificacao ->> 'proxima_acao',
    'prazo_em', CASE WHEN n.classificacao ? 'prazo_min' AND NOT e.final
                     THEN n.criado_em + pg_catalog.make_interval(mins => (n.classificacao ->> 'prazo_min')::int) END,
    'boas_vindas', n.boas_vindas, 'motivo_perda', n.motivo_perda, 'empresa_id', n.empresa_id,
    'sem_resposta_24h', (e.chave = 'novo_lead' AND n.criado_em < pg_catalog.now() - interval '24 hours'),
    'reuniao', (SELECT pg_catalog.to_jsonb(r) - 'negocio_id' FROM comercial.reunioes r
                 WHERE r.negocio_id = n.id ORDER BY r.inicio DESC LIMIT 1),
    'criado_em', n.criado_em, 'ultima_interacao', n.ultima_interacao)
  FROM comercial.contatos c, comercial.etapas e
  WHERE c.id = n.contato_id AND e.id = n.etapa_id
$$;

CREATE OR REPLACE FUNCTION public.com_leads(p_origem text DEFAULT NULL, p_temperatura text DEFAULT NULL, p_busca text DEFAULT NULL,
                                            p_limite integer DEFAULT 300) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_b text := nullif(comercial.sem_acento(pg_catalog.btrim(coalesce(p_busca, ''))), '');
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(comercial.card(x.neg) ORDER BY x.criado_em DESC) FROM (
    SELECT n AS neg, n.criado_em FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id
     WHERE (p_origem IS NULL OR c.origem = p_origem)
       AND (p_temperatura IS NULL OR n.temperatura = p_temperatura)
       AND (v_b IS NULL OR comercial.sem_acento(pg_catalog.concat_ws(' ', c.nome, c.empresa_nome, c.email, c.whatsapp)) LIKE '%' || v_b || '%')
     ORDER BY n.criado_em DESC
     LIMIT least(coalesce(p_limite, 300), 1000)) x), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.com_leads_resumo() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'novos_30d', count(*) FILTER (WHERE n.criado_em >= pg_catalog.now() - interval '30 days'),
      'novos_30d_antes', count(*) FILTER (WHERE n.criado_em >= pg_catalog.now() - interval '60 days'
                                            AND n.criado_em < pg_catalog.now() - interval '30 days'),
      'site_30d', count(*) FILTER (WHERE c.origem = 'site' AND n.criado_em >= pg_catalog.now() - interval '30 days'),
      'instagram_30d', count(*) FILTER (WHERE c.origem = 'instagram' AND n.criado_em >= pg_catalog.now() - interval '30 days'),
      'facebook_30d', count(*) FILTER (WHERE c.origem = 'facebook' AND n.criado_em >= pg_catalog.now() - interval '30 days'),
      'quentes_abertos', count(*) FILTER (WHERE n.temperatura = 'quente' AND NOT e.final),
      'mornos_abertos', count(*) FILTER (WHERE n.temperatura = 'morno' AND NOT e.final),
      'frios_abertos', count(*) FILTER (WHERE n.temperatura = 'frio' AND NOT e.final),
      'sem_resposta_24h', count(*) FILTER (WHERE e.chave = 'novo_lead' AND n.criado_em < pg_catalog.now() - interval '24 hours'),
      'reunioes_30d', (SELECT count(DISTINCT r.negocio_id) FROM comercial.reunioes r WHERE r.criado_em >= pg_catalog.now() - interval '30 days'),
      'por_origem', (SELECT coalesce(pg_catalog.jsonb_object_agg(o, t), '{}'::jsonb) FROM (
                       SELECT c2.origem o, count(*) t FROM comercial.negocios n2 JOIN comercial.contatos c2 ON c2.id = n2.contato_id GROUP BY 1) x),
      'total', count(*))
    FROM comercial.negocios n JOIN comercial.contatos c ON c.id = n.contato_id JOIN comercial.etapas e ON e.id = n.etapa_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.com_funil(p_sistema text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'chave', e.chave, 'nome', e.nome, 'cor', e.cor, 'final', e.final, 'ganho', e.ganho,
      'total', (SELECT count(*) FROM pg_catalog.jsonb_array_elements(cards)),
      'valor', (SELECT coalesce(sum((x ->> 'valor')::numeric), 0) FROM pg_catalog.jsonb_array_elements(cards) x),
      'negocios', cards) ORDER BY e.ordem)
    FROM comercial.etapas e
    CROSS JOIN LATERAL (
      SELECT coalesce(pg_catalog.jsonb_agg(comercial.card(n)
               ORDER BY CASE n.temperatura WHEN 'quente' THEN 0 WHEN 'morno' THEN 1 ELSE 2 END, n.criado_em DESC), '[]'::jsonb) cards
        FROM comercial.negocios n
       WHERE n.etapa_id = e.id
         AND (p_sistema IS NULL OR p_sistema = ANY (n.sistemas))
         AND (NOT e.final OR n.fechado_em >= pg_catalog.now() - interval '30 days')) k), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.com_negocio(p_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_n comercial.negocios;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_n FROM comercial.negocios n WHERE n.id = p_id;
  IF v_n.id IS NULL THEN RETURN NULL; END IF;
  RETURN comercial.card(v_n) || pg_catalog.jsonb_build_object(
    'classificacao', v_n.classificacao,
    'atividades', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'negocio_id' ORDER BY a.criado_em DESC, a.id DESC)
                              FROM comercial.atividades a WHERE a.negocio_id = p_id), '[]'::jsonb),
    'recebidos', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                 'id', r.id, 'origem', r.origem, 'recebido_em', r.recebido_em, 'fonte', f.nome,
                                 'respostas', r.payload - ARRAY['id', 'created_at', 'status', 'notificado_em', 'consentimento_em', 'respostas']
                                              || coalesce(r.payload -> 'respostas', '{}'::jsonb))
                               ORDER BY r.recebido_em DESC)
                             FROM comercial.leads_recebidos r LEFT JOIN comercial.fontes f ON f.id = r.fonte_id
                            WHERE r.negocio_id = p_id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.com_mover_etapa(p_negocio uuid, p_etapa text, p_motivo text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN comercial.mover_etapa(p_negocio, p_etapa, nullif(pg_catalog.btrim(coalesce(p_motivo, '')), ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.com_anotar(p_negocio uuid, p_texto text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF coalesce(pg_catalog.btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Escreva a anotação.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM comercial.negocios n WHERE n.id = p_negocio) THEN RAISE EXCEPTION 'Negócio não encontrado.'; END IF;
  INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor) VALUES (p_negocio, 'nota', pg_catalog.btrim(p_texto), adm.autor_atual());
  UPDATE comercial.negocios n SET ultima_interacao = pg_catalog.now() WHERE n.id = p_negocio;
END;
$$;

-- Valor previsto, sistemas e temperatura definida à mão (trava a classificação automática; null destrava).
CREATE OR REPLACE FUNCTION public.com_negocio_salvar(p_negocio uuid, p jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_n comercial.negocios;
  v_temp text;
BEGIN
  PERFORM adm.exigir_super_admin();
  SELECT * INTO v_n FROM comercial.negocios n WHERE n.id = p_negocio FOR UPDATE;
  IF v_n.id IS NULL THEN RAISE EXCEPTION 'Negócio não encontrado.'; END IF;

  IF p ? 'valor' THEN
    UPDATE comercial.negocios SET valor_mensal_previsto = nullif(p ->> 'valor', '')::numeric WHERE id = p_negocio;
  END IF;
  IF p ? 'sistemas' THEN
    UPDATE comercial.negocios SET sistemas = ARRAY(SELECT pg_catalog.jsonb_array_elements_text(coalesce(p -> 'sistemas', '[]'::jsonb)))
     WHERE id = p_negocio;
  END IF;
  IF p ? 'temperatura' THEN
    v_temp := nullif(p ->> 'temperatura', '');
    IF v_temp IS NOT NULL AND v_temp NOT IN ('quente', 'morno', 'frio') THEN RAISE EXCEPTION 'Temperatura inválida.'; END IF;
    IF v_temp IS NULL THEN
      UPDATE comercial.negocios SET classificacao = classificacao - 'manual', pontuacao = NULL WHERE id = p_negocio;
      PERFORM comercial.aplicar_classificacao(p_negocio,
        coalesce((SELECT r.payload FROM comercial.leads_recebidos r WHERE r.negocio_id = p_negocio ORDER BY r.recebido_em DESC LIMIT 1), '{}'::jsonb),
        NULL, false);
    ELSIF v_temp IS DISTINCT FROM v_n.temperatura OR NOT coalesce((v_n.classificacao ->> 'manual')::boolean, false) THEN
      UPDATE comercial.negocios SET temperatura = v_temp, classificado_em = pg_catalog.now(),
             classificacao = classificacao || pg_catalog.jsonb_build_object('manual', true, 'temperatura', v_temp)
       WHERE id = p_negocio;
      INSERT INTO comercial.atividades (negocio_id, tipo, texto, autor)
      VALUES (p_negocio, 'classificacao', 'Temperatura definida à mão: ' || v_temp, adm.autor_atual());
    END IF;
  END IF;
  UPDATE comercial.negocios SET atualizado_em = pg_catalog.now() WHERE id = p_negocio;
END;
$$;

-- Contato cadastrado pela equipe (origem manual). Classificado como os outros; não manda boas-vindas.
CREATE OR REPLACE FUNCTION public.com_novo_contato(p jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN comercial.receber_lead('manual', coalesce(p, '{}'::jsonb) || pg_catalog.jsonb_build_object('formulario', 'cadastro manual'),
                                NULL, 'manual:' || gen_random_uuid()::text, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.com_config_qualificacao() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN (SELECT c.regras FROM comercial.config_qualificacao c WHERE c.id);
END;
$$;

-- Salva as regras e reclassifica os negócios abertos (sem mover de etapa e sem mexer nos definidos à mão).
CREATE OR REPLACE FUNCTION public.com_config_qualificacao_salvar(p_regras jsonb) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_q integer; v_m integer; v_total integer := 0; r record;
BEGIN
  PERFORM adm.exigir_super_admin();
  v_q := (p_regras #>> '{limites,quente}')::int;
  v_m := (p_regras #>> '{limites,morno}')::int;
  IF v_q IS NULL OR v_m IS NULL OR v_m < 0 OR v_q > 100 OR v_m >= v_q THEN
    RAISE EXCEPTION 'Limites inválidos: o morno precisa ser menor que o quente (0 a 100).';
  END IF;
  IF pg_catalog.jsonb_typeof(p_regras -> 'pontos') <> 'object' THEN RAISE EXCEPTION 'Faltam os pontos.'; END IF;

  UPDATE comercial.config_qualificacao SET regras = p_regras, atualizado_em = pg_catalog.now() WHERE id;

  FOR r IN SELECT n.id FROM comercial.negocios n JOIN comercial.etapas e ON e.id = n.etapa_id
            WHERE NOT e.final AND NOT coalesce((n.classificacao ->> 'manual')::boolean, false) LOOP
    UPDATE comercial.negocios SET pontuacao = NULL WHERE id = r.id;
    PERFORM comercial.aplicar_classificacao(r.id,
      coalesce((SELECT l.payload FROM comercial.leads_recebidos l WHERE l.negocio_id = r.id ORDER BY l.recebido_em DESC LIMIT 1), '{}'::jsonb),
      NULL, false);
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Prévia: como um lead com estas respostas seria classificado (tela de regras).
CREATE OR REPLACE FUNCTION public.com_classificar_previa(p_dados jsonb) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN comercial.classificar(p_dados, 'manual');
END;
$$;

-- ---------------------------------------------------------------- Classifica o que já existe (sem mover de etapa)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.id,
                  (SELECT l.payload FROM comercial.leads_recebidos l WHERE l.negocio_id = n.id ORDER BY l.recebido_em DESC LIMIT 1) AS payload,
                  (SELECT l.origem FROM comercial.leads_recebidos l WHERE l.negocio_id = n.id ORDER BY l.recebido_em DESC LIMIT 1) AS origem
             FROM comercial.negocios n WHERE n.temperatura IS NULL LOOP
    PERFORM comercial.aplicar_classificacao(r.id, coalesce(r.payload, '{}'::jsonb), r.origem, false);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- Permissões
REVOKE ALL ON FUNCTION comercial.sem_acento(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.tem_palavra(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.classificar(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.aplicar_classificacao(uuid, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.trg_classificar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.card(comercial.negocios) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comercial.sem_acento(text), comercial.tem_palavra(text, jsonb), comercial.classificar(jsonb, text),
  comercial.aplicar_classificacao(uuid, jsonb, text, boolean), comercial.card(comercial.negocios) TO service_role;

REVOKE ALL ON FUNCTION public.com_leads(text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_leads_resumo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_funil(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_negocio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_mover_etapa(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_anotar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_negocio_salvar(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_novo_contato(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_config_qualificacao() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_config_qualificacao_salvar(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.com_classificar_previa(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_leads(text, text, text, integer), public.com_leads_resumo(), public.com_funil(text),
  public.com_negocio(uuid), public.com_mover_etapa(uuid, text, text), public.com_anotar(uuid, text),
  public.com_negocio_salvar(uuid, jsonb), public.com_novo_contato(jsonb), public.com_config_qualificacao(),
  public.com_config_qualificacao_salvar(jsonb), public.com_classificar_previa(jsonb) TO authenticated, service_role;
