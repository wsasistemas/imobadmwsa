-- =====================================================================================
-- ImobAdm — Atendimento ONLINE (Fase 1): robô de WhatsApp do ecossistema WSA (Sophia · WSA Sistemas IA). Aditiva.
-- Configuração, base de conhecimento (sistemas do site imobsystems.com.br), respostas prontas, consultores,
-- conversas e mensagens. Tudo nasce pré-preenchido; o envio pelo WhatsApp vem na Fase 3.
-- Painel: public.com_atend_* (super admin). Edge Functions: public.com_srv_atend_* (service_role).
-- =====================================================================================

-- Saída do lead ("PARAR"): nunca mais recebe WhatsApp do robô.
ALTER TABLE comercial.contatos ADD COLUMN IF NOT EXISTS nao_whatsapp boolean NOT NULL DEFAULT false;

-- Configuração (linha única) -------------------------------------------------------------------
CREATE TABLE comercial.atend_config (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  ligado               boolean NOT NULL DEFAULT false,
  agente_nome          text NOT NULL DEFAULT 'Sophia' CHECK (length(btrim(agente_nome)) BETWEEN 2 AND 40),
  empresa_nome         text NOT NULL DEFAULT 'WSA Sistemas IA' CHECK (length(btrim(empresa_nome)) BETWEEN 2 AND 60),
  tom                  text NOT NULL DEFAULT 'consultivo' CHECK (tom IN ('consultivo', 'formal', 'descontraido')),
  emojis               text NOT NULL DEFAULT 'poucos' CHECK (emojis IN ('nenhum', 'poucos')),
  objetivo             text NOT NULL CHECK (length(btrim(objetivo)) > 0),
  roteiro              jsonb NOT NULL CHECK (jsonb_typeof(roteiro) = 'array'),
  passar_consultor     jsonb NOT NULL CHECK (jsonb_typeof(passar_consultor) = 'object'),
  regras_extras        text NOT NULL DEFAULT '',
  tamanho_resposta     text NOT NULL DEFAULT 'curta' CHECK (tamanho_resposta IN ('curta', 'media')),
  retomar_horas        integer NOT NULL DEFAULT 4 CHECK (retomar_horas BETWEEN 0 AND 72),
  bv_temperaturas      text[] NOT NULL DEFAULT '{morno,quente}' CHECK (bv_temperaturas <@ '{quente,morno,frio}'::text[]),
  bv_etapas            text[] NOT NULL DEFAULT '{novo_lead,qualificacao}',
  bv_modelo            text NOT NULL DEFAULT 'boas_vindas_ecossistema' CHECK (bv_modelo ~ '^[a-z0-9_]{3,60}$'),
  bv_texto             text NOT NULL CHECK (length(btrim(bv_texto)) BETWEEN 10 AND 1000),
  bv_botoes            text[] NOT NULL CHECK (cardinality(bv_botoes) BETWEEN 1 AND 3),
  bv_janela            jsonb NOT NULL,
  bv_limite_dia        integer NOT NULL DEFAULT 80 CHECK (bv_limite_dia BETWEEN 1 AND 1000),
  bv_intervalo         integer[] NOT NULL DEFAULT '{40,90}' CHECK (cardinality(bv_intervalo) = 2 AND bv_intervalo[1] >= 10 AND bv_intervalo[2] >= bv_intervalo[1]),
  bv_quando            text NOT NULL DEFAULT 'na_hora' CHECK (bv_quando IN ('na_hora', 'diario_9h')),
  horario_consultores  jsonb NOT NULL,
  msg_fora_horario     text NOT NULL,
  consultor_espera_min integer NOT NULL DEFAULT 15 CHECK (consultor_espera_min BETWEEN 1 AND 240),
  palavras_sair        text[] NOT NULL DEFAULT '{PARAR,SAIR,"NÃO QUERO"}',
  simulado_em          timestamptz,
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_por       text
);

INSERT INTO comercial.atend_config (objetivo, roteiro, passar_consultor, bv_texto, bv_botoes, bv_janela, horario_consultores, msg_fora_horario)
VALUES (
  $t$Entender o negócio do lead, indicar o sistema certo do ecossistema WSA (www.imobsystems.com.br) e marcar uma demonstração de 30 minutos com um consultor.$t$,
  $j$[
    {"titulo": "Descobrir o segmento", "descricao": "Pergunte o ramo da empresa: imobiliária, incorporadora ou construtora, doceria, escola, logística, ou outro.", "obrigatorio": true},
    {"titulo": "Entender a dor principal", "descricao": "Descubra o que mais pesa hoje: atender e vender, compras da obra, cobrança, chamados e atendimento interno, pesagem ou financeiro.", "obrigatorio": true},
    {"titulo": "Indicar 1 sistema da Base", "descricao": "Indique só o sistema que resolve a dor, explique em 2 frases e ofereça a página com tudo o que ele faz.", "obrigatorio": true},
    {"titulo": "Oferecer demonstração", "descricao": "Ofereça 30 minutos com um consultor para ver o sistema funcionando e envie o link de agendamento.", "obrigatorio": true},
    {"titulo": "Tamanho da empresa", "descricao": "Pergunte quantas pessoas vão usar o sistema (ajuda o consultor a preparar a proposta).", "obrigatorio": false}
  ]$j$::jsonb,
  '{"pedido_humano": true, "preco": true, "temperatura_80": true, "nao_entendeu_2": true, "cliente_atual": false}'::jsonb,
  $t$Olá, {{nome}}! 👋 Seja bem-vindo(a) ao Ecossistema WSA Sistemas IA. Vi que você se interessou pelo {{sistemas}}. Posso te mostrar como funciona?$t$,
  '{"Sim, quero conhecer","Agendar demonstração","Falar com um consultor"}',
  '{"seg_sex": ["09:00", "18:00"], "sab": ["09:00", "12:00"], "dom": null}'::jsonb,
  '{"seg_sex": ["09:00", "18:00"], "sab": ["09:00", "12:00"], "dom": null}'::jsonb,
  $t$Nossos consultores voltam no próximo horário comercial (seg a sex, 9h às 18h; sáb, 9h às 12h). Enquanto isso, posso tirar suas dúvidas ou já deixar a sua demonstração marcada.$t$
);

