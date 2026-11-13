// Atendimento ONLINE: monta o prompt da Sophia a partir da configuração, da Base de conhecimento e das respostas
// prontas (public.com_srv_atend_contexto) e chama a IA. Usado pelo simulador e pelo robô do WhatsApp.
// As regras que não podem depender da IA são aplicadas aqui no código (aplicarRegras).
// Secrets: LOVABLE_API_KEY; opcional ADM_IA_MODELO (padrão google/gemini-2.5-flash).

type Json = Record<string, unknown>;
type Faixa = [string, string] | null;

export interface Contexto {
  config: {
    agente_nome: string; empresa_nome: string; tom: string; emojis: string; objetivo: string;
    roteiro: { titulo: string; descricao: string; obrigatorio: boolean }[];
    passar_consultor: Record<string, boolean>; regras_extras: string; tamanho_resposta: string;
    bv_texto: string; bv_botoes: string[]; horario_consultores: { seg_sex: Faixa; sab: Faixa; dom: Faixa }; msg_fora_horario: string;
  };
  sistemas: {
    app: string | null; nome: string; segmento: string; pagina_url: string | null; apresentacao: string; texto_material: string;
    para_quem: string; nao_para_quem: string; funcionalidades: { titulo: string; descricao: string; status: string }[];
  }[];
  respostas: { categoria: string; pergunta: string; resposta: string }[];
}

export interface Lead { nome: string; empresa?: string; temperatura: string; pontuacao: number; sistemas: string[] }

export interface Decisao {
  resposta: string; botoes: string[];
  acoes: {
    regra: string | null; resposta_pronta: string | null; sistema_indicado: string | null; enviar_pagina: boolean; oferecer_agenda: boolean;
    passar_consultor: boolean; motivo_consultor: string | null; temperatura: number; etapa: string | null; passo_roteiro: number | null;
  };
}

// Regras fixas: valem sempre, não aparecem para edição (o painel só mostra).
export const REGRAS_FIXAS = [
  "Fale só dos sistemas da Base de conhecimento e do site www.imobsystems.com.br.",
  "Nunca invente preço, desconto, prazo, funcionalidade nem integração. Se não está na Base, diga que o consultor confirma.",
  "Funcionalidade marcada como \"em validação\" não está pronta: diga que está em validação e não prometa data.",
  "Se o lead pedir para sair (PARAR, SAIR, NÃO QUERO), agradeça e encerre na hora.",
  "Nunca peça senha, cartão, CPF ou documento.",
];

const TOM: Record<string, string> = {
  consultivo: "consultivo e próximo, como um especialista que quer ajudar",
  formal: "formal e respeitoso",
  descontraido: "leve e descontraído, sem perder o profissionalismo",
};

const PASSAR: Record<string, string> = {
  pedido_humano: "o lead pedir para falar com uma pessoa",
  preco: "o lead perguntar preço fechado, desconto ou contrato",
  temperatura_80: "a nota do lead chegar a 80 ou mais",
  nao_entendeu_2: "você não entender o lead 2 vezes seguidas",
  cliente_atual: "o lead disser que já é cliente da WSA",
};

const primeiro = (nome: string) => (nome || "").trim().split(/\s+/)[0] || "";

