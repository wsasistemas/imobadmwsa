# Plano ImobAdm WSA: cobrança por empresa (Asaas) + captação de leads, funil e agenda

- **Status:** mockup v2 aprovado em 06/11/2026 ([mockups/admin-completo-v2.html](mockups/admin-completo-v2.html)). O v1 ([mockups/admin-empresas-assinaturas.html](mockups/admin-empresas-assinaturas.html)) fica só como histórico.
- **Regra das fases:** cada item é **feito** ou **não feito**. Uma fase só começa com a anterior 100% feita.
- **Migrations:** sempre aditivas. Nada de `drop` nem de `alter` destrutivo.

## Premissas (confirmar na Fase 0)

| # | Premissa | Se mudar |
|---|---|---|
| P1 | Supabase central = `ikvjaowvpvxojvcfwnct` (ImobSystem, ImobDoces, Imobenviomassa e a `saas_leads` do site) | troca o destino das migrations e do client |
| P2 | "Após 10 dias" = suspende no **11º dia** de atraso, às 00:05 (horário de Brasília) | muda só `adm.regua.dias_tolerancia` |
| P3 | A suspensão derruba **todos** os sistemas da empresa | `adm.regua.alcance = 'fatura'` |
| P4 | **Uma assinatura Asaas por empresa**, no valor da soma dos sistemas vinculados. O cliente escolhe boleto, PIX ou cartão (`billingType: UNDEFINED`) | uma assinatura por vínculo |
| P5 | Empresa **sem vínculo cadastrado** = liberada. Só bloqueia quem o painel suspendeu | — |
| P6 | Trabalho na branch local `feat/cobranca-empresas`. A `main` sincroniza com o Lovable | — |
| P7 | O funil é **B2B**, para venda dos sistemas WSA. As etapas são as do mockup v2 | as etapas são configuráveis na tela |
| P8 | WhatsApp de saída: a integração já usada no imobadmwsa (`src/lib/whatsapp.functions.ts`) ou a Zenvia do imobatendimento. **A escolha é feita na Fase 0.** Na API oficial, a 1ª mensagem ao lead exige um **template aprovado** na Meta | troca só o envio |
| P9 | LinkedIn e TikTok: telas copiadas com o botão Conectar desligado. A integração fica fora deste plano | plano próprio depois |

## Como funciona (resumo)

```
CAPTAÇÃO
Site imobsystems.com.br ──► Edge leads-entrada (chave do site + Turnstile) ─┐
Instagram/Facebook Lead Ads ──► Edge meta-leadgen-webhook (assinatura HMAC) ┼─► comercial.receber_lead()
                                                                           │     contato + negócio "Novo lead" (sem duplicar)
                                                                           └─► WhatsApp de boas-vindas com o link de agendamento
AGENDA
/agendar/<token> ──► Edge agenda-horarios (Google freeBusy) ──► horários livres
              └────► Edge agenda-marcar ──► Google events.insert + Meet + convite
                                         └─► comercial.reunioes + card em "Reunião agendada" + lembretes 24 h / 1 h
FUNIL → CLIENTE
Card em "Ganho" ──► adm.empresas + adm.vinculos + assinatura Asaas
COBRANÇA
Asaas ──webhook──► adm-asaas-webhook ──► adm.faturas (paga/vencida) ──► reativa na hora
pg_cron 03:05 UTC ──► adm.processar_regua() ──► avisos + suspensão no 11º dia
Cada sistema ──► public.empresa_liberada(p_app, p_ref) ──► true/false (+ faixa e pop-up)
```

## Modelo de dados

### Schema `adm` (cobrança)