-- Base de conhecimento: sistemas do ecossistema ---------------------------------------------------
CREATE TABLE comercial.atend_sistemas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app              text UNIQUE,                      -- adm.sistemas.app (interesse e funil usam este código)
  nome             text NOT NULL CHECK (length(btrim(nome)) > 0),
  segmento         text NOT NULL DEFAULT '',
  menu_nome        text NOT NULL DEFAULT '' CHECK (length(menu_nome) <= 24),
  pagina_url       text CHECK (pagina_url IS NULL OR pagina_url ~ '^https://'),
  sistema_url      text CHECK (sistema_url IS NULL OR sistema_url ~ '^https://'),
  material_url     text CHECK (material_url IS NULL OR material_url ~ '^https://'),
  ativo            boolean NOT NULL DEFAULT true,
  apresentacao     text NOT NULL DEFAULT '',
  texto_material   text NOT NULL DEFAULT '',
  para_quem        text NOT NULL DEFAULT '',
  nao_para_quem    text NOT NULL DEFAULT '',
  funcionalidades  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(funcionalidades) = 'array'),
  ordem            integer NOT NULL DEFAULT 0,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- Pré-preenchido com o site (wsa-landing-page/src/data/products.ts). "em_validacao" = construído, mas ainda não
-- pode ser anunciado como pronto: a Sophia fala "em validação" e não promete.
INSERT INTO comercial.atend_sistemas (app, nome, segmento, menu_nome, pagina_url, sistema_url, apresentacao, texto_material, para_quem, funcionalidades, ordem) VALUES
('imobimoveis', 'Imobimoveis (CRM Imobiliário)', 'Imobiliárias e incorporadoras', 'IMOBIMOVEIS - CRM',
 'https://www.imobsystems.com.br/produtos/crm-imobiliario', 'https://imobimoveis.imobsystems.com.br',
 $t$CRM para imobiliárias e incorporadoras: captação e distribuição de leads, funil comercial em kanban, atendimento por WhatsApp e histórico completo de relacionamento. Do lead à venda, com funil, WhatsApp e indicadores em um só lugar.$t$,
 $t$Aqui está a página do Imobimoveis com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Imobiliárias e incorporadoras que querem organizar leads, funil de vendas e atendimento por WhatsApp.',
 $j$[{"titulo":"Captação de leads","descricao":"Entrada de leads de diferentes origens em um único funil.","status":"disponivel"},
     {"titulo":"Funil comercial","descricao":"Etapas de qualificação, visita, proposta, negociação e fechamento.","status":"disponivel"},
     {"titulo":"Kanban","descricao":"Oportunidades em quadros, movidas por etapa.","status":"disponivel"},
     {"titulo":"Distribuição de oportunidades","descricao":"Encaminhamento dos leads para a equipe comercial.","status":"disponivel"},
     {"titulo":"Atendimento por WhatsApp","descricao":"Conversas com o cliente registradas junto à oportunidade.","status":"disponivel"},
     {"titulo":"Histórico de relacionamento","descricao":"Interações, visitas e propostas de cada cliente.","status":"disponivel"},
     {"titulo":"Indicadores comerciais","descricao":"Conversão, novos leads e desempenho por período.","status":"disponivel"}]$j$::jsonb, 1),