export function nomesDosSistemas(ctx: Contexto, apps: string[]): string {
  const nomes = apps.map((a) => ctx.sistemas.find((s) => s.app === a)?.nome).filter(Boolean) as string[];
  if (nomes.length === 0) return "nossos sistemas";
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Texto da boas-vindas com as variáveis trocadas (o envio real usa o modelo aprovado na Meta). */
export function boasVindas(ctx: Contexto, lead: Lead): string {
  return ctx.config.bv_texto
    .replaceAll("{{nome}}", primeiro(lead.nome) || "tudo bem")
    .replaceAll("{{sistemas}}", nomesDosSistemas(ctx, lead.sistemas));
}

export function montarPrompt(ctx: Contexto, lead: Lead, foraDoHorario: boolean, agenda = ""): string {
  const c = ctx.config;
  const roteiro = c.roteiro.map((p, i) => `${i + 1}. ${p.titulo}${p.obrigatorio ? " (obrigatório)" : " (opcional)"}: ${p.descricao}`).join("\n");
  const passar = Object.entries(c.passar_consultor).filter(([, v]) => v).map(([k]) => `- ${PASSAR[k] ?? k}`).join("\n");
  const base = ctx.sistemas.map((s) => [
    `### ${s.nome}${s.app ? ` (código: ${s.app})` : ""}`,
    `Segmento: ${s.segmento}`,
    s.para_quem ? `É para: ${s.para_quem}` : "",
    s.nao_para_quem ? `Não é para: ${s.nao_para_quem}` : "",
    `Apresentação: ${s.apresentacao}`,
    s.pagina_url ? `Página: ${s.pagina_url}` : "",
    "Funcionalidades:",
    ...s.funcionalidades.map((f) => `- ${f.titulo}: ${f.descricao}${f.status === "em_validacao" ? " [EM VALIDAÇÃO: não está pronta]" : ""}`),
  ].filter(Boolean).join("\n")).join("\n\n");
  const prontas = ctx.respostas.map((r, i) => `${i + 1}. Pergunta: ${r.pergunta}\n   Resposta: ${r.resposta}`).join("\n");
  const tamanho = c.tamanho_resposta === "media" ? "no máximo 5 frases" : "no máximo 3 frases curtas (até uns 350 caracteres)";

  return `Você é ${c.agente_nome}, atendente virtual da ${c.empresa_nome}, conversando pelo WhatsApp em português do Brasil.
Tom: ${TOM[c.tom] ?? TOM.consultivo}. ${c.emojis === "nenhum" ? "Não use emojis." : "Use no máximo 1 emoji por mensagem, e nem sempre."}
Responda com ${tamanho}. Uma pergunta por vez.

OBJETIVO
${c.objetivo}

ROTEIRO (siga a ordem; não pule passo obrigatório; se o lead já respondeu algo, não pergunte de novo)
${roteiro}

PASSE PARA UM CONSULTOR QUANDO
${passar || "- (nenhuma regra marcada)"}
${foraDoHorario ? `\nAGORA OS CONSULTORES ESTÃO FORA DO HORÁRIO. Se precisar passar para um consultor, avise com esta ideia: "${c.msg_fora_horario}"` : ""}

REGRAS FIXAS (valem sempre)
${REGRAS_FIXAS.map((r) => `- ${r}`).join("\n")}
${c.regras_extras.trim() ? `\nREGRAS DA EQUIPE\n${c.regras_extras.trim()}` : ""}

RESPOSTAS PRONTAS (se a pergunta do lead tiver o mesmo sentido de uma destas, use o número dela em "resposta_pronta")
${prontas || "(nenhuma)"}

BASE DE CONHECIMENTO (os únicos sistemas que você pode indicar)
${base}

LEAD
Nome: ${lead.nome}${lead.empresa ? ` · Empresa: ${lead.empresa}` : ""}
Interesse marcado no cadastro: ${nomesDosSistemas(ctx, lead.sistemas)}
Nota atual: ${lead.pontuacao} (${lead.temperatura})

AGENDAMENTO DA DEMONSTRAÇÃO
- Quem marca é o sistema, com os horários livres do Google Agenda. Você NUNCA escreve horários, datas nem links de agendamento.
- Quando o lead aceitar ver o sistema, pedir para marcar ou perguntar horários: responda curto (ex.: "Ótimo! Vou te mostrar
  os horários livres.") e marque "oferecer_agenda": true. O sistema envia as opções numeradas logo abaixo da sua mensagem.
- Nunca escreva links que não estejam na Base de conhecimento.${agenda ? `\n- Situação agora: ${agenda}` : ""}

FORMATO DA SAÍDA: responda SOMENTE um JSON, sem texto fora dele:
{"resposta": "mensagem para o WhatsApp",
 "botoes": ["até 3 opções curtas de resposta, ou lista vazia"],
 "regra": "qual passo do roteiro ou regra guiou esta resposta",
 "resposta_pronta": número da resposta pronta usada ou null,
 "sistema_indicado": "código do sistema indicado nesta mensagem" ou null,
 "enviar_pagina": true se é hora de mandar a página do sistema indicado,
 "oferecer_agenda": true quando o lead quer marcar a demonstração ou ver horários (o sistema mostra os horários),
 "passar_consultor": true ou false,
 "motivo_consultor": "por quê" ou null,
 "temperatura": nota de 0 a 100 do lead depois desta mensagem,
 "etapa": "qualificacao" quando o lead começou a responder o roteiro, "reuniao_agendada" só quando ele confirmou um horário, ou null,
 "passo_roteiro": número do passo do roteiro em que a conversa está}`;
}

const TIMEOUT_MS = 25_000;

/** Chama a IA (gateway da Lovable, compatível com OpenAI) e devolve o JSON da resposta. */
export async function chamarIA(sistema: string, mensagens: { autor: "lead" | "robo"; texto: string }[]): Promise<Json> {
  const chave = (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();
  if (!chave) throw new Error("Falta o secret LOVABLE_API_KEY no Supabase.");
  const modelo = (Deno.env.get("ADM_IA_MODELO") ?? "").trim() || "google/gemini-2.5-flash";
  const messages = [{ role: "system", content: sistema }, ...mensagens.map((m) => ({ role: m.autor === "lead" ? "user" : "assistant", content: m.texto }))];

  const pedir = async (comFormato: boolean) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        // Folga de tokens: modelos com raciocínio interno gastam parte do limite antes de escrever (resposta cortada = JSON quebrado).
        body: JSON.stringify({ model: modelo, messages, temperature: 0.3, max_tokens: 4000, ...(comFormato ? { response_format: { type: "json_object" } } : {}) }),
      });
    } catch {
      throw new Error("A IA não respondeu a tempo. Tente de novo.");
    } finally {
      clearTimeout(t);
    }
  };

  let res = await pedir(true);
  if (res.status === 400) res = await pedir(false);
  if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente de novo em instantes.");
  if (res.status === 402) throw new Error("Os créditos da IA acabaram.");
  if (!res.ok) throw new Error(`A IA recusou o pedido (${res.status}).`);
  const corpo = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[] } | null;
  const texto = String(corpo?.choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  return lerJsonDaIA(texto);
}

