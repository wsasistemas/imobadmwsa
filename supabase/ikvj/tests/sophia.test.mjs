const { aplicarRegras, montarPrompt, boasVindas } = await import(process.argv[2]);
let ok = 0, f = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("  ok   ", n); } else { f++; console.log("  FALHA", n, x); } };
const ctx = {
  config: { agente_nome: "Sophia", empresa_nome: "WSA Sistemas IA", tom: "consultivo", emojis: "poucos", objetivo: "Marcar demo.",
    roteiro: [{ titulo: "Segmento", descricao: "ramo", obrigatorio: true }], passar_consultor: { preco: true, temperatura_80: true, pedido_humano: true },
    regras_extras: "Não fale de concorrentes.", tamanho_resposta: "curta", bv_texto: "Olá, {{nome}}! Bem-vindo. Interesse: {{sistemas}}.", bv_botoes: ["Sim"],
    horario_consultores: { seg_sex: ["09:00", "18:00"], sab: null, dom: null }, msg_fora_horario: "Voltamos amanhã às 9h." },
  sistemas: [{ app: "suprimentos", nome: "ImobSuprimentos", segmento: "Construção", pagina_url: "https://www.imobsystems.com.br/produtos/imobsuprimentos", apresentacao: "Compras.", texto_material: "", para_quem: "Construtoras", nao_para_quem: "",
    funcionalidades: [{ titulo: "OCR", descricao: "nota", status: "em_validacao" }] },
    { app: "imobimoveis", nome: "Imobimoveis (CRM Imobiliário)", segmento: "Imob", pagina_url: null, apresentacao: "CRM.", texto_material: "", para_quem: "", nao_para_quem: "", funcionalidades: [] }],
  respostas: [{ categoria: "preco", pergunta: "Quanto custa?", resposta: "O valor depende do sistema." }, { categoria: "geral", pergunta: "Quem é?", resposta: "Somos a WSA." }],
};
const lead = { nome: "Iris Chacon", temperatura: "morno", pontuacao: 50, sistemas: ["imobimoveis", "suprimentos"] };
check("boas-vindas troca nome e sistemas", boasVindas(ctx, lead) === "Olá, Iris! Bem-vindo. Interesse: Imobimoveis (CRM Imobiliário) e ImobSuprimentos.");
const p = montarPrompt(ctx, lead, true);
check("prompt tem nome, regras fixas e regras da equipe", p.includes("Você é Sophia") && p.includes("Nunca invente preço") && p.includes("Não fale de concorrentes."));
check("prompt marca em validação", p.includes("[EM VALIDAÇÃO"));
check("prompt fora do horário usa a mensagem", p.includes("Voltamos amanhã às 9h."));
check("prompt sem regras desmarcadas", !p.includes("já é cliente"));
let d = aplicarRegras(ctx, lead, { resposta: "Custa X reais!", resposta_pronta: 1, temperatura: 60 }, "LINK");
check("resposta pronta palavra por palavra", d.resposta === "O valor depende do sistema.", d.resposta);
check("pergunta de preço passa para consultor", d.acoes.passar_consultor === true);
d = aplicarRegras(ctx, lead, { resposta: "Veja o ImobSuprimentos.", sistema_indicado: "suprimentos", enviar_pagina: true, oferecer_agenda: true, temperatura: 65 }, "LINK");
check("página do sistema anexada", d.resposta.includes("https://www.imobsystems.com.br/produtos/imobsuprimentos"));
check("link de agenda anexado", d.resposta.includes("LINK"));
d = aplicarRegras(ctx, lead, { resposta: "Ok", sistema_indicado: "naoexiste", enviar_pagina: true }, "LINK");
check("sistema fora da Base é ignorado", d.acoes.sistema_indicado === null && !d.acoes.enviar_pagina);
d = aplicarRegras(ctx, lead, { resposta: "Ótimo", temperatura: 85 }, "LINK");
check("nota 80 passa para consultor", d.acoes.passar_consultor && /80/.test(d.acoes.motivo_consultor));
d = aplicarRegras(ctx, lead, { resposta: "Hum", temperatura: 5 }, "LINK");
check("nota não despenca mais de 15", d.acoes.temperatura === 35, d.acoes.temperatura);
d = aplicarRegras(ctx, lead, { resposta: "x", etapa: "ganho", botoes: ["um botão com texto muito comprido demais", "b", "c", "d"] }, "LINK");
check("etapa inválida ignorada e botões limitados", d.acoes.etapa === null && d.botoes.length === 3 && d.botoes[0].length <= 20);
check("resposta vazia vira pedido de esclarecimento", aplicarRegras(ctx, lead, {}, "").resposta.includes("não entendi"));
console.log(`${ok} ok, ${f} falha(s)`); process.exit(f ? 1 : 0);