('suprimentos', 'ImobSuprimentos', 'Construção civil', 'IMOBSUPRIMENTOS',
 'https://www.imobsystems.com.br/produtos/imobsuprimentos', 'https://imobsuprimentos.imobsystems.com.br',
 $t$Portal de compras para a construção civil: da solicitação ao pedido, com cotações comparadas lado a lado, fluxos de aprovação e acompanhamento de entregas. O fluxo funciona de forma nativa; a integração com o TOTVS RM é opcional.$t$,
 $t$Aqui está a página do ImobSuprimentos com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Construtoras e incorporadoras que compram para as obras.',
 $j$[{"titulo":"Solicitações de compra","descricao":"Pedidos das obras centralizados, com origem, quantidade e prazo.","status":"disponivel"},
     {"titulo":"Cotações","descricao":"Mapa comparativo com fornecedores em colunas e destaque de menor preço e menor prazo.","status":"disponivel"},
     {"titulo":"Gestão de fornecedores","descricao":"Cadastro e convite de fornecedores para responder às cotações.","status":"disponivel"},
     {"titulo":"Acompanhamento de compras","descricao":"Controle de entregas e situação de cada pedido.","status":"disponivel"},
     {"titulo":"Fluxos de aprovação","descricao":"Aprovação de cotações e compras por alçada, com histórico.","status":"disponivel"},
     {"titulo":"Integração com TOTVS RM","descricao":"Troca de dados com o ERP via API, quando o cliente utiliza o RM.","status":"disponivel"},
     {"titulo":"Automação com IA","descricao":"Apoio de inteligência artificial na análise e comparação das propostas.","status":"disponivel"}]$j$::jsonb, 2),
('imobdoces', 'ImobDoceria', 'Docerias e confeitarias', 'IMOBDOCERIA',
 'https://www.imobsystems.com.br/produtos/imobdoceria', 'https://imobdocerias.imobsystems.com.br',
 $t$Sistema para docerias e confeitarias: catálogo de produtos, app do cliente para pedidos, campanhas, promoções e cupons, programa de fidelidade e atendimento online.$t$,
 $t$Aqui está a página do ImobDoceria com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Docerias e confeitarias que querem vender pelo celular e trazer o cliente de volta.',
 $j$[{"titulo":"Produtos e catálogo","descricao":"Produtos com foto, preço, estoque e itens sob encomenda.","status":"disponivel"},
     {"titulo":"App do cliente","descricao":"Loja para o cliente montar o pedido pelo celular.","status":"disponivel"},
     {"titulo":"Pedidos","descricao":"Pedidos do balcão e do app, com situação de pagamento.","status":"disponivel"},
     {"titulo":"Campanhas","descricao":"Campanhas de marketing para a base de clientes.","status":"disponivel"},
     {"titulo":"Promoções e cupons","descricao":"Banners, cupons de desconto e frete grátis por valor mínimo.","status":"disponivel"},
     {"titulo":"Fidelidade","descricao":"Pontos por produto para trazer o cliente de volta.","status":"disponivel"},
     {"titulo":"Atendimento online","descricao":"Atendimento ao cliente integrado aos pedidos.","status":"disponivel"},
     {"titulo":"Indicadores de gestão","descricao":"Clientes, campanhas, pedidos pagos e faturamento.","status":"disponivel"}]$j$::jsonb, 3),
('imobenviomassa', 'ImobDisparos', 'Incorporadoras, imobiliárias e serviços', 'IMOBDISPAROS',
 'https://www.imobsystems.com.br/produtos/imobdisparos', 'https://imobenviomassa.imobsystems.com.br',
 $t$Sistema de disparos de cobrança e de documentos para assinatura eletrônica (DocuSign e outras plataformas), com histórico, relatórios, perfis de acesso e auditoria. Os envios usam canais oficiais (API oficial do WhatsApp e e-mail).$t$,
 $t$Aqui está a página do ImobDisparos com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Empresas que enviam documentos para assinatura ou cobranças em lote.',
 $j$[{"titulo":"Envio de documentos para assinatura","descricao":"Envio em lote para assinatura eletrônica (DocuSign e outras), com acompanhamento das assinaturas.","status":"disponivel"},
     {"titulo":"Régua de cobrança","descricao":"Boletos a vencer e em atraso enviados por WhatsApp e e-mail, por faixa de atraso.","status":"em_validacao"},
     {"titulo":"Contatos a partir do ERP","descricao":"Empreendimentos e compradores consultados no TOTVS RM.","status":"disponivel"},
     {"titulo":"Histórico de campanhas","descricao":"Cada envio registrado com destinatários e situação.","status":"disponivel"},
     {"titulo":"Indicadores e relatórios","descricao":"Envios do dia, pendências e problemas por campanha.","status":"disponivel"},
     {"titulo":"Perfis e permissões","descricao":"Controle de acesso por perfil e por aplicativo.","status":"disponivel"},
     {"titulo":"Auditoria e LGPD","descricao":"Registro de ações e área de privacidade.","status":"disponivel"}]$j$::jsonb, 4),
