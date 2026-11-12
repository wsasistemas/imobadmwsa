// Chamadas do painel. Tudo passa por RPCs public.adm_* / public.pa_* (SECURITY DEFINER, conferem o super admin)
// e pelas Edge Functions adm-* do ikvj. Os schemas adm e acessos não ficam expostos na API.
import { sb } from "./supabase";

export type Situacao = "em_dia" | "atraso" | "suspensa" | "cortesia" | "cancelada";
export type SituacaoFatura = "a_vencer" | "vencida" | "paga" | "cancelada" | "estornada";

export interface Painel {
  mrr: number; com_assinatura: number; em_dia: number; em_atraso: number; em_atraso_valor: number; suspensas: number;
  vao_suspender: { empresa_id: string; empresa: string; cnpj: string | null; dias_atraso: number; suspende_em: string; fatura_id: string; sistemas: string[] | null }[];
  receita_por_sistema: { app: string; nome: string; valor: number; empresas: number }[];
}

export interface EmpresaLista {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; dono_nome: string | null;
  situacao: Situacao; dias_atraso: number; suspende_em: string | null; mensalidade: number; dia_vencimento: number | null;
  sistemas: { app: string; ativo: boolean; bloqueado: boolean }[];
}

export interface Empresa {
  id: string; cnpj: string | null; razao_social: string; nome_fantasia: string | null; dono_nome: string | null;
  whatsapp: string | null; email_financeiro: string | null; modalidade: "pagante" | "cortesia" | "cancelada";
  situacao: Situacao; suspensa_manual: boolean; prazo_extra_ate: string | null; dia_vencimento: number | null;
  asaas_customer_id: string | null; asaas_subscription_id: string | null; observacoes: string | null; criado_em: string;
  comprador_nome: string | null; comprador_email: string | null; comprador_whatsapp: string | null; comprador_cargo: string | null;
  negocio_id: string | null;
}

export interface Vinculo {
  id: string; empresa_id: string; app: string; sistema: string; schema_ref: string | null; tenant_ref: string | null;
  ref: string; plano: string | null; valor_mensal: number; ativo: boolean; acesso_manual: "liberado" | "bloqueado" | null;
  liberado: boolean; criado_em: string;
}

export interface Fatura {
  id: string; empresa_id: string; competencia: string; vencimento: string; valor: number; situacao: SituacaoFatura;
  pago_em: string | null; forma: string | null; asaas_payment_id: string | null; invoice_url: string | null;
}

export interface Evento { id: number; tipo: string; detalhe: Record<string, unknown>; autor: string; criado_em: string; fatura_id: string | null }

export interface FichaEmpresa {
  empresa: Empresa;
  situacao: { situacao: Situacao; dias_atraso: number; suspende_em: string | null; fatura_id: string | null };
  vinculos: Vinculo[]; faturas: Fatura[]; eventos: Evento[];
}

export interface FaturaLista {
  id: string; empresa_id: string; empresa: string; competencia: string; vencimento: string; valor: number;
  situacao: SituacaoFatura; dias_atraso: number; pago_em: string | null; forma: string | null; invoice_url: string | null;
  empresa_liberada: boolean;
}

export interface Sistema {
  app: string; nome: string; url: string | null; tipo_ref: "schema" | "tenant"; descricao_ref: string | null; cobra: boolean;
  empresas: number; suspensas: number; ultima_verificacao_em: string | null; controle_ativo: boolean;
}

export interface Passo { passo: string; d: number; canais: ("whatsapp" | "email")[]; ativo: boolean }
export interface Regua { dias_tolerancia: number; reativar_automatico: boolean; passos: Passo[]; atualizado_em: string | null }

export interface AppAcesso {
  schema_name: string; nome: string; url: string | null; controle_ativo: boolean; padrao_novos: string;
  schema_dados: string; ultima_verificacao_em: string | null; liberados: number; bloqueados: number;
}
export interface LoginAcesso {
  user_id: string; email: string; ultimo_login: string | null; proprietario: boolean; tem_cadastro: boolean;
  decisao: boolean | null; efetivo: boolean;
}

