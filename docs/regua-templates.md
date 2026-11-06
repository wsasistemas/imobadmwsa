# Régua de cobrança: templates e secrets

A régua roda todo dia às **00:05 (Brasília)** pelo job `adm-regua-diaria`:
1. recalcula a situação de todas as empresas (quem passou de 10 dias de atraso é suspensa);
2. chama a Edge Function `adm-regua-enviar`, que manda os avisos do dia.

Cada aviso (fatura × passo × canal) sai **uma vez só**. Se o envio falhar, ele é tentado de novo
no dia seguinte (cada passo tem 3 dias de janela). Canal sem secret configurado é simplesmente pulado.

## Secrets no Supabase (Edge Functions → Secrets)

| Secret | Para quê |
|---|---|
| `ADM_WHATSAPP_TOKEN` | Token permanente do usuário do sistema na Meta (WhatsApp Cloud API) |
| `ADM_WHATSAPP_PHONE_ID` | Phone number ID do número que envia (Meta → WhatsApp → Configuração da API) |
| `ADM_RESEND_API_KEY` | Chave da conta Resend |
| `ADM_EMAIL_REMETENTE` | Ex.: `WSA Sistemas <financeiro@imobsystems.com.br>` (domínio verificado no Resend) |

## Templates do WhatsApp (Meta → Gerenciador do WhatsApp → Modelos de mensagem)

Categoria **Utilidade**, idioma **Português (BR)**. Os nomes precisam ser exatamente estes.

### `adm_cobranca_lembrete` (D-3)
```
Olá, {{1}}! Passando para lembrar que a mensalidade dos sistemas WSA, no valor de {{2}}, vence em {{3}}.
Você pode pagar por PIX, boleto ou cartão neste link: {{4}}
```

### `adm_cobranca_atraso` (D+1 e D+5)
```
Olá, {{1}}. A mensalidade dos sistemas WSA, no valor de {{2}}, venceu em {{3}} e ainda não identificamos o pagamento.
Para regularizar, use este link: {{4}}
Se já pagou, desconsidere esta mensagem.
```

### `adm_cobranca_suspensao_aviso` (D+8)
```
{{1}}, a mensalidade de {{2}} vencida em {{3}} continua em aberto.
Para evitar a suspensão do acesso aos sistemas em {{5}}, faça o pagamento por este link: {{4}}
```

### `adm_cobranca_suspensa` (D+11, desligado por padrão)
```
{{1}}, o acesso aos sistemas WSA foi suspenso porque a mensalidade de {{2}}, vencida em {{3}}, não foi paga.
Assim que o pagamento for confirmado, o acesso volta na hora: {{4}}
```

Parâmetros: `{{1}}` nome da empresa, `{{2}}` valor (R$), `{{3}}` vencimento, `{{4}}` link da fatura
do Asaas, `{{5}}` data da suspensão.

## Passos (tela "Régua de cobrança")

| Passo | Quando | Canais |
|---|---|---|
| d-3 | 3 dias antes do vencimento | WhatsApp e e-mail |
| d+1 | 1 dia de atraso | WhatsApp |
| d+5 | 5 dias de atraso | WhatsApp |
| d+8 | 8 dias de atraso | WhatsApp e e-mail |
| d+11 | suspensão | WhatsApp (desligado) |

Não recebem aviso: empresa em cortesia ou cancelada, fatura paga, empresa com prazo extra vigente
(menos o D-3) e empresa sem WhatsApp ou e-mail financeiro cadastrado.

## Template de boas-vindas ao lead (Fase 5)

### `boas_vindas_lead` (categoria Marketing ou Utilidade, Português BR)
```
Olá, {{1}}! Aqui é da WSA Sistemas. Recebemos o seu contato e queremos entender o que você precisa.
Escolha o melhor horário para uma conversa rápida (vídeo, 30 min): {{2}}
```
`{{1}}` primeiro nome, `{{2}}` link de agendamento (`<ADM_AGENDA_URL>/agendar/<token>`; a página chega na Fase 7).
Secret opcional `ADM_AGENDA_URL`: endereço público do painel (padrão `https://imobwsa.vercel.app`).