| Tabela | Campos principais |
|---|---|
| `adm.empresas` | id, cnpj (único), razao_social, nome_fantasia, dono_nome, whatsapp, email_financeiro, situacao (`em_dia`, `atraso`, `suspensa`, `cortesia`, `cancelada`), prazo_extra_ate, asaas_customer_id, asaas_subscription_id, dia_vencimento, negocio_id (origem no funil), observacoes, created_at, updated_at |
| `adm.vinculos` | id, empresa_id, app (chave de `acessos.aplicativos`), schema_ref, tenant_ref, plano, valor_mensal, ativo, acesso_manual (`null`, `liberado` ou `bloqueado`), created_at. Único: (app, coalesce(schema_ref, tenant_ref)) |
| `adm.faturas` | id, empresa_id, competencia, vencimento, valor, situacao (`a_vencer`, `vencida`, `paga`, `cancelada`, `estornada`), pago_em, forma, asaas_payment_id (único), invoice_url, created_at |
| `adm.eventos` | id, empresa_id, fatura_id, tipo, detalhe jsonb, autor, created_at |
| `adm.avisos_enviados` | PK (fatura_id, passo, canal), enviado_em. Garante a idempotência |
| `adm.asaas_eventos` | id do evento Asaas (PK), payload, recebido_em, processado |
| `adm.regua` | 1 linha: dias_tolerancia (10), alcance, passos jsonb, reativar_automatico |

### Schema `comercial` (leads, funil e agenda)

| Tabela | Campos principais |
|---|---|
| `comercial.contatos` | id, nome, whatsapp (normalizado E.164, único quando não nulo), email (único quando não nulo), empresa_nome, cargo, origem (`site`, `instagram`, `facebook`, `linkedin`, `tiktok`, `manual`, `importado`), fonte_id, campanha, formulario, consentimento_lgpd, consentimento_em, created_at |
| `comercial.etapas` | id, nome, ordem, cor, final (bool), ganho (bool). Semente: Novo lead, Qualificação, Reunião agendada, Demonstração feita, Proposta enviada, Negociação, Ganho, Perdido |
| `comercial.negocios` | id, contato_id, etapa_id, sistemas text[] (chaves dos apps), valor_mensal_previsto, vendedor_id, motivo_perda, empresa_id (preenchido no Ganho), token_agenda (único, expira), ultima_interacao, created_at, updated_at |
| `comercial.atividades` | id, negocio_id, tipo (`nota`, `ligacao`, `whatsapp`, `email`, `lead_repetido`, `etapa`, `reuniao`), texto, autor, created_at |
| `comercial.reunioes` | id, negocio_id, vendedor_id, inicio, fim, situacao (`marcada`, `realizada`, `cancelada`, `nao_compareceu`), origem (`lead`, `equipe`), google_event_id, google_calendar_id, meet_url, lembrete_24h_em, lembrete_1h_em |
| `comercial.fontes` | id, tipo (`site`, `meta`, `linkedin`, `tiktok`), nome, dominio, chave_hash (só o hash), sistema_padrao, ativo, ultimo_lead_em |
| `comercial.meta_conexoes` | id, page_id, page_nome, ig_usuario, conectado_por, token_vault_id (o token fica no **Vault**), token_valido, verificado_em |
| `comercial.meta_formularios` | form_id (PK), conexao_id, nome, plataforma, sistema, ativo |
| `comercial.leads_recebidos` | id, fonte_id, id_externo (ex.: leadgen_id, único por fonte), payload, recebido_em, negocio_id, erro. Serve para idempotência e auditoria |
| `comercial.agendas_google` | id, usuario_id, email, calendar_id, refresh_token_vault_id (Vault), ativo, ultima_sincronizacao |
| `comercial.config_agenda` | 1 linha: duracao_min (30), intervalo_min (15), horario (seg–sex 09–18), antecedencia_min (120), criar_meet, lembretes, distribuicao (`rodizio`, `primeiro_livre`), mover_card |