export interface Fonte {
  id: string; tipo: "site" | "meta" | "linkedin" | "tiktok" | "manual" | "whatsapp"; nome: string; dominio: string | null;
  tem_chave: boolean; chave_prefixo: string | null; sistema_padrao: string | null; ativo: boolean;
  total_leads: number; ultimo_lead_em: string | null; criado_em: string;
}
export interface LeadRecebido {
  id: number; origem: string; recebido_em: string; erro: string | null; negocio_id: string | null; fonte: string | null;
  nome: string | null; whatsapp: string | null; email: string | null; empresa_nome: string | null; etapa: string | null;
  boas_vindas: "pendente" | "enviada" | "falhou" | "nao_enviar" | null; repetido: boolean | null;
}

export interface MetaConexao {
  id: string; page_id: string; page_nome: string | null; ig_usuario: string | null; token_valido: boolean; assinada: boolean;
  detalhe: string | null; verificado_em: string | null; ultimo_lead_em: string | null; total_leads: number; criado_em: string;
  formularios: { form_id: string; nome: string | null; situacao: string | null; sistema: string | null; ativo: boolean; total_leads: number }[];
}

/** Mensagem legível: a regra de negócio devolve a frase pronta em `message`. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message;
  return msg && !msg.startsWith("{") ? msg : "Não foi possível concluir a ação. Tente de novo.";
}

// ------------------------------------------------------------------ Comercial: leads, funil e classificação (Fase 8)
export type Temperatura = "quente" | "morno" | "frio";
export type OrigemLead = "site" | "instagram" | "facebook" | "linkedin" | "tiktok" | "manual" | "importado" | "whatsapp";

export interface CardNegocio {
  negocio_id: string; contato_id: string; nome: string; empresa: string | null; cargo: string | null;
  whatsapp: string | null; email: string | null; origem: OrigemLead; formulario: string | null; campanha: string | null;
  sistemas: string[]; valor: number | null; etapa: string; etapa_nome: string; etapa_cor: string;
  temperatura: Temperatura | null; pontuacao: number | null; proxima_acao: string | null; prazo_em: string | null;
  boas_vindas: string | null; motivo_perda: string | null; empresa_id: string | null; sem_resposta_24h: boolean;
  reuniao: { inicio: string; fim: string; situacao: string; meet_url: string | null } | null;
  criado_em: string; ultima_interacao: string | null;
}

export interface Motivo { motivo: string; pontos: number }

export interface FichaNegocio extends CardNegocio {
  classificacao: { pontos?: number; temperatura?: Temperatura; motivos?: Motivo[]; sistemas?: string[]; proxima_acao?: string; manual?: boolean };
  atividades: { id: number; tipo: string; texto: string; detalhe: Record<string, unknown> | null; autor: string | null; criado_em: string }[];
  recebidos: { id: number; origem: string; recebido_em: string; fonte: string | null; respostas: Record<string, unknown> }[];
}

export interface EtapaFunil {
  chave: string; nome: string; cor: string; final: boolean; ganho: boolean; total: number; valor: number; negocios: CardNegocio[];
}

export interface ResumoLeads {
  novos_30d: number; novos_30d_antes: number; site_30d: number; instagram_30d: number; facebook_30d: number;
  quentes_abertos: number; mornos_abertos: number; frios_abertos: number; sem_resposta_24h: number; reunioes_30d: number;
  por_origem: Record<string, number>; total: number;
}

export interface RegrasQualificacao {
  limites: { quente: number; morno: number };
  mover_quente: boolean;
  pontos: Record<"whatsapp" | "email_corporativo" | "empresa" | "cargo_decisor" | "sistema" | "urgencia" | "intencao" | "pesquisando", number>;
  cargos_decisores: string[]; palavras_urgencia: string[]; palavras_intencao: string[]; palavras_pesquisando: string[];
  emails_pessoais: string[]; sistemas: Record<string, string[]>;
}

export interface LinhaFonte { origem: string; leads: number; qualificados: number; reunioes: number; ganhos: number; perdidos: number; receita: number }
export interface Relatorio {
  periodo: { inicio: string; fim: string };
  totais: { leads: number; qualificados: number; reunioes: number; ganhos: number; perdidos: number; receita: number };
  por_fonte: LinhaFonte[];
  por_temperatura: { temperatura: string; leads: number; ganhos: number }[];
  por_etapa: { chave: string; nome: string; ordem: number; total: number }[];
  por_sistema: { sistema: string; leads: number; ganhos: number }[];
  motivos_perda: { motivo: string; total: number }[];
  por_semana: { semana: string; leads: number; ganhos: number }[];
  linhas: Record<string, string | number | null>[];
}

export interface Previa { pontos: number; temperatura: Temperatura; motivos: Motivo[]; sistemas: string[]; proxima_acao: string }

export interface PlataformaEmpresas {
  pode_criar: boolean; pode_listar: boolean; pode_liberar: boolean;
  empresas: { ref: string; nome: string; vinculada_a: string | null }[];
}

export interface AcessoComprador {
  vinculo_id: string; empresa_id: string; empresa: string; app: string; sistema: string; ref: string;
  comprador_nome: string | null; comprador_email: string | null; pago: boolean; ativo: boolean; disponivel: boolean; url_login: string | null;
  situacao: "enviando" | "enviado" | "falhou" | "primeiro_acesso" | null; login_novo: boolean | null;
  enviado_em: string | null; primeiro_acesso_em: string | null; erro: string | null;
}

export interface EtapaConfig { id: string; chave: string; nome: string; ordem: number; cor: string; final: boolean; de_fabrica: boolean; negocios: number }

export interface ConfigAgenda {
  duracao_min: number; intervalo_min: number; antecedencia_min: number; criar_meet: boolean; mover_card: boolean;
  horario: { dias: number[]; inicio: string; fim: string };
  lembretes: { h24: boolean; h1: boolean };
  distribuicao: "rodizio" | "primeiro_livre";
}

// Atendimento ONLINE ----------------------------------------------------------------------------
export type Faixa = [string, string] | null;
export interface Janela {
  seg_sex: Faixa;
  sab: Faixa;
  dom: Faixa;
}
export interface PassoRoteiro {
  titulo: string;
  descricao: string;
  obrigatorio: boolean;
}
export interface PassarConsultor {
  pedido_humano: boolean;
  preco: boolean;
  temperatura_80: boolean;
  nao_entendeu_2: boolean;
  cliente_atual: boolean;
}
export interface AtendConfig {
  ligado: boolean;
  agente_nome: string;
  empresa_nome: string;
  tom: "consultivo" | "formal" | "descontraido";
  emojis: "nenhum" | "poucos";
  objetivo: string;
  roteiro: PassoRoteiro[];
  passar_consultor: PassarConsultor;
  regras_extras: string;
  tamanho_resposta: "curta" | "media";
  retomar_horas: number;
  bv_temperaturas: Temperatura[];
  bv_etapas: string[];
  bv_modelo: string;
  bv_texto: string;
  bv_botoes: string[];
  bv_janela: Janela;
  bv_limite_dia: number;
  bv_intervalo: [number, number];
  bv_quando: "na_hora" | "diario_9h";
  horario_consultores: Janela;
  msg_fora_horario: string;
  consultor_espera_min: number;
  palavras_sair: string[];
  simulado_em: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}
export interface Funcionalidade {
  titulo: string;
  descricao: string;
  status: "disponivel" | "em_validacao";
}
export interface AtendSistema {
  id: string;
  app: string | null;
  nome: string;
  segmento: string;
  menu_nome: string;
  pagina_url: string | null;
  sistema_url: string | null;
  material_url: string | null;
  ativo: boolean;
  apresentacao: string;
  texto_material: string;
  para_quem: string;
  nao_para_quem: string;
  funcionalidades: Funcionalidade[];
  ordem: number;
}
export interface AtendResposta {
  id: string;
  categoria: "geral" | "preco" | "integracao" | "seguranca" | "implantacao";
  pergunta: string;
  resposta: string;
  ativo: boolean;
  ordem: number;
}
export interface AtendConsultor {
  vendedor_id: string;
  nome: string;
  email: string | null;
  na_fila: boolean;
  apps: string[];
  apto: boolean;
  ordem: number | null;
}
export interface AtendPainel {
  config: AtendConfig;
  sistemas: AtendSistema[];
  respostas: AtendResposta[];
  consultores: AtendConsultor[];
  apps: { app: string; nome: string }[];
  etapas: { chave: string; nome: string }[];
}
export interface AtendFilaLinha {
  negocio_id: string;
  nome: string | null;
  empresa: string | null;
  whatsapp: string | null;
  temperatura: Temperatura | null;
  pontuacao: number | null;
  etapa: string;
  sistemas: string[];
  grupo: "na_fila" | "conversa" | "fora";
  motivo: string | null;
  conversa: string | null;
  bv_enviada_em: string | null;
  respondeu: boolean;
}
export interface AtendFila {
  resumo: { na_fila: number; conversas: number; fora: number; sem_telefone: number };
  linhas: AtendFilaLinha[];
}
export interface SimulacaoPedido {
  mensagens: { autor: "lead" | "robo"; texto: string }[];
  lead: {
    nome: string;
    empresa?: string;
    temperatura: Temperatura;
    pontuacao: number;
    sistemas: string[];
  };
  fora_do_horario: boolean;
}
export type SituacaoConversa = "aguardando" | "robo" | "consultor" | "encerrada" | "saiu" | "falhou";
export interface AtendConversa {
  id: string; negocio_id: string; nome: string | null; empresa: string | null; whatsapp: string | null; temperatura: Temperatura | null;
  pontuacao: number | null; situacao: SituacaoConversa; origem: "boas_vindas" | "lead"; consultor: string | null; bv_erro: string | null;
  ultima_msg_em: string | null; ultima_msg_lead_em: string | null; ultima: { autor: string; texto: string } | null;
}
export interface AtendMensagem { id: number; autor: "lead" | "robo" | "consultor" | "sistema"; texto: string; detalhe: Record<string, unknown>; criado_em: string }
export interface AtendWhatsInfo { webhook_conectado: boolean; proximo_envio_em: string | null; na_janela: boolean; enviadas_hoje: number; limite_dia: number; falhas_hoje: number }
export interface AtendSessao { ok: boolean; configurado: boolean; webhook_url: string; erro?: string; sessao?: { ok: boolean; status: string | null; telefone: string | null; erro: string | null } }

export interface SimulacaoResposta {
  ok: true;
  resposta: string;
  botoes: string[];
  acoes: {
    regra: string | null;
    resposta_pronta: string | null;
    sistema_indicado: string | null;
    enviar_pagina: boolean;
    oferecer_agenda: boolean;
    passar_consultor: boolean;
    motivo_consultor: string | null;
    temperatura: number;
    etapa: string | null;
    passo_roteiro: number | null;
  };
  simulado: boolean;
}

export interface AgendaPainel {
  config: ConfigAgenda;
  agendas: { id: string; email: string; ativo: boolean; token_valido: boolean; detalhe: string | null; vendedor: string | null }[];
  vendedores: { id: string; nome: string; email: string | null }[];
}

export interface Reuniao {
  id: string; negocio_id: string; inicio: string; fim: string; situacao: string; origem: "lead" | "equipe";
  meet_url: string | null; lead: string | null; empresa: string | null; vendedor: string | null;
}

export interface PaginaAgenda {
  nome: string; duracao_min: number;
  minha: { id: string; inicio: string; fim: string; meet_url: string | null } | null;
  horarios: { inicio: string; fim: string }[];
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

async function edge<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    // O corpo do erro traz { erro } com a explicação (ex.: mensagem do Asaas).
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const b = await ctx.json().catch(() => null);
      if (b?.erro) throw new Error(b.erro);
    }
    throw error;
  }
  if (data && (data as { ok?: boolean }).ok === false) throw new Error((data as { erro?: string }).erro ?? "Falhou.");
  return data as T;
}

export const api = {
  souSuperAdmin: () => rpc<boolean>("pa_sou_super_admin"),
  painel: () => rpc<Painel>("adm_painel"),
  listarEmpresas: (situacao?: Situacao | null, busca?: string | null) =>
    rpc<EmpresaLista[]>("adm_listar_empresas", { p_situacao: situacao ?? null, p_busca: busca || null }),
  empresa: (id: string) => rpc<FichaEmpresa | null>("adm_empresa", { p_id: id }),
  salvarEmpresa: (p: Partial<Empresa> & { razao_social?: string }) => rpc<string>("adm_salvar_empresa", { p }),
  salvarVinculo: (p: Record<string, unknown>) => rpc<string>("adm_salvar_vinculo", { p }),
  plataformaEmpresas: (app: string) => rpc<PlataformaEmpresas>("adm_plataforma_empresas", { p_app: app }),
  vincularCriando: (p: { empresa_id: string; app: string; plano: string; valor_mensal: string }) => rpc<string>("adm_vincular_criando", { p }),
  empresaOrigem: (empresa: string, p: { negocio_id?: string; origem?: string; detalhe?: string }) => rpc<string>("adm_empresa_origem", { p_empresa: empresa, p }),
  excluirEmpresa: (empresa: string, confirmacao: string) => rpc<void>("adm_excluir_empresa", { p_empresa: empresa, p_confirmacao: confirmacao }),
  listarFaturas: (situacao?: string | null) => rpc<FaturaLista[]>("adm_listar_faturas", { p_situacao: situacao ?? null }),
  criarFatura: (empresa: string, competencia: string, vencimento: string, valor: number) =>
    rpc<string>("adm_criar_fatura", { p_empresa: empresa, p_competencia: competencia, p_vencimento: vencimento, p_valor: valor }),
  registrarPagamento: (fatura: string, forma: string) =>
    rpc<Situacao>("adm_registrar_pagamento", { p_fatura: fatura, p_forma: forma, p_pago_em: null }),
  concederPrazo: (empresa: string, ate: string | null, motivo: string) =>
    rpc<Situacao>("adm_conceder_prazo", { p_empresa: empresa, p_ate: ate, p_motivo: motivo || null }),
  suspender: (empresa: string, suspender: boolean, motivo: string) =>
    rpc<Situacao>("adm_suspender", { p_empresa: empresa, p_suspender: suspender, p_motivo: motivo || null }),
  listarSistemas: () => rpc<Sistema[]>("adm_listar_sistemas"),
  salvarSistema: (app: string, tipo: string, descricao: string, funcaoMembro: string | null, cobra: boolean) =>
    rpc<void>("adm_salvar_sistema", { p_app: app, p_tipo_ref: tipo, p_descricao_ref: descricao, p_funcao_membro: funcaoMembro, p_cobra: cobra }),
  empresasDoSistema: (app: string, busca?: string) =>
    rpc<{
      vinculo_id: string; empresa_id: string; empresa: string; cnpj: string | null; schema_ref: string | null;
      tenant_ref: string | null; plano: string | null; valor_mensal: number; ativo: boolean;
      acesso_manual: "liberado" | "bloqueado" | null; liberado: boolean; situacao: Situacao; dias_atraso: number;
      suspende_em: string | null; desde: string;
    }[]>("adm_empresas_do_sistema", { p_app: app, p_busca: busca || null }),
  // Comercial: fontes de lead (Fase 5)
  listarFontes: () => rpc<Fonte[]>("com_listar_fontes"),
  salvarFonte: (p: Partial<Fonte>) => rpc<string>("com_salvar_fonte", { p }),
  gerarChaveFonte: (fonte: string) => rpc<string>("com_gerar_chave_fonte", { p_fonte: fonte }),
  leadsRecebidos: (fonte?: string | null, limite = 50) => rpc<LeadRecebido[]>("com_leads_recebidos", { p_fonte: fonte ?? null, p_limite: limite }),
  // Comercial: Facebook e Instagram (Fase 6)
  metaConexoes: () => rpc<MetaConexao[]>("com_meta_conexoes"),
  metaFormularioSalvar: (form: string, sistema: string | null, ativo: boolean) =>
    rpc<void>("com_meta_formulario_salvar", { p_form_id: form, p_sistema: sistema, p_ativo: ativo }),
  metaSituacao: () => edge<{ configurado: boolean; webhook_configurado: boolean; webhook_url: string; retorno_url: string }>("adm-meta", { acao: "situacao" }),
  metaInicio: (retorno: string) => edge<{ url: string }>("adm-meta", { acao: "inicio", retorno }),
  metaPaginas: (sessao: string) =>
    edge<{ paginas: { id: string; nome: string; instagramNome: string | null; podeLeads: boolean }[] }>("adm-meta", { acao: "paginas", sessao }),
  metaConectar: (sessao: string, paginaId: string) =>
    edge<{ conexaoId: string; assinada: boolean; formularios: number | null }>("adm-meta", { acao: "conectar", sessao, paginaId }),
  metaFormularios: (conexaoId: string) => edge<{ formularios: number }>("adm-meta", { acao: "formularios", conexaoId }),
  metaVerificar: (conexaoId: string) => edge<{ valido: boolean; detalhe: string | null }>("adm-meta", { acao: "verificar", conexaoId }),
  metaDesconectar: (conexaoId: string) => edge<{ ok: boolean }>("adm-meta", { acao: "desconectar", conexaoId }),
  // Comercial: Google Agenda e agendamentos (Fase 7)
  agendaPainel: () => rpc<AgendaPainel>("com_agenda_painel"),
  agendaConfigSalvar: (p: ConfigAgenda) => rpc<void>("com_agenda_config_salvar", { p }),
  reunioes: (de: string, ate: string) => rpc<Reuniao[]>("com_reunioes", { p_de: de, p_ate: ate }),
  reuniaoSituacao: (id: string, situacao: string) => rpc<void>("com_reuniao_situacao", { p_reuniao: id, p_situacao: situacao }),

  // Comercial: Atendimento ONLINE (robô Sophia no WhatsApp)
  atendPainel: () => rpc<AtendPainel>("com_atend_painel"),
  atendConfigSalvar: (p: Partial<AtendConfig>) => rpc<void>("com_atend_config_salvar", { p }),
  atendLigar: (ligado: boolean) => rpc<void>("com_atend_ligar", { p_ligado: ligado }),
  atendSistemaSalvar: (p: Partial<AtendSistema>) => rpc<string>("com_atend_sistema_salvar", { p }),
  atendSistemaExcluir: (id: string) => rpc<void>("com_atend_sistema_excluir", { p_id: id }),
  atendRespostaSalvar: (p: Partial<AtendResposta>) =>
    rpc<string>("com_atend_resposta_salvar", { p }),
  atendRespostaExcluir: (id: string) => rpc<void>("com_atend_resposta_excluir", { p_id: id }),
  atendConsultoresSalvar: (lista: { vendedor_id: string; apps: string[]; apto: boolean }[]) =>
    rpc<void>("com_atend_consultores_salvar", { p: lista }),
  atendFila: () => rpc<AtendFila>("com_atend_fila"),
  atendSimular: (body: SimulacaoPedido) =>
    edge<SimulacaoResposta>("atend-simulador", body as unknown as Record<string, unknown>),
  atendConversas: (busca?: string) => rpc<AtendConversa[]>("com_atend_conversas", { p_busca: busca || null }),
  atendMensagens: (conversa: string) => rpc<AtendMensagem[]>("com_atend_mensagens", { p_conversa: conversa }),
  atendAssumir: (conversa: string, assumir: boolean) => rpc<void>("com_atend_assumir", { p_conversa: conversa, p_assumir: assumir }),
  atendWhatsInfo: () => rpc<AtendWhatsInfo>("com_atend_whatsapp_info"),
  atendSessao: () => edge<AtendSessao>("atend-painel", { acao: "situacao" }),
  atendConectarWebhook: () => edge<{ ok: true; webhook_id: string }>("atend-painel", { acao: "conectar_webhook" }),
  atendEnviar: (conversa: string, texto: string) => edge<{ ok: true }>("atend-painel", { acao: "enviar", conversa_id: conversa, texto }),
  atendTeste: (telefone: string) => edge<{ ok: true }>("atend-painel", { acao: "teste", telefone }),
  googleSituacao: () => edge<{ configurado: boolean; retorno_url: string }>("adm-google", { acao: "situacao" }),
  googleInicio: (retorno: string, vendedor: string | null) => edge<{ url: string }>("adm-google", { acao: "inicio", retorno, vendedor }),
  googleDesconectar: (agendaId: string) => edge<{ ok: boolean }>("adm-google", { acao: "desconectar", agendaId }),
  googleOcupados: (de: string, ate: string) =>
    edge<{ ocupados: { inicio: string; fim: string; agenda: string }[] }>("adm-google", { acao: "ocupados", de, ate }),
  googleNovaReuniao: (negocioId: string, inicio: string, titulo: string, email: string | null) =>
    edge<{ reuniao_id: string; meet_url: string | null }>("adm-google", { acao: "nova_reuniao", negocioId, inicio, titulo, email }),
  agendaHorarios: (token: string) => edge<PaginaAgenda>("agenda-horarios", { token }),
  agendaMarcar: (token: string, acao: "marcar" | "remarcar" | "cancelar", inicio?: string) =>
    edge<{ ok: boolean }>("agenda-marcar", { token, acao, inicio }),
  // Acesso do comprador
  salvarComprador: (empresa: string, p: Record<string, string>) => rpc<void>("adm_salvar_comprador", { p_empresa: empresa, p }),
  acessosComprador: (empresa?: string | null, app?: string | null) => rpc<AcessoComprador[]>("adm_acessos_comprador", { p_empresa: empresa ?? null, p_app: app ?? null }),
  liberarAcesso: (vinculoId: string, semPagamento: boolean) => edge<{ email: string; login_novo: boolean }>("adm-liberar-acesso", { vinculoId, semPagamento }),
  // Comercial: etapas do funil
  etapas: () => rpc<EtapaConfig[]>("com_etapas"),
  etapaSalvar: (p: { id?: string; nome: string; cor: string }) => rpc<string>("com_etapa_salvar", { p }),
  etapaMover: (id: string, direcao: number) => rpc<void>("com_etapa_mover", { p_etapa: id, p_direcao: direcao }),
  etapaExcluir: (id: string) => rpc<void>("com_etapa_excluir", { p_etapa: id }),
  // Comercial: leads, funil e classificação (Fase 8)
  leads: (origem?: string | null, temperatura?: string | null, busca?: string | null) =>
    rpc<CardNegocio[]>("com_leads", { p_origem: origem ?? null, p_temperatura: temperatura ?? null, p_busca: busca || null, p_limite: 500 }),
  resumoLeads: () => rpc<ResumoLeads>("com_leads_resumo"),
  funil: (sistema?: string | null) => rpc<EtapaFunil[]>("com_funil", { p_sistema: sistema ?? null }),
  negocio: (id: string) => rpc<FichaNegocio | null>("com_negocio", { p_id: id }),
  moverEtapa: (negocio: string, etapa: string, motivo?: string | null) =>
    rpc<{ ok: boolean; etapa: string; empresa_id: string | null }>("com_mover_etapa", { p_negocio: negocio, p_etapa: etapa, p_motivo: motivo ?? null }),
  anotar: (negocio: string, texto: string) => rpc<void>("com_anotar", { p_negocio: negocio, p_texto: texto }),
  salvarNegocio: (negocio: string, p: { valor?: number | null; sistemas?: string[]; temperatura?: Temperatura | null }) =>
    rpc<void>("com_negocio_salvar", { p_negocio: negocio, p }),
  novoContato: (p: Record<string, string>) =>
    rpc<{ ok: boolean; erro?: string; negocio_id?: string; repetido?: boolean }>("com_novo_contato", { p }),
  regrasQualificacao: () => rpc<RegrasQualificacao>("com_config_qualificacao"),
  salvarRegrasQualificacao: (regras: RegrasQualificacao) => rpc<number>("com_config_qualificacao_salvar", { p_regras: regras }),
  previaClassificacao: (dados: Record<string, string>) => rpc<Previa>("com_classificar_previa", { p_dados: dados }),
  ganhar: (negocio: string, p: {
    razao_social?: string; nome_fantasia?: string; cnpj?: string; dia_vencimento?: string; email_financeiro?: string; whatsapp?: string;
    sistemas: { app: string; ref: string; plano: string; valor_mensal: string }[];
  }) => rpc<{ empresa_id: string; vinculos: number; pendentes: string[]; tem_cnpj: boolean; mensalidade: number }>("com_ganhar", { p_negocio: negocio, p }),
  relatorio: (inicio: string | null, fim: string | null) => rpc<Relatorio>("com_relatorio", { p_inicio: inicio, p_fim: fim }),
  importarLeads: (linhas: Record<string, string>[]) =>
    rpc<{ novos: number; repetidos: number; erros: { linha: number; erro: string }[] }>("com_importar", { p_linhas: linhas }),

  schemasDisponiveis: () =>
    rpc<{ schema_name: string; tabelas: number; na_central: boolean; nome_central: string | null }[]>("adm_schemas_disponiveis"),
  adicionarSistema: (schema: string, nome: string, url: string, tipo: "schema" | "tenant", descricao: string) =>
    rpc<void>("adm_adicionar_sistema", { p_schema: schema, p_nome: nome, p_url: url, p_tipo_ref: tipo, p_descricao_ref: descricao }),
  regua: () => rpc<Regua>("adm_regua"),
  salvarRegua: (tolerancia: number, reativar: boolean, passos: Passo[]) =>
    rpc<void>("adm_salvar_regua", { p_dias_tolerancia: tolerancia, p_reativar_automatico: reativar, p_passos: passos }),
  avisos: (empresa: string) =>
    rpc<{ fatura_id: string; passo: string; canal: string; enviado_em: string; resultado: Record<string, unknown>; vencimento: string }[]>(
      "adm_avisos", { p_empresa: empresa }),

  // Asaas e régua (Edge Functions)
  sincronizarAsaas: (empresa: string) =>
    edge<{ customer: string; subscription: string; valor: number; proximo_vencimento: string; ambiente: string }>(
      "adm-asaas-assinatura", { empresa_id: empresa }),
  cancelarAsaas: (empresa: string) => edge<{ acao: string }>("adm-asaas-assinatura", { empresa_id: empresa, acao: "cancelar" }),
  registrarWebhook: () => edge<{ acao: string; url: string; ambiente: string }>("adm-asaas-registrar-webhook", {}),
  avisosPendentes: () =>
    edge<{ pendentes: { empresa_id: string; nome: string; passo: string; canal: string; destino: string; dias: number }[] }>(
      "adm-regua-enviar", { apenas_listar: true }),
  rodarRegua: () =>
    edge<{ total: number; enviados: number; falhas: number; sem_configuracao: number; erros: string[]; configurado: { whatsapp: boolean; email: boolean } }>(
      "adm-regua-enviar", {}),

  // Central de Acessos (mesmas RPCs do imobdocerias)
  listarAplicativos: () => rpc<AppAcesso[]>("pa_listar_aplicativos"),
  listarLogins: (app: string, busca?: string) => rpc<LoginAcesso[]>("pa_listar_usuarios", { p_app: app, p_busca: busca || null }),
  definirPermissao: (app: string, usuario: string, pode: boolean | null) =>
    rpc<void>("pa_definir_permissao", { p_app: app, p_usuario: usuario, p_pode: pode }),
  definirControle: (app: string, ativo: boolean) => rpc<void>("pa_definir_controle", { p_app: app, p_ativo: ativo }),
};