('imobpesagens', 'ImobPesagem', 'Construção civil, logística e recebimento de materiais', 'IMOBPESAGEM',
 'https://www.imobsystems.com.br/produtos/imobpesagem', NULL,
 $t$Sistema de pesagem rodoviária para construção civil, logística e recebimento de materiais: pesagens de entrada e saída, conferência com a nota fiscal e alertas de divergência.$t$,
 $t$Aqui está a página do ImobPesagem com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Obras, pátios e operações logísticas com balança rodoviária.',
 $j$[{"titulo":"Controle de balanças rodoviárias","descricao":"Leitura do peso diretamente da balança.","status":"disponivel"},
     {"titulo":"Pesagens de entrada e saída","descricao":"Registro do caminhão cheio e vazio, com peso líquido.","status":"disponivel"},
     {"titulo":"Recebimento de materiais","descricao":"Conferência do que chegou na obra ou no pátio.","status":"disponivel"},
     {"titulo":"Importação de notas fiscais por OCR","descricao":"Leitura automática da nota fiscal.","status":"em_validacao"},
     {"titulo":"Extração inteligente de dados fiscais","descricao":"Itens, quantidades e emitente extraídos da nota.","status":"em_validacao"},
     {"titulo":"Cartas de traço de concreto","descricao":"Gestão das cartas de traço usadas na conferência.","status":"disponivel"},
     {"titulo":"Tabelas de tolerância","descricao":"Tolerância aceita por produto.","status":"disponivel"},
     {"titulo":"Peso esperado × peso recebido","descricao":"Comparação automática entre nota e balança.","status":"disponivel"},
     {"titulo":"Alertas de divergência","descricao":"Aviso quando a diferença passa da tolerância.","status":"disponivel"},
     {"titulo":"Venda de sucatas","descricao":"Controle das saídas de sucata pesadas.","status":"disponivel"},
     {"titulo":"Notas fiscais avulsas","descricao":"Emissão conforme a integração fiscal disponível.","status":"em_validacao"},
     {"titulo":"Dashboards e relatórios","descricao":"Pesagens, divergências e volumes por período.","status":"disponivel"},
     {"titulo":"Integrações com ERP","descricao":"Troca de dados com o ERP, como o TOTVS RM.","status":"disponivel"},
     {"titulo":"Automações e análises com IA","descricao":"Análises inteligentes sobre as pesagens.","status":"em_validacao"}]$j$::jsonb, 5),
('imobdesk', 'Imobdesk', 'Empresas com equipes de atendimento e suporte interno', 'IMOBDESK',
 'https://www.imobsystems.com.br/produtos/imobdesk', 'https://imobproject.imobsystems.com.br',
 $t$Portal de atendimento e help desk multiempresa: tickets com SLA e distribuição por equipe, kanban de atendimento, conversas por WhatsApp, triagem automática e solicitações financeiras (reembolso, adiantamento e fundo fixo) com aprovação por etapa.$t$,
 $t$Aqui está a página do Imobdesk com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Empresas com equipes de atendimento, suporte interno ou várias empresas no mesmo grupo.',
 $j$[{"titulo":"Gestão de tickets","descricao":"Chamados com categoria, equipe, responsável e histórico completo.","status":"disponivel"},
     {"titulo":"Prazos de SLA","descricao":"Vencidos, vencendo hoje e próximos prazos em destaque.","status":"disponivel"},
     {"titulo":"Kanban de atendimento","descricao":"Filas por etapa, com visões configuráveis por equipe.","status":"disponivel"},
     {"titulo":"Conversas e WhatsApp","descricao":"Atendimento por conversa registrado junto ao ticket.","status":"disponivel"},
     {"titulo":"Triagem inteligente","descricao":"Classificação automática dos chamados que chegam pela intranet e por e-mail.","status":"disponivel"},
     {"titulo":"Monitor de atendimento","descricao":"Acompanhamento em tempo real da operação e dos agentes.","status":"disponivel"},
     {"titulo":"App do solicitante","descricao":"O colaborador abre e acompanha os próprios chamados.","status":"disponivel"},
     {"titulo":"Solicitações financeiras","descricao":"Reembolso, adiantamento e fundo fixo com aprovação por etapa e conferência.","status":"disponivel"},
     {"titulo":"Integrações com ERP","descricao":"Consultas ao TOTVS RM e lançamentos no SIENGE.","status":"disponivel"},
     {"titulo":"Multiempresa","descricao":"Várias empresas na mesma plataforma, com dados isolados e um só login.","status":"disponivel"}]$j$::jsonb, 6),
('imobeducacional', 'ImobEduca', 'Escolas e instituições de ensino', 'IMOBEDUCA',
 'https://www.imobsystems.com.br/produtos/imobeduca', NULL,
 $t$Sistema financeiro educacional multiunidade: alunos, responsáveis, contratos e títulos, régua de cobrança por WhatsApp e e-mail, DRE gerencial por unidade e integração com o TOTVS RM, com permissão de acesso por menu. Complementa o TOTVS RM, que continua sendo a base acadêmica e financeira.$t$,
 $t$Aqui está a página do ImobEduca com tudo o que ele faz. Quer ver funcionando em 30 minutos com um consultor?$t$,
 'Escolas e instituições de ensino, com uma ou várias unidades.',
 $j$[{"titulo":"Alunos e responsáveis","descricao":"Cadastro de alunos, responsáveis financeiros e contratos.","status":"disponivel"},
     {"titulo":"Contas a receber","descricao":"Mensalidades e títulos por unidade, com histórico de pagamentos.","status":"disponivel"},
     {"titulo":"Régua de cobrança","descricao":"Lembretes e avisos de D-3 a D+30 por WhatsApp e e-mail.","status":"disponivel"},
     {"titulo":"Fila de cobrança por risco","descricao":"Responsáveis em atraso priorizados por dias de atraso, valor e unidade.","status":"em_validacao"},
     {"titulo":"Redator de cobrança com IA","descricao":"Mensagens de cobrança sugeridas no tom escolhido, dentro das regras legais.","status":"em_validacao"},
     {"titulo":"DRE gerencial","descricao":"Resultado por unidade e consolidado, a partir dos lançamentos realizados.","status":"disponivel"},
     {"titulo":"Demonstrativos","descricao":"Relatórios financeiros por período e por unidade.","status":"disponivel"},
     {"titulo":"Integração com TOTVS RM","descricao":"Leitura e gravação de dados no RM por um gateway de APIs.","status":"disponivel"},
     {"titulo":"Multiunidade","descricao":"Várias unidades (coligadas) com visão separada e consolidada.","status":"disponivel"},
     {"titulo":"Permissões por menu","descricao":"Acesso de cada usuário controlado por menu e por unidade.","status":"disponivel"}]$j$::jsonb, 7);