**Funções principais**
- `comercial.receber_lead(p_fonte, p_dados jsonb)`: normaliza o telefone e o e-mail. Contato existente → anotação `lead_repetido` no negócio aberto; senão cria o contato e o negócio em "Novo lead". Devolve o negócio e o token de agenda. É `security definer` e só a `service_role` executa.
- `comercial.mover_etapa(negocio, etapa)`: grava a atividade. Se a etapa for `ganho`, chama `adm.criar_empresa_do_negocio(negocio)`, que cria a empresa e os vínculos e devolve o id para a Edge criar a assinatura Asaas.
- RPCs do painel (`public.com_*`, `public.adm_*`): todas checam `public.pa_sou_super_admin()` (ou o perfil comercial, ver Fase 8) na primeira linha.

**Segurança (vale para os dois schemas)**
- RLS em todas as tabelas. Os schemas `adm` e `comercial` **não** ficam expostos: o acesso é por funções em `public`.
- `revoke execute ... from public, anon` em todas as funções novas.
- Tokens (Meta, Google, Asaas) ficam nos secrets das Edge Functions ou no Supabase Vault. Nunca em tabela aberta, no front, em log ou em commit.
- As Edge Functions públicas (`leads-entrada`, `meta-leadgen-webhook`, `adm-asaas-webhook`, `agenda-*`) validam a origem: chave do site + Turnstile, assinatura HMAC da Meta, token do Asaas, token de agenda com validade. Também têm limite de chamadas por IP.

## Integrações externas

### Asaas

| Ação | Chamada |
|---|---|
| Cliente | `GET /customers?cpfCnpj=` → senão `POST /customers` |
| Assinatura | `POST /subscriptions` `{customer, billingType: "UNDEFINED", cycle: "MONTHLY", value, nextDueDate, description, externalReference: empresa_id}` |
| Mudança de valor | `PUT /subscriptions/{id}` `{value, updatePendingPayments: true}` |
| Cancelar | `DELETE /subscriptions/{id}` |
| Webhook | `POST/PUT /webhooks` com `authToken` aleatório |

**Eventos do webhook**

| Evento | Efeito |
|---|---|
| `PAYMENT_CREATED` | cria a fatura |
| `PAYMENT_UPDATED` | atualiza o valor e o vencimento |
| `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED` | marca `paga`, recalcula e **reativa na hora** |
| `PAYMENT_OVERDUE` | marca `vencida` (a régua decide a suspensão) |
| `PAYMENT_DELETED` | marca `cancelada` |
| `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` | marca `estornada`, recalcula e registra evento |

- Base reaproveitada do imobdocerias: `supabase/functions/create-asaas-payment` (`asaasFetch`, `findOrCreateCustomer`) e `asaas-register-webhook`.
- **Diferença obrigatória:** sem token válido → 403, sempre.

### Meta (Facebook e Instagram Lead Ads)
- Telas e textos copiados do imobatendimento (`src/features/fontes-leads/*`: `conectores.ts`, `FonteLeads.tsx`, `meta/service.ts`).
- Feito uma vez pela WSA:
  - app da WSA na Meta, com a empresa verificada;
  - Login do Facebook;
  - produto Webhooks com o objeto `page` e o campo `leadgen`;
  - revisão das permissões `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` e `business_management` (3 a 10 dias úteis).
- Conexão:
  - login do Facebook no painel;
  - troca pelo token de longa duração e escolha da página;
  - `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`;
  - o token da página vai para o Vault.
- Webhook:
  - o `GET` responde o `hub.challenge` (verify token num secret);
  - o `POST` valida `X-Hub-Signature-256` (HMAC com o app secret);
  - para cada `leadgen_id`, chama `GET /{leadgen_id}` com o token da página, e `platform` dá a origem (`fb` ou `ig`);
  - depois chama `comercial.receber_lead`.
- Token vencido ou permissão perdida → `token_valido = false`, aviso na tela e evento.

