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

/** Mensagem legível: a regra de negócio devolve a frase pronta em `message`. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message;
  return msg && !msg.startsWith("{") ? msg : "Não foi possível concluir a ação. Tente de novo.";
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