-- Respostas prontas (enviadas palavra por palavra quando a pergunta bate) ----------------------------
CREATE TABLE comercial.atend_respostas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria  text NOT NULL DEFAULT 'geral' CHECK (categoria IN ('geral', 'preco', 'integracao', 'seguranca', 'implantacao')),
  pergunta   text NOT NULL CHECK (length(btrim(pergunta)) > 0),
  resposta   text NOT NULL CHECK (length(btrim(resposta)) > 0),
  ativo      boolean NOT NULL DEFAULT true,
  ordem      integer NOT NULL DEFAULT 0
);
INSERT INTO comercial.atend_respostas (categoria, pergunta, resposta, ordem) VALUES
('geral', 'Quem é a WSA Sistemas?',
 $t$A WSA Sistemas IA une tecnologia, automação e inteligência artificial em um ecossistema de sistemas para diferentes negócios: imobiliárias e incorporadoras, construtoras, docerias, escolas, logística e equipes de atendimento. Tudo está em www.imobsystems.com.br.$t$, 1),
('preco', 'Quanto custa? Qual o valor?',
 $t$O valor depende do sistema, do número de usuários e dos módulos. Um consultor monta a proposta certa para você numa demonstração rápida de 30 minutos. Quer que eu marque?$t$, 2),
('integracao', 'Integra com o TOTVS RM? Integra com ERP?',
 $t$Sim. ImobSuprimentos, ImobDisparos, ImobPesagem, Imobdesk e ImobEduca têm integração com o TOTVS RM, configurada conforme o ambiente da sua empresa. O Imobdesk também faz lançamentos no SIENGE. Na demonstração o consultor confere o seu caso.$t$, 3),
('seguranca', 'Os dados ficam seguros? E a LGPD?',
 $t$Cada empresa tem os dados separados e o acesso de cada usuário é controlado por perfil. Os detalhes de segurança e LGPD do sistema que você precisa, o consultor mostra na demonstração.$t$, 4),
('implantacao', 'Como funciona a implantação? Quanto tempo leva?',
 $t$A implantação é acompanhada pela equipe WSA. O prazo depende do sistema e das integrações que a sua empresa precisa; o consultor apresenta o plano na demonstração.$t$, 5),
('geral', 'Usa o WhatsApp oficial?',
 $t$Sim. Os envios por WhatsApp dos nossos sistemas usam a API oficial do WhatsApp, por meio de provedores homologados.$t$, 6);

-- Consultores da fila (rodízio na ordem) -----------------------------------------------------------
CREATE TABLE comercial.atend_consultores (
  vendedor_id  uuid PRIMARY KEY REFERENCES comercial.vendedores(id) ON DELETE CASCADE,
  apps         text[] NOT NULL DEFAULT '{}',          -- vazio = todos os sistemas
  apto         boolean NOT NULL DEFAULT true,
  ordem        integer NOT NULL DEFAULT 0
);
INSERT INTO comercial.atend_consultores (vendedor_id, ordem)
SELECT v.id, row_number() OVER (ORDER BY v.criado_em) FROM comercial.vendedores v WHERE v.ativo AND v.recebe_leads;

-- Conversas e mensagens (a Fase 3 grava; a Fase 1 já usa para a prévia da fila) ----------------------
CREATE TABLE comercial.atend_conversas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id          uuid NOT NULL UNIQUE REFERENCES comercial.negocios(id) ON DELETE CASCADE,
  situacao            text NOT NULL DEFAULT 'aguardando' CHECK (situacao IN ('aguardando', 'robo', 'consultor', 'encerrada', 'saiu', 'falhou')),
  consultor_id        uuid REFERENCES comercial.vendedores(id) ON DELETE SET NULL,
  bv_enviada_em       timestamptz,
  bv_erro             text,
  ultima_msg_em       timestamptz,
  ultima_msg_lead_em  timestamptz,
  lembrete_em         timestamptz,
  criado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atend_conversas_ultima_idx ON comercial.atend_conversas (ultima_msg_em DESC NULLS LAST);

