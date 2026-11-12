# Atendimento ONLINE — robô de WhatsApp do ecossistema WSA (Gestão Comercial)

Mockup aprovado: `docs/mockups/atendimento-online.html` (11/11/2026). Atendente virtual: **Sophia · WSA Sistemas IA**.
Tudo nasce **pré-preenchido** (prompt, roteiro, regras, base de sistemas a partir de `wsa-landing-page/src/data/products.ts`),
para o Wagner só ajustar.

## Prompt (o que está sendo construído)

Menu novo **Gestão Comercial › Atendimento ONLINE** (`/atendimento-online`), super admin, com 8 abas:
Conversas · Boas-vindas e regras · Base de conhecimento · Prompt do atendimento · Fila e horários · Painel do robô ·
Simulador do robô · WhatsApp.

- O robô puxa os contatos de **Leads & Contatos** (`comercial.contatos.whatsapp` = campo Telefone).
- Recebe a boas-vindas **"Bem-vindo ao Ecossistema WSA Sistemas IA"** só quem: tem telefone; temperatura **Morno ou
  Quente** (a classificação já existente da Qualificação); está em **Novo lead** ou **Qualificação** (depois disso um
  consultor já conduz); nunca recebeu; não pediu para sair.
- A primeira mensagem é um **modelo aprovado pela Meta** (`boas_vindas_ecossistema`), com janela de envio, limite por
  dia e intervalo aleatório (proteção do número).
- Depois que o lead responde, a Sophia conversa seguindo o roteiro (segmento → dor → indicar 1 sistema da Base → oferecer
  demonstração), passa para um consultor nas regras marcadas e nunca inventa preço, prazo nem funcionalidade.
- O robô só entra no ar depois de 1 simulação completa.
- Vendas fechadas contam nos Relatórios Comerciais com origem **"Atendimento ONLINE"**.

Banco: schema `comercial` (aditivo), RPCs `public.com_atend_*` (super admin) e `public.com_srv_atend_*` (service_role).
IA: Edge Function com `LOVABLE_API_KEY` (já existe no ikvj), modelo em `ADM_IA_MODELO` (padrão `google/gemini-2.5-flash`),
criatividade fixa 0,3.

## Fases (checklist binário)

### Fase 1 — Configuração pré-preenchida
- [x] Migração `comercial_10_atendimento_online`: config, base de sistemas, respostas prontas, consultores, conversas,
      mensagens, saída do lead (`contatos.nao_whatsapp`), RPCs do painel, prévia da fila de boas-vindas
- [ ] Pré-preenchimento: Sophia, roteiro de 5 passos, regras de passar para consultor, regras fixas, 7 sistemas do site,
      respostas prontas, horários
- [ ] Teste PGlite `atendimento.test.mjs`
- [ ] Tela `/atendimento-online` com as abas de configuração (Boas-vindas e regras, Base, Prompt, Fila e horários, WhatsApp)
- [ ] Item no menu Gestão Comercial

### Fase 2 — Simulador
- [ ] `_shared/atendimento.ts`: monta o prompt a partir da config + base + respostas prontas
- [ ] Edge Function `atend-simulador` (super admin, não envia nada, não grava no funil)
- [ ] Aba Simulador com "o que o robô faria" e trava "robô só liga depois de 1 simulação"

### Fase 3 — WhatsApp de verdade (pelo OpeWA, sessão wsa-admin)
- [x] Envio da boas-vindas pelo OpeWA (pg_cron com-atend a cada minuto + Edge Function atend-cron; janela, limite e intervalo no banco; começa com 30/dia)
- [x] Webhook de entrada (atend-webhook, assinatura HMAC) → Sophia responde → grava conversa, nota e etapa
- [x] PARAR/SAIR tira o lead da lista
- [x] Aba Conversas: lista, chat, "Assumir conversa", resposta do consultor pelo painel (robô pausa)
- [x] Consultor respondendo direto no celular da sessão: grava como consultor e pausa a Sophia
- [x] Passar para consultor: rodízio entre os aptos; aviso no WhatsApp só para consultor com outro número
- [x] Lembrete único sem resposta
- [x] Teste PGlite `atendimento-whatsapp.test.mjs`
- [ ] Migração `comercial_11` rodada no ikvj (Wagner)
- [ ] Webhook conectado pela aba WhatsApp (botão "Conectar webhook")
- Secrets: ADM_OPEWA_URL, ADM_OPEWA_API_KEY, ADM_OPEWA_SESSAO (já cadastrados). Decisão: OpeWA no lugar da API oficial da Meta.
### Fase 4 — Painel e relatórios
- [ ] Aba Painel do robô (boas-vindas, responderam, demonstrações, foram ao consultor, onde parou, sistema mais procurado)
- [ ] Origem "Atendimento ONLINE" nos Relatórios Comerciais