### Site www.imobsystems.com.br
- Hoje o formulário grava direto em `public.saas_leads` com a anon key.
- O formulário passa a chamar `POST /functions/v1/leads-entrada` com a chave do site e o token do Turnstile.
- **Na virada, um gatilho em `saas_leads` também chama `comercial.receber_lead`.** Assim nenhum lead se perde enquanto o site não é trocado, e as landings antigas (`landing-doceria`, `landing-page`) continuam entrando.
- Carga inicial: importar os registros de `saas_leads` para `comercial.contatos` e `comercial.negocios`, com origem `importado` e sem disparar WhatsApp.

### Google Agenda
- OAuth do Google por vendedor, com os escopos `calendar.events` e `calendar.freebusy`. O refresh token fica no Vault.
- Horários livres: `POST https://www.googleapis.com/calendar/v3/freeBusy` nas agendas ativas, cruzado com `config_agenda` (horário, duração, intervalo, antecedência) e com as reuniões já marcadas.
- Marcar:
  - `events.insert` com `conferenceDataVersion=1` (`createRequest` gera o Meet) e `sendUpdates=all`, que manda o convite ao lead;
  - grava `comercial.reunioes`;
  - move o card para "Reunião agendada";
  - confirma no WhatsApp.
- Corrida de horário: rechecar o freeBusy imediatamente antes do `insert`, com uma trava (advisory lock) por vendedor e horário. Se o horário foi tomado, oferecer os próximos.
- Lembretes: pg_cron a cada 5 min envia os de 24 h e 1 h ainda não enviados.
- Remarcar ou cancelar pelo link: `events.patch` ou `events.delete` e atualização da reunião.
- Distribuição: rodízio entre as agendas ativas, ou o primeiro vendedor com o horário livre.

---

## Fase 0: preparação

- [ ] Premissas P1 a P9 confirmadas; integração de WhatsApp de saída escolhida (P8)
- [ ] `.env` e `.env.*` no `.gitignore` deste repo, antes de qualquer commit
- [ ] Commit do estado atual (só código, sem `.env`) e branch `feat/cobranca-empresas` criada
- [ ] Conta Asaas **sandbox** e secrets `ASAAS_API_KEY`, `ASAAS_ENVIRONMENT=sandbox` e `ASAAS_WEBHOOK_TOKEN` no Supabase
- [ ] Levantado no ikvj: `acessos.aplicativos`, `imobdoces.lojas`, `public.imobiliarias` e `public.saas_leads` (colunas, policies e volume)
- [ ] `pg_cron`, `pg_net` e Vault habilitados no ikvj
- [ ] Pedidos externos abertos, porque são demorados:
  - app da Meta com a revisão das permissões;
  - projeto no Google Cloud com a Calendar API, a tela de consentimento OAuth e a URL de retorno;
  - template de boas-vindas no WhatsApp, se for a API oficial.

## Fase 1: banco `adm` (cobrança)

- [ ] Migration `adm_schema_tabelas`: schema, tipos, as 7 tabelas, índices, RLS e policies de super admin
- [ ] Migration `adm_funcoes`: `dias_atraso`, `recalcular_empresa`, `empresa_liberada_ref`, `processar_regua` (sem envio ainda), `public.empresa_liberada`, `adm.criar_empresa_do_negocio` e as RPCs `public.adm_*`
- [ ] `revoke` de `public` e `anon` em todas as funções; `grant` só onde o site precisa
- [ ] Gatilho que grava `adm.eventos` ao mudar `empresas.situacao`
- [ ] Teste SQL em transação:
  - 10 dias de atraso → liberada;
  - 11 dias → suspensa;
  - pagou → liberada;
  - prazo extra no futuro → liberada;
  - sem vínculo → liberada.
- [ ] `types.ts` gerado para as funções novas

## Fase 2: Asaas (Edge Functions)

- [ ] `adm-asaas-cliente-assinatura`: cria ou acha o cliente, cria ou atualiza a assinatura e grava os ids. Só para o super admin
- [ ] `adm-asaas-webhook`: token obrigatório, idempotente por `adm.asaas_eventos`, trata os eventos da tabela
- [ ] `adm-asaas-registrar-webhook`
- [ ] Teste no sandbox: assinatura → `PAYMENT_CREATED` gera a fatura → pagamento simulado → fatura `paga` e empresa reativada
- [ ] Teste: webhook sem token ou com token errado → 403