CREATE TABLE comercial.atend_mensagens (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  uuid NOT NULL REFERENCES comercial.atend_conversas(id) ON DELETE CASCADE,
  autor        text NOT NULL CHECK (autor IN ('lead', 'robo', 'consultor', 'sistema')),
  texto        text NOT NULL,
  wa_id        text UNIQUE,
  detalhe      jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atend_mensagens_conversa_idx ON comercial.atend_mensagens (conversa_id, criado_em);

ALTER TABLE comercial.atend_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atend_sistemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atend_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atend_consultores ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atend_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial.atend_mensagens ENABLE ROW LEVEL SECURITY;

-- Quem pode receber a boas-vindas: o motivo de ficar de fora (NULL = apto). Uma regra só para a prévia e o envio.
CREATE FUNCTION comercial.atend_motivo_fora(p_negocio uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM comercial.atend_conversas cv WHERE cv.negocio_id = n.id) THEN 'Já recebeu'
    WHEN c.nao_whatsapp THEN 'Pediu para não receber WhatsApp'
    WHEN c.whatsapp IS NULL THEN 'Sem telefone'
    WHEN e.ganho THEN 'Etapa Ganho'
    WHEN e.final THEN 'Etapa ' || e.nome
    WHEN NOT (e.chave = ANY (cfg.bv_etapas)) THEN 'Consultor já conduz (' || e.nome || ')'
    WHEN n.temperatura IS NULL THEN 'Sem temperatura'
    WHEN NOT (n.temperatura = ANY (cfg.bv_temperaturas)) THEN 'Lead ' || n.temperatura
  END
  FROM comercial.negocios n
  JOIN comercial.contatos c ON c.id = n.contato_id
  JOIN comercial.etapas e ON e.id = n.etapa_id
  CROSS JOIN comercial.atend_config cfg
  WHERE n.id = p_negocio
$$;

-- Painel (super admin) ----------------------------------------------------------------------------
CREATE FUNCTION public.com_atend_painel() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  RETURN pg_catalog.jsonb_build_object(
    'config', (SELECT pg_catalog.to_jsonb(c) FROM comercial.atend_config c WHERE c.id),
    'sistemas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.ordem, s.nome) FROM comercial.atend_sistemas s), '[]'::jsonb),
    'respostas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.ordem, r.pergunta) FROM comercial.atend_respostas r), '[]'::jsonb),
    'consultores', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('vendedor_id', v.id, 'nome', v.nome, 'email', v.email,
                    'na_fila', ac.vendedor_id IS NOT NULL, 'apps', coalesce(ac.apps, '{}'), 'apto', coalesce(ac.apto, false), 'ordem', ac.ordem)
                    ORDER BY ac.ordem NULLS LAST, v.nome)
                  FROM comercial.vendedores v LEFT JOIN comercial.atend_consultores ac ON ac.vendedor_id = v.id WHERE v.ativo), '[]'::jsonb),
    'apps', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('app', s.app, 'nome', coalesce(a.nome, s.app)) ORDER BY coalesce(a.nome, s.app))
                  FROM adm.sistemas s LEFT JOIN acessos.aplicativos a ON a.schema_name = s.app), '[]'::jsonb),
    'etapas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('chave', e.chave, 'nome', e.nome) ORDER BY e.ordem)
                  FROM comercial.etapas e WHERE NOT e.final), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.com_atend_config_salvar(p jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v comercial.atend_config;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
  -- Ligar/desligar tem função própria (com a trava do simulador); id e datas não mudam por aqui.
  p := p - 'id' - 'ligado' - 'simulado_em' - 'atualizado_em' - 'atualizado_por';
  SELECT * INTO v FROM comercial.atend_config c WHERE c.id;
  v := pg_catalog.jsonb_populate_record(v, p);
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(v.bv_etapas) x WHERE x NOT IN (SELECT e.chave FROM comercial.etapas e WHERE NOT e.final)) THEN
    RAISE EXCEPTION 'Etapa do funil inválida.';
  END IF;
  IF cardinality(v.bv_temperaturas) = 0 THEN RAISE EXCEPTION 'Escolha pelo menos uma temperatura.'; END IF;
  UPDATE comercial.atend_config c SET
    agente_nome = pg_catalog.btrim(v.agente_nome), empresa_nome = pg_catalog.btrim(v.empresa_nome), tom = v.tom, emojis = v.emojis,
    objetivo = v.objetivo, roteiro = v.roteiro, passar_consultor = v.passar_consultor, regras_extras = coalesce(v.regras_extras, ''),
    tamanho_resposta = v.tamanho_resposta, retomar_horas = v.retomar_horas,
    bv_temperaturas = v.bv_temperaturas, bv_etapas = v.bv_etapas, bv_modelo = v.bv_modelo, bv_texto = v.bv_texto, bv_botoes = v.bv_botoes,
    bv_janela = v.bv_janela, bv_limite_dia = v.bv_limite_dia, bv_intervalo = v.bv_intervalo, bv_quando = v.bv_quando,
    horario_consultores = v.horario_consultores, msg_fora_horario = v.msg_fora_horario, consultor_espera_min = v.consultor_espera_min,
    palavras_sair = v.palavras_sair, atualizado_em = pg_catalog.now(),
    atualizado_por = (SELECT u.email FROM auth.users u WHERE u.id = auth.uid())
  WHERE c.id;