/** JSON da IA; se vier cortado ou fora do formato, salva o que der e nunca devolve JSON cru para o lead. */
export function lerJsonDaIA(texto: string): Json {
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  try {
    return JSON.parse(ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : texto) as Json;
  } catch {
    if (ini < 0) return { resposta: texto.slice(0, 1200) };
    // JSON cortado: aproveita os campos que chegaram inteiros.
    const campo = (nome: string) => {
      const m = new RegExp(`"${nome}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(texto);
      if (!m) return null;
      try { return JSON.parse(`"${m[1]}"`) as string; } catch { return m[1]; }
    };
    const booleano = (nome: string) => new RegExp(`"${nome}"\\s*:\\s*true`).test(texto);
    const resposta = campo("resposta") ?? (/"resposta"\s*:\s*"((?:[^"\\]|\\.)*)$/.exec(texto)?.[1]?.replace(/\\n/g, "\n").replace(/\s+\S*$/, "") ?? "");
    return {
      resposta: resposta || null, regra: campo("regra"), sistema_indicado: campo("sistema_indicado"),
      oferecer_agenda: booleano("oferecer_agenda"), passar_consultor: booleano("passar_consultor"), enviar_pagina: booleano("enviar_pagina"),
    };
  }
}

const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : padrao);
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Normaliza a saída da IA e aplica as regras que não podem depender dela. */
export function aplicarRegras(ctx: Contexto, lead: Lead, bruto: Json, linkAgenda: string): Decisao {
  let resposta = txt(bruto.resposta) ?? "Desculpe, não entendi. Pode me contar de outro jeito?";
  const botoes = (Array.isArray(bruto.botoes) ? bruto.botoes : []).map((b) => String(b).trim().slice(0, 20)).filter(Boolean).slice(0, 3);
  let temperatura = Math.max(0, Math.min(100, Math.round(num(bruto.temperatura, lead.pontuacao))));

  // Resposta pronta: vai palavra por palavra.
  const iPronta = num(bruto.resposta_pronta, 0);
  const pronta = iPronta >= 1 ? ctx.respostas[iPronta - 1] : undefined;
  if (pronta) resposta = pronta.resposta;

  // Sistema indicado precisa existir na Base ativa.
  const sistema = ctx.sistemas.find((s) => s.app && s.app === txt(bruto.sistema_indicado)) ?? null;
  const enviarPagina = bruto.enviar_pagina === true && !!sistema?.pagina_url;
  if (enviarPagina && sistema?.pagina_url && !resposta.includes(sistema.pagina_url)) resposta += `\n\n${sistema.pagina_url}`;

  const oferecerAgenda = bruto.oferecer_agenda === true;
  if (oferecerAgenda && linkAgenda && !resposta.includes(linkAgenda)) resposta += `\n\nEscolha o melhor horário aqui: ${linkAgenda}`;

  let passar = bruto.passar_consultor === true;
  let motivo = txt(bruto.motivo_consultor);
  if (!passar && ctx.config.passar_consultor.temperatura_80 && temperatura >= 80) { passar = true; motivo = "Nota chegou a 80"; }
  if (pronta?.categoria === "preco" && ctx.config.passar_consultor.preco) { passar = true; motivo = motivo ?? "Perguntou preço"; }

  const etapaIA = txt(bruto.etapa);
  const etapa = etapaIA === "qualificacao" || etapaIA === "reuniao_agendada" ? etapaIA : null;
  if (temperatura < lead.pontuacao - 15) temperatura = lead.pontuacao - 15; // a nota não despenca numa mensagem só

  return {
    resposta: resposta.slice(0, 1500),
    botoes,
    acoes: {
      regra: txt(bruto.regra), resposta_pronta: pronta ? pronta.pergunta : null, sistema_indicado: sistema?.app ?? null,
      enviar_pagina: enviarPagina, oferecer_agenda: oferecerAgenda, passar_consultor: passar, motivo_consultor: passar ? motivo : null,
      temperatura, etapa, passo_roteiro: bruto.passo_roteiro == null ? null : Math.round(num(bruto.passo_roteiro, 0)) || null,
    },
  };
}