## Fase 3: régua e avisos de cobrança

- [ ] `processar_regua` envia D-3, D+1, D+5, D+8 e D+11 conforme `adm.regua`, sem repetir (`adm.avisos_enviados`)
- [ ] Envio por WhatsApp (integração escolhida em P8) e por e-mail, com o link `invoice_url`
- [ ] Job pg_cron `adm-regua-diaria` às `5 3 * * *` (UTC), que equivale a 00:05 em Brasília
- [ ] Teste: rodar duas vezes no mesmo dia → nenhum aviso duplicado
- [ ] Teste: fatura com 11 dias de atraso → empresa `suspensa` e evento gravado

## Fase 4: painel (base e telas de cobrança)

- [ ] Client Supabase apontando para o ikvj (variáveis na Vercel e no `.env` local, fora do git)
- [ ] Design system do imobdocerias:
  - tokens de `styles.css` (`:root` e `.dark`) copiados do arquivo **atual** do imobdocerias;
  - fontes Fraunces e Plus Jakarta Sans;
  - utility `menu-ativo`.
- [ ] Ícones coloridos:
  - `@iconify/react` + `@iconify-json/fluent-color` + `@iconify-json/flat-color-icons` + `@iconify-json/logos` (as coleções só no build);
  - `scripts/gerar-icones.mjs` → `src/components/icones/icones.data.ts`;
  - `icone-colorido.tsx`.
- [ ] Menu do mockup v2:
  - registro único de menu no padrão `menuRegistry.ts` do imobatendimento;
  - grupos Menu principal, Gestão Comercial, Gestão Marketing e Configurações;
  - submenu com seta;
  - "Sair" no rodapé.
- [ ] Telas: Painel, Empresas, Ficha da empresa, Mensalidades, Sistemas e schemas, Régua de cobrança, Permissões por aplicativo
- [ ] Acesso ao painel só para super admin (`pa_sou_super_admin`). Os outros logins veem "Acesso bloqueado"
- [ ] Rotas e menus do CRM imobiliário copiado (empreendimentos, espelho, unidades, simulador, visitas, WhatsApp, relatórios de imóveis) retirados. Os componentes úteis (Kanban, calendário, formulários) ficam para a Fase 8
- [ ] `npm run build` sem erro e telas conferidas no navegador em 1366×768 e 390px

## Fase 5: banco `comercial` e entrada pelo site

- [ ] Migration `comercial_schema_tabelas`: as 12 tabelas, a semente das etapas, índices (whatsapp e email únicos parciais), RLS e policies
- [ ] Migration `comercial_funcoes`: `receber_lead`, `mover_etapa`, normalização de telefone e RPCs `public.com_*`
- [ ] Edge `leads-entrada`: chave do site (comparada pelo hash), Turnstile, limite por IP, idempotência e resposta `{ok}`
- [ ] Gatilho em `public.saas_leads` → `comercial.receber_lead` (a ponte enquanto o site não muda)
- [ ] Boas-vindas no WhatsApp com o link `/agendar/<token>` (o link funciona a partir da Fase 7; até lá, só a mensagem)
- [ ] Teste: o mesmo lead enviado 2 vezes → 1 contato, 1 negócio e 1 anotação `lead_repetido`
- [ ] Teste: chave errada ou sem Turnstile → 401, nada gravado
- [ ] Carga: `saas_leads` importada com origem `importado`, sem disparar WhatsApp

## Fase 6: Facebook e Instagram