END;
$$;

CREATE FUNCTION public.com_atend_ligar(p_ligado boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF p_ligado THEN
    IF (SELECT c.simulado_em FROM comercial.atend_config c WHERE c.id) IS NULL THEN
      RAISE EXCEPTION 'Faça 1 simulação completa no Simulador do robô antes de ligar.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM comercial.atend_sistemas s WHERE s.ativo) THEN
      RAISE EXCEPTION 'Ative pelo menos 1 sistema na Base de conhecimento.';
    END IF;
  END IF;
  UPDATE comercial.atend_config c SET ligado = p_ligado, atualizado_em = pg_catalog.now() WHERE c.id;
END;
$$;

CREATE FUNCTION public.com_atend_sistema_salvar(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v comercial.atend_sistemas;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_id IS NOT NULL THEN
    SELECT * INTO v FROM comercial.atend_sistemas s WHERE s.id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sistema não encontrado.'; END IF;
  ELSE
    v.id := gen_random_uuid(); v.ativo := true; v.funcionalidades := '[]'::jsonb;
    v.ordem := coalesce((SELECT max(s.ordem) FROM comercial.atend_sistemas s), 0) + 1;
    v.segmento := ''; v.menu_nome := ''; v.apresentacao := ''; v.texto_material := ''; v.para_quem := ''; v.nao_para_quem := '';
  END IF;
  v := pg_catalog.jsonb_populate_record(v, p - 'id' - 'atualizado_em');
  v.app := nullif(pg_catalog.btrim(v.app), '');
  IF v.app IS NOT NULL AND NOT EXISTS (SELECT 1 FROM adm.sistemas s WHERE s.app = v.app) THEN
    RAISE EXCEPTION 'Sistema do cadastro inválido.';
  END IF;
  v.pagina_url := nullif(pg_catalog.btrim(v.pagina_url), ''); v.sistema_url := nullif(pg_catalog.btrim(v.sistema_url), '');
  v.material_url := nullif(pg_catalog.btrim(v.material_url), '');
  v.menu_nome := pg_catalog.upper(pg_catalog.btrim(coalesce(v.menu_nome, '')));
  v.atualizado_em := pg_catalog.now();
  INSERT INTO comercial.atend_sistemas SELECT v.*
  ON CONFLICT (id) DO UPDATE SET app = EXCLUDED.app, nome = EXCLUDED.nome, segmento = EXCLUDED.segmento, menu_nome = EXCLUDED.menu_nome,
    pagina_url = EXCLUDED.pagina_url, sistema_url = EXCLUDED.sistema_url, material_url = EXCLUDED.material_url, ativo = EXCLUDED.ativo,
    apresentacao = EXCLUDED.apresentacao, texto_material = EXCLUDED.texto_material, para_quem = EXCLUDED.para_quem,
    nao_para_quem = EXCLUDED.nao_para_quem, funcionalidades = EXCLUDED.funcionalidades, ordem = EXCLUDED.ordem, atualizado_em = EXCLUDED.atualizado_em;
  RETURN v.id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Esse sistema do cadastro já está em outro item da Base.';
END;
$$;

CREATE FUNCTION public.com_atend_sistema_excluir(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  DELETE FROM comercial.atend_sistemas s WHERE s.id = p_id;
END;
$$;

CREATE FUNCTION public.com_atend_resposta_salvar(p jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_id uuid := nullif(p ->> 'id', '')::uuid;
BEGIN
  PERFORM adm.exigir_super_admin();
  IF v_id IS NULL THEN
    INSERT INTO comercial.atend_respostas (categoria, pergunta, resposta, ativo, ordem)
    VALUES (coalesce(nullif(p ->> 'categoria', ''), 'geral'), pg_catalog.btrim(p ->> 'pergunta'), pg_catalog.btrim(p ->> 'resposta'),
            coalesce((p ->> 'ativo')::boolean, true), coalesce((SELECT max(r.ordem) FROM comercial.atend_respostas r), 0) + 1)
    RETURNING id INTO v_id;
  ELSE
    UPDATE comercial.atend_respostas r SET categoria = coalesce(nullif(p ->> 'categoria', ''), r.categoria),
      pergunta = coalesce(pg_catalog.btrim(p ->> 'pergunta'), r.pergunta), resposta = coalesce(pg_catalog.btrim(p ->> 'resposta'), r.resposta),
      ativo = coalesce((p ->> 'ativo')::boolean, r.ativo)
    WHERE r.id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Resposta não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.com_atend_resposta_excluir(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  DELETE FROM comercial.atend_respostas r WHERE r.id = p_id;
END;
$$;

-- Consultores: a lista inteira, na ordem do rodízio: [{vendedor_id, apps, apto}].
CREATE FUNCTION public.com_atend_consultores_salvar(p jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM adm.exigir_super_admin();
  IF pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de consultores inválida.'; END IF;
  DELETE FROM comercial.atend_consultores WHERE true;
  INSERT INTO comercial.atend_consultores (vendedor_id, apps, apto, ordem)
  SELECT (x.e ->> 'vendedor_id')::uuid,
         coalesce((SELECT pg_catalog.array_agg(a) FROM pg_catalog.jsonb_array_elements_text(coalesce(x.e -> 'apps', '[]'::jsonb)) a), '{}'),
         coalesce((x.e ->> 'apto')::boolean, true), x.i
    FROM pg_catalog.jsonb_array_elements(p) WITH ORDINALITY AS x(e, i)
    JOIN comercial.vendedores v ON v.id = (x.e ->> 'vendedor_id')::uuid AND v.ativo;
END;
$$;

-- Prévia da fila de boas-vindas: quem recebe agora, quem já recebeu e quem fica de fora (com o motivo).
CREATE FUNCTION public.com_atend_fila(p_limite integer DEFAULT 200) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_linhas jsonb;
BEGIN
  PERFORM adm.exigir_super_admin();
  WITH base AS (
    SELECT n.id, c.nome, c.empresa_nome, c.whatsapp, n.temperatura, n.pontuacao, e.nome AS etapa, n.sistemas, n.criado_em,
           cv.situacao AS conversa, cv.bv_enviada_em, cv.ultima_msg_lead_em, comercial.atend_motivo_fora(n.id) AS motivo
      FROM comercial.negocios n
      JOIN comercial.contatos c ON c.id = n.contato_id
      JOIN comercial.etapas e ON e.id = n.etapa_id
      LEFT JOIN comercial.atend_conversas cv ON cv.negocio_id = n.id
  ), s AS (
    SELECT b.*, CASE WHEN b.conversa IS NOT NULL THEN 'conversa' WHEN b.motivo IS NULL THEN 'na_fila' ELSE 'fora' END AS grupo FROM base b
  )
  SELECT pg_catalog.jsonb_build_object(
    'resumo', (SELECT pg_catalog.jsonb_build_object(
        'na_fila', count(*) FILTER (WHERE grupo = 'na_fila'),
        'conversas', count(*) FILTER (WHERE grupo = 'conversa'),
        'fora', count(*) FILTER (WHERE grupo = 'fora'),
        'sem_telefone', count(*) FILTER (WHERE motivo = 'Sem telefone')) FROM s),
    'linhas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'negocio_id', x.id, 'nome', x.nome, 'empresa', x.empresa_nome, 'whatsapp', x.whatsapp, 'temperatura', x.temperatura,
        'pontuacao', x.pontuacao, 'etapa', x.etapa, 'sistemas', x.sistemas, 'grupo', x.grupo, 'motivo', x.motivo,
        'conversa', x.conversa, 'bv_enviada_em', x.bv_enviada_em, 'respondeu', x.ultima_msg_lead_em IS NOT NULL))
      FROM (SELECT * FROM s ORDER BY CASE grupo WHEN 'na_fila' THEN 0 WHEN 'conversa' THEN 1 ELSE 2 END,
                                     pontuacao DESC NULLS LAST, criado_em DESC LIMIT greatest(1, least(p_limite, 1000))) x), '[]'::jsonb))
  INTO v_linhas;
  RETURN v_linhas;
END;
$$;

-- Edge Functions (service_role) --------------------------------------------------------------------
-- Tudo o que a Sophia precisa saber para responder (simulador e robô).
CREATE FUNCTION public.com_srv_atend_contexto() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'config', (SELECT pg_catalog.to_jsonb(c) FROM comercial.atend_config c WHERE c.id),
    'sistemas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.ordem) FROM comercial.atend_sistemas s WHERE s.ativo), '[]'::jsonb),
    'respostas', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('categoria', r.categoria, 'pergunta', r.pergunta, 'resposta', r.resposta) ORDER BY r.ordem)
                 FROM comercial.atend_respostas r WHERE r.ativo), '[]'::jsonb))
