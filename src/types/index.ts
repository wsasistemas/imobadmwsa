import type { Database } from "@/integrations/supabase/types";
/**
 * Tipos do domínio ImobSystem.
 */

export type UserRole = "gestor" | "corretor";

export type LeadScore = "novo" | "frio" | "morno" | "quente" | "perdido" | "fechado";

export type EstagioFunil =
  | "novo_lead"
  | "em_qualificacao"
  | "qualificado"
  | "proposta_enviada"
  | "visita_agendada"
  | "em_negociacao"
  | "fechado_ganho"
  | "fechado_perdido";

export type OrigemLead =
  | "site"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "google_ads"
  | "indicacao"
  | "portal"
  | "outro";

export type StatusEmpreendimento =
  | "em_lancamento"
  | "em_obras"
  | "pronto_para_morar"
  | "entregue"
  | "esgotado";

export type StatusTipologia = "disponivel" | "reservada" | "vendida" | "bloqueada";

export type TipoAtividade =
  | "ligacao"
  | "whatsapp"
  | "email"
  | "visita"
  | "reuniao"
  | "nota";

export type StatusVisita =
  | "agendada"
  | "confirmada"
  | "realizada"
  | "cancelada"
  | "nao_compareceu";

export interface Visita {
  id: string;
  imobiliaria_id: string;
  lead_id: string;
  empreendimento_id: string | null;
  corretor_id: string;
  data_hora: string;
  duracao_min: number;
  status: StatusVisita;
  observacoes: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface Imobiliaria {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cor_primaria: string | null;
  logo_url: string | null;
  created_at: string;
  features: Database["public"]["Tables"]["imobiliarias"]["Row"]["features"];
  updated_at: string;
}

export interface Usuario {
  id: string;
  imobiliaria_id: string;
  nome: string;
  email: string;
  telefone: string | null;
  avatar_url: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsuarioComRole extends Usuario {
  role: UserRole;
}

export interface Construtora {
  id: string;
  imobiliaria_id: string;
  nome: string;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  comissao_percentual: number | null;
  observacoes: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Empreendimento {
  id: string;
  imobiliaria_id: string;
  construtora_id: string | null;
  nome: string;
  descricao: string | null;
  status: StatusEmpreendimento;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  valor_a_partir_de: number | null;
  entrega_prevista: string | null;
  total_unidades: number | null;
  unidades_disponiveis: number | null;
  diferenciais: string[];
  imagens: string[]; // paths no bucket "empreendimentos"
  plantas: string[];
  video_url: string | null;
  tour_360_url: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tipologia {
  id: string;
  imobiliaria_id: string;
  empreendimento_id: string;
  nome: string;
  area_privativa: number | null;
  area_total: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  valor: number | null;
  status: StatusTipologia;
  planta_url: string | null;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

export interface CondicaoPagamento {
  id: string;
  imobiliaria_id: string;
  empreendimento_id: string;
  nome: string;
  entrada_percentual: number | null;
  parcelas_obra: number | null;
  parcelas_pos_chaves: number | null;
  financiamento_bancario: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  imobiliaria_id: string;
  corretor_id: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  origem: OrigemLead;
  score: LeadScore;
  estagio: EstagioFunil;
  interesse_empreendimento_id: string | null;
  orcamento_min: number | null;
  orcamento_max: number | null;
  consentimento_lgpd: boolean;
  consentimento_data: string | null;
  observacoes: string | null;
  motivo_perdido: string | null;
  ultima_interacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface Atividade {
  id: string;
  lead_id: string;
  usuario_id: string;
  tipo: TipoAtividade;
  titulo: string;
  descricao: string | null;
  data: string;
  duracao_minutos: number | null;
  concluida: boolean;
  created_at: string;
}

export interface SessaoUsuario {
  userId: string;
  email: string;
  nome: string;
  imobiliariaId: string;
  role: UserRole;
}