- [ ] Telas Fonte de leads › Facebook e Instagram, LinkedIn e TikTok (estas duas com Conectar desligado), copiadas do imobatendimento
- [ ] Fluxo de conexão: login do Facebook → token longo → escolha da página → `subscribed_apps` (leadgen) → token no Vault
- [ ] Lista de formulários da página, com o sistema de cada um e o liga/desliga
- [ ] Edge `meta-leadgen-webhook`: `hub.challenge`, HMAC `X-Hub-Signature-256`, busca do lead, origem `facebook` ou `instagram` pelo `platform`, `receber_lead`
- [ ] Token inválido → selo na tela e evento
- [ ] Teste com a ferramenta de teste de Lead Ads da Meta → lead no funil com a origem certa
- [ ] Teste: assinatura HMAC errada → 403, nada gravado

## Fase 7: Google Agenda e agendamento automático

- [ ] Tela Configurações › Google Agenda: conectar e desconectar a agenda por vendedor (OAuth, refresh token no Vault) e regras da `config_agenda`
- [ ] Edge `agenda-horarios`: token de agenda válido → horários livres (freeBusy + regras + reuniões marcadas)
- [ ] Edge `agenda-marcar`:
  - rechecagem com trava → `events.insert` com Meet e convite;
  - `comercial.reunioes`;
  - card em "Reunião agendada";
  - confirmação no WhatsApp.
- [ ] Página pública `/agendar/$token` (sem login), no layout do mockup, com remarcar e cancelar
- [ ] pg_cron de lembretes (24 h e 1 h) a cada 5 min, sem repetir
- [ ] Distribuição rodízio / primeiro livre
- [ ] Teste: dois leads escolhendo o mesmo horário ao mesmo tempo → só um marca, o outro recebe novas opções
- [ ] Teste: horário ocupado direto no Google some da página

## Fase 8: Gestão Comercial (telas) e Ganho → cliente

- [ ] Leads & Contatos: lista com KPIs, filtros por origem, ficha do contato, importar CSV e novo contato
- [ ] Funil de Vendas: Kanban arrastável, filtro por sistema, configurar etapas, motivo da perda obrigatório em "Perdido"
- [ ] Agendamentos: semana e mês com as reuniões e os horários ocupados do Google, cores lead / equipe / ocupado, nova reunião pela equipe (cria no Google)
- [ ] Relatórios Comerciais: conversão por fonte (leads → reunião → ganho → receita nova) e funil do mês, com exportação
- [ ] "Ganho" → `adm.criar_empresa_do_negocio` + `adm-asaas-cliente-assinatura`, pedindo na hora o CNPJ, o plano e o dia de vencimento
- [ ] Contato que fica 24 h sem marcar reunião → atividade de follow-up para o vendedor
- [ ] Teste ponta a ponta no sandbox: lead do site → marca a reunião → Ganho → empresa + assinatura Asaas criadas

## Fase 9: bloqueio nos sistemas

Para cada sistema: ImobDoces, ImobSystem, Imobenviomassa e ImobDesk.

- [ ] Módulo `empresaLiberada.ts` chamando `public.empresa_liberada` nos 4 momentos. **Só `liberada === false` bloqueia**
- [ ] Faixa amarela de atraso (dono e gestores) com "Pagar agora"
- [ ] Pop-up "Sistema suspenso" no padrão "Acesso bloqueado"
- [ ] Trava no banco:
  - `imobdoces.membro_da_loja` checa `adm.empresa_liberada_ref`;
  - a função de RLS do ImobSystem por `imobiliaria_id` faz a mesma checagem.
- [ ] Teste por sistema: suspensa → pop-up e API negada; paga → volta sem novo login

## Fase 10: carga inicial

- [ ] Empresas a partir de `imobdoces.lojas`, `public.imobiliarias` e dos demais apps (CNPJ à mão onde faltar)
- [ ] Vínculos (app + schema_ref ou tenant_ref) com plano e valor
- [ ] Conta da casa (WSA) como `cortesia`
- [ ] Assinaturas Asaas das empresas pagantes, com o primeiro vencimento combinado
- [ ] Conferência: total das assinaturas no Asaas = receita mensal no Painel

## Fase 11: produção