$$;

-- Marca que o robô foi testado no simulador (libera o "ligar").
CREATE FUNCTION public.com_srv_atend_simulado() RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$ UPDATE comercial.atend_config c SET simulado_em = pg_catalog.now() WHERE c.id AND c.simulado_em IS NULL $$;

REVOKE ALL ON ALL TABLES IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comercial.atend_motivo_fora(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comercial.atend_motivo_fora(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.com_atend_painel(), public.com_atend_config_salvar(jsonb), public.com_atend_ligar(boolean),
  public.com_atend_sistema_salvar(jsonb), public.com_atend_sistema_excluir(uuid), public.com_atend_resposta_salvar(jsonb),
  public.com_atend_resposta_excluir(uuid), public.com_atend_consultores_salvar(jsonb), public.com_atend_fila(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.com_atend_painel(), public.com_atend_config_salvar(jsonb), public.com_atend_ligar(boolean),
  public.com_atend_sistema_salvar(jsonb), public.com_atend_sistema_excluir(uuid), public.com_atend_resposta_salvar(jsonb),
  public.com_atend_resposta_excluir(uuid), public.com_atend_consultores_salvar(jsonb), public.com_atend_fila(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.com_srv_atend_contexto(), public.com_srv_atend_simulado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.com_srv_atend_contexto(), public.com_srv_atend_simulado() TO service_role;