- [ ] Asaas em produção (chave, `ASAAS_ENVIRONMENT=production`, webhook registrado de novo)
- [ ] App da Meta em modo **Live**, com as permissões aprovadas e a página da WSA conectada
- [ ] App do Google publicado (fora do modo de teste) e agendas conectadas
- [ ] Formulário do www.imobsystems.com.br trocado para `leads-entrada`. A ponte da `saas_leads` continua ligada
- [ ] Deploy do imobadmwsa na Vercel (projeto vinculado, variáveis sem espaço no valor)
- [ ] Deploy dos sistemas com o bloqueio (Fase 9)
- [ ] Teste real:
  - lead pelo site e por um anúncio, que marca a reunião e recebe o convite;
  - Ganho → assinatura;
  - empresa de teste: venceu → aviso → suspensão → pagamento → reativação.

---

## Prompt de execução

> Copie e cole numa sessão do Claude Code aberta em `C:\Vs_code\imobadmwsa`, trocando `<N>` pelo número da fase.

```
Contexto: painel ImobAdm WSA (imobadmwsa, TanStack Start + Supabase central ikvjaowvpvxojvcfwnct).
Duas partes:
(1) COBRANÇA: controla, por EMPRESA, o acesso a todos os sistemas WSA conforme a mensalidade no
Asaas. No 11º dia de atraso (00:05 BRT) a empresa é suspensa e todos os sistemas dela saem do ar;
ao pagar, volta na hora.
(2) COMERCIAL: leads do site www.imobsystems.com.br, do Instagram e do Facebook (Lead Ads) entram
num funil B2B; o lead recebe no WhatsApp um link e marca sozinho a reunião no Google Agenda (com
Meet); "Ganho" no funil cria a empresa e a assinatura Asaas.

Fonte da verdade: docs/plano-cobranca-por-empresa-asaas.md (modelo de dados, integrações, fases e
checklists) e o mockup aprovado docs/mockups/admin-completo-v2.html.

Execute SOMENTE a Fase <N>. Regras:
- Migrations só aditivas (sem drop, sem alter destrutivo), uma por assunto.
- Schemas adm e comercial NÃO expostos; acesso por funções em public (security definer,
  search_path fixo, revoke de public/anon, grant só a quem precisa).
- RPCs do painel checam public.pa_sou_super_admin() na primeira linha.
- Edge Functions públicas validam a origem: Asaas (header asaas-access-token), Meta
  (X-Hub-Signature-256 HMAC + hub.challenge), site (chave por hash + Turnstile + limite por IP),
  agenda (token com validade). Todas idempotentes.
- Tokens de Meta, Google e Asaas só em secrets ou no Supabase Vault. Nunca em código, tabela aberta,
  commit, log ou nota.
- Nos sites, só liberada === false bloqueia; erro ou falta de rede deixam entrar.
- Reaproveite:
  * imobdocerias (G:\Meu Drive\PESSOAL\Imobsystem\DOCERIA\imobdocerias): supabase/functions/
    create-asaas-payment, asaas-register-webhook, asaas-webhook, src/styles.css,
    scripts/gerar-icones.mjs, src/components/icones/*.
  * imobatendimento (G:\Meu Drive\PESSOAL\VSCODE\Outros\imobatendimento): src/config/menuRegistry.ts,
    src/components/Sidebar.tsx (submenus), src/features/fontes-leads/*, src/features/entrada/*,
    telas de Leads & Contatos, Funil, Agendamentos e Relatórios Comerciais; Google OAuth
    (src/pages/GoogleOAuthCallback.tsx).
    O funil aqui é B2B (venda dos sistemas WSA), com as etapas do plano.
- Não faça push na main (ela sincroniza com o Lovable). Trabalhe na branch feat/cobranca-empresas.
- Ao terminar, devolva o checklist da fase marcando cada item como FEITO ou NÃO FEITO
  (sem "parcial"), com a evidência de cada FEITO (comando, teste ou print).
```
