export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      atividades: {
        Row: {
          concluida: boolean
          created_at: string
          data: string
          descricao: string | null
          duracao_minutos: number | null
          id: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_atividade"]
          titulo: string
          usuario_id: string
        }
        Insert: {
          concluida?: boolean
          created_at?: string
          data?: string
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_atividade"]
          titulo: string
          usuario_id: string
        }
        Update: {
          concluida?: boolean
          created_at?: string
          data?: string
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          lead_id?: string
          tipo?: Database["public"]["Enums"]["tipo_atividade"]
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          entidade: string | null
          entidade_id: string | null
          id: string
          imobiliaria_id: string | null
          payload: Json | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          imobiliaria_id?: string | null
          payload?: Json | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          imobiliaria_id?: string | null
          payload?: Json | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_comissao_acoes: {
        Row: {
          acao: Database["public"]["Enums"]["cobranca_acao"]
          comissao_id: string
          created_at: string
          descricao: string | null
          id: string
          usuario_id: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["cobranca_acao"]
          comissao_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          usuario_id: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["cobranca_acao"]
          comissao_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_comissao_acoes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_comissao_acoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comissao_parcelas: {
        Row: {
          comissao_id: string
          created_at: string
          id: string
          numero: number
          pago_em: string | null
          status: Database["public"]["Enums"]["comissao_status"]
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          comissao_id: string
          created_at?: string
          id?: string
          numero: number
          pago_em?: string | null
          status?: Database["public"]["Enums"]["comissao_status"]
          updated_at?: string
          valor: number
          vencimento: string
        }
        Update: {
          comissao_id?: string
          created_at?: string
          id?: string
          numero?: number
          pago_em?: string | null
          status?: Database["public"]["Enums"]["comissao_status"]
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissao_parcelas_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes: {
        Row: {
          corretor_id: string
          created_at: string
          id: string
          imobiliaria_id: string
          percentual: number
          status: Database["public"]["Enums"]["comissao_status"]
          updated_at: string
          valor: number
          venda_id: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          id?: string
          imobiliaria_id: string
          percentual: number
          status?: Database["public"]["Enums"]["comissao_status"]
          updated_at?: string
          valor: number
          venda_id: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          id?: string
          imobiliaria_id?: string
          percentual?: number
          status?: Database["public"]["Enums"]["comissao_status"]
          updated_at?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      condicoes_pagamento: {
        Row: {
          created_at: string
          empreendimento_id: string
          entrada_percentual: number | null
          financiamento_bancario: boolean
          id: string
          imobiliaria_id: string
          nome: string
          observacoes: string | null
          parcelas_obra: number | null
          parcelas_pos_chaves: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          empreendimento_id: string
          entrada_percentual?: number | null
          financiamento_bancario?: boolean
          id?: string
          imobiliaria_id: string
          nome: string
          observacoes?: string | null
          parcelas_obra?: number | null
          parcelas_pos_chaves?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          empreendimento_id?: string
          entrada_percentual?: number | null
          financiamento_bancario?: boolean
          id?: string
          imobiliaria_id?: string
          nome?: string
          observacoes?: string | null
          parcelas_obra?: number | null
          parcelas_pos_chaves?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condicoes_pagamento_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      construtoras: {
        Row: {
          cnpj: string | null
          comissao_percentual: number | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          id: string
          imobiliaria_id: string
          logo_url: string | null
          nome: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          comissao_percentual?: number | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          id?: string
          imobiliaria_id: string
          logo_url?: string | null
          nome: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          comissao_percentual?: number | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          id?: string
          imobiliaria_id?: string
          logo_url?: string | null
          nome?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construtoras_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_whatsapp: {
        Row: {
          created_at: string
          ia_ativa: boolean
          id: string
          imobiliaria_id: string
          lead_id: string | null
          nao_lidas: number
          nome_contato: string | null
          status: Database["public"]["Enums"]["wa_conv_status"]
          ultima_mensagem: string | null
          ultima_mensagem_at: string | null
          updated_at: string
          wa_contact_id: string
        }
        Insert: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          imobiliaria_id: string
          lead_id?: string | null
          nao_lidas?: number
          nome_contato?: string | null
          status?: Database["public"]["Enums"]["wa_conv_status"]
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
          wa_contact_id: string
        }
        Update: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          imobiliaria_id?: string
          lead_id?: string | null
          nao_lidas?: number
          nome_contato?: string | null
          status?: Database["public"]["Enums"]["wa_conv_status"]
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
          wa_contact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_whatsapp_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_whatsapp_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_venda: {
        Row: {
          aprovado_por: string | null
          arquivo_url: string | null
          created_at: string
          enviado_por: string | null
          etapa: Database["public"]["Enums"]["venda_etapa"]
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["documento_status"]
          tipo: string
          updated_at: string
          venda_id: string
        }
        Insert: {
          aprovado_por?: string | null
          arquivo_url?: string | null
          created_at?: string
          enviado_por?: string | null
          etapa: Database["public"]["Enums"]["venda_etapa"]
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["documento_status"]
          tipo: string
          updated_at?: string
          venda_id: string
        }
        Update: {
          aprovado_por?: string | null
          arquivo_url?: string | null
          created_at?: string
          enviado_por?: string | null
          etapa?: Database["public"]["Enums"]["venda_etapa"]
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["documento_status"]
          tipo?: string
          updated_at?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_venda_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_venda_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      empreendimentos: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          construtora_id: string | null
          created_at: string
          descricao: string | null
          diferenciais: Json | null
          endereco: string | null
          entrega_prevista: string | null
          estado: string | null
          id: string
          imagens: Json | null
          imobiliaria_id: string
          latitude: number | null
          longitude: number | null
          nome: string
          numero: string | null
          plantas: Json | null
          status: Database["public"]["Enums"]["status_empreendimento"]
          total_unidades: number | null
          tour_360_url: string | null
          unidades_disponiveis: number | null
          updated_at: string
          valor_a_partir_de: number | null
          video_url: string | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          construtora_id?: string | null
          created_at?: string
          descricao?: string | null
          diferenciais?: Json | null
          endereco?: string | null
          entrega_prevista?: string | null
          estado?: string | null
          id?: string
          imagens?: Json | null
          imobiliaria_id: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          numero?: string | null
          plantas?: Json | null
          status?: Database["public"]["Enums"]["status_empreendimento"]
          total_unidades?: number | null
          tour_360_url?: string | null
          unidades_disponiveis?: number | null
          updated_at?: string
          valor_a_partir_de?: number | null
          video_url?: string | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          construtora_id?: string | null
          created_at?: string
          descricao?: string | null
          diferenciais?: Json | null
          endereco?: string | null
          entrega_prevista?: string | null
          estado?: string | null
          id?: string
          imagens?: Json | null
          imobiliaria_id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          numero?: string | null
          plantas?: Json | null
          status?: Database["public"]["Enums"]["status_empreendimento"]
          total_unidades?: number | null
          tour_360_url?: string | null
          unidades_disponiveis?: number | null
          updated_at?: string
          valor_a_partir_de?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empreendimentos_construtora_id_fkey"
            columns: ["construtora_id"]
            isOneToOne: false
            referencedRelation: "construtoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empreendimentos_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      imobiliarias: {
        Row: {
          cnpj: string | null
          cor_primaria: string | null
          created_at: string
          email: string | null
          features: Json
          id: string
          logo_url: string | null
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string
          email?: string | null
          features?: Json
          id?: string
          logo_url?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string
          email?: string | null
          features?: Json
          id?: string
          logo_url?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          consentimento_data: string | null
          consentimento_lgpd: boolean
          corretor_id: string | null
          created_at: string
          email: string | null
          estagio: Database["public"]["Enums"]["estagio_funil"]
          id: string
          imobiliaria_id: string
          interesse_empreendimento_id: string | null
          motivo_perdido: string | null
          nome: string
          observacoes: string | null
          orcamento_max: number | null
          orcamento_min: number | null
          origem: Database["public"]["Enums"]["origem_lead"]
          score: Database["public"]["Enums"]["lead_score"]
          telefone: string | null
          ultima_interacao: string | null
          updated_at: string
        }
        Insert: {
          consentimento_data?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          estagio?: Database["public"]["Enums"]["estagio_funil"]
          id?: string
          imobiliaria_id: string
          interesse_empreendimento_id?: string | null
          motivo_perdido?: string | null
          nome: string
          observacoes?: string | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: Database["public"]["Enums"]["origem_lead"]
          score?: Database["public"]["Enums"]["lead_score"]
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Update: {
          consentimento_data?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          estagio?: Database["public"]["Enums"]["estagio_funil"]
          id?: string
          imobiliaria_id?: string
          interesse_empreendimento_id?: string | null
          motivo_perdido?: string | null
          nome?: string
          observacoes?: string | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: Database["public"]["Enums"]["origem_lead"]
          score?: Database["public"]["Enums"]["lead_score"]
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interesse_empreendimento_id_fkey"
            columns: ["interesse_empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_whatsapp: {
        Row: {
          autor_id: string | null
          conteudo: string
          conversa_id: string
          created_at: string
          direcao: Database["public"]["Enums"]["wa_msg_direction"]
          from_ai: boolean
          id: string
          imobiliaria_id: string
          tipo: string
          wa_message_id: string | null
        }
        Insert: {
          autor_id?: string | null
          conteudo: string
          conversa_id: string
          created_at?: string
          direcao: Database["public"]["Enums"]["wa_msg_direction"]
          from_ai?: boolean
          id?: string
          imobiliaria_id: string
          tipo?: string
          wa_message_id?: string | null
        }
        Update: {
          autor_id?: string | null
          conteudo?: string
          conversa_id?: string
          created_at?: string
          direcao?: Database["public"]["Enums"]["wa_msg_direction"]
          from_ai?: boolean
          id?: string
          imobiliaria_id?: string
          tipo?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          imobiliaria_id: string
          lida: boolean
          lida_em: string | null
          link: string | null
          referencia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          imobiliaria_id: string
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          referencia_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          imobiliaria_id?: string
          lida?: boolean
          lida_em?: string | null
          link?: string | null
          referencia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao"]
          titulo?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_comerciais: {
        Row: {
          created_at: string
          desconto_max_pct: number
          empreendimento_id: string
          entrada_min_pct: number
          id: string
          imobiliaria_id: string
          regras: Json
          updated_at: string
          vigente_ate: string | null
          vigente_de: string
        }
        Insert: {
          created_at?: string
          desconto_max_pct?: number
          empreendimento_id: string
          entrada_min_pct?: number
          id?: string
          imobiliaria_id: string
          regras?: Json
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Update: {
          created_at?: string
          desconto_max_pct?: number
          empreendimento_id?: string
          entrada_min_pct?: number
          id?: string
          imobiliaria_id?: string
          regras?: Json
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "politicas_comerciais_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_comerciais_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expira_em: string
          id: string
          token: string
          venda_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expira_em: string
          id?: string
          token: string
          venda_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expira_em?: string
          id?: string
          token?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tokens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          corretor_id: string
          created_at: string
          expira_em: string
          id: string
          imobiliaria_id: string
          lead_id: string
          status: Database["public"]["Enums"]["reserva_status"]
          unidade_id: string
          updated_at: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          expira_em: string
          id?: string
          imobiliaria_id: string
          lead_id: string
          status?: Database["public"]["Enums"]["reserva_status"]
          unidade_id: string
          updated_at?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          expira_em?: string
          id?: string
          imobiliaria_id?: string
          lead_id?: string
          status?: Database["public"]["Enums"]["reserva_status"]
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      simulacoes: {
        Row: {
          corretor_id: string | null
          created_at: string
          dentro_politica: boolean | null
          empreendimento_id: string | null
          entrada: number | null
          id: string
          imobiliaria_id: string
          justificativa: string | null
          lead_id: string | null
          parcelas: number | null
          payload: Json
          preco_proposto: number | null
          preco_tabela: number | null
          taxa_juros: number | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          dentro_politica?: boolean | null
          empreendimento_id?: string | null
          entrada?: number | null
          id?: string
          imobiliaria_id: string
          justificativa?: string | null
          lead_id?: string | null
          parcelas?: number | null
          payload?: Json
          preco_proposto?: number | null
          preco_tabela?: number | null
          taxa_juros?: number | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          dentro_politica?: boolean | null
          empreendimento_id?: string | null
          entrada?: number | null
          id?: string
          imobiliaria_id?: string
          justificativa?: string | null
          lead_id?: string | null
          parcelas?: number | null
          payload?: Json
          preco_proposto?: number | null
          preco_tabela?: number | null
          taxa_juros?: number | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulacoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulacoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      tipologias: {
        Row: {
          area_privativa: number | null
          area_total: number | null
          banheiros: number | null
          created_at: string
          descricao: string | null
          empreendimento_id: string
          id: string
          imobiliaria_id: string
          nome: string
          planta_url: string | null
          quartos: number | null
          status: Database["public"]["Enums"]["status_tipologia"]
          suites: number | null
          updated_at: string
          vagas: number | null
          valor: number | null
        }
        Insert: {
          area_privativa?: number | null
          area_total?: number | null
          banheiros?: number | null
          created_at?: string
          descricao?: string | null
          empreendimento_id: string
          id?: string
          imobiliaria_id: string
          nome: string
          planta_url?: string | null
          quartos?: number | null
          status?: Database["public"]["Enums"]["status_tipologia"]
          suites?: number | null
          updated_at?: string
          vagas?: number | null
          valor?: number | null
        }
        Update: {
          area_privativa?: number | null
          area_total?: number | null
          banheiros?: number | null
          created_at?: string
          descricao?: string | null
          empreendimento_id?: string
          id?: string
          imobiliaria_id?: string
          nome?: string
          planta_url?: string | null
          quartos?: number | null
          status?: Database["public"]["Enums"]["status_tipologia"]
          suites?: number | null
          updated_at?: string
          vagas?: number | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tipologias_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipologias_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          andar: number | null
          area_m2: number | null
          bloco: string | null
          created_at: string
          empreendimento_id: string
          id: string
          imobiliaria_id: string
          numero: string
          observacoes: string | null
          preco: number | null
          status: Database["public"]["Enums"]["unidade_status"]
          tipologia_id: string | null
          updated_at: string
        }
        Insert: {
          andar?: number | null
          area_m2?: number | null
          bloco?: string | null
          created_at?: string
          empreendimento_id: string
          id?: string
          imobiliaria_id: string
          numero: string
          observacoes?: string | null
          preco?: number | null
          status?: Database["public"]["Enums"]["unidade_status"]
          tipologia_id?: string | null
          updated_at?: string
        }
        Update: {
          andar?: number | null
          area_m2?: number | null
          bloco?: string | null
          created_at?: string
          empreendimento_id?: string
          id?: string
          imobiliaria_id?: string
          numero?: string
          observacoes?: string | null
          preco?: number | null
          status?: Database["public"]["Enums"]["unidade_status"]
          tipologia_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_tipologia_id_fkey"
            columns: ["tipologia_id"]
            isOneToOne: false
            referencedRelation: "tipologias"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          creci: string | null
          email: string
          id: string
          imobiliaria_id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          creci?: string | null
          email: string
          id: string
          imobiliaria_id: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          creci?: string | null
          email?: string
          id?: string
          imobiliaria_id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_etapas: {
        Row: {
          concluida_em: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["venda_etapa"]
          id: string
          motivo_travamento: string | null
          ordem: number
          prazo: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["etapa_status"]
          updated_at: string
          venda_id: string
        }
        Insert: {
          concluida_em?: string | null
          created_at?: string
          etapa: Database["public"]["Enums"]["venda_etapa"]
          id?: string
          motivo_travamento?: string | null
          ordem: number
          prazo?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["etapa_status"]
          updated_at?: string
          venda_id: string
        }
        Update: {
          concluida_em?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["venda_etapa"]
          id?: string
          motivo_travamento?: string | null
          ordem?: number
          prazo?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["etapa_status"]
          updated_at?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_etapas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_etapas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          assinada_em: string
          corretor_id: string
          created_at: string
          id: string
          imobiliaria_id: string
          lead_id: string
          reserva_id: string | null
          unidade_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          assinada_em?: string
          corretor_id: string
          created_at?: string
          id?: string
          imobiliaria_id: string
          lead_id: string
          reserva_id?: string | null
          unidade_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          assinada_em?: string
          corretor_id?: string
          created_at?: string
          id?: string
          imobiliaria_id?: string
          lead_id?: string
          reserva_id?: string | null
          unidade_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          corretor_id: string
          created_at: string
          data_hora: string
          duracao_min: number
          empreendimento_id: string | null
          feedback: string | null
          id: string
          imobiliaria_id: string
          lead_id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_visita"]
          updated_at: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          data_hora: string
          duracao_min?: number
          empreendimento_id?: string | null
          feedback?: string | null
          id?: string
          imobiliaria_id: string
          lead_id: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_visita"]
          updated_at?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          data_hora?: string
          duracao_min?: number
          empreendimento_id?: string | null
          feedback?: string | null
          id?: string
          imobiliaria_id?: string
          lead_id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_visita"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          ativo: boolean
          created_at: string
          display_phone: string | null
          ia_default_ativa: boolean
          ia_prompt: string | null
          id: string
          imobiliaria_id: string
          phone_number_id: string | null
          updated_at: string
          verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          display_phone?: string | null
          ia_default_ativa?: boolean
          ia_prompt?: string | null
          id?: string
          imobiliaria_id: string
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          display_phone?: string | null
          ia_default_ativa?: boolean
          ia_prompt?: string | null
          id?: string
          imobiliaria_id?: string
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: true
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_aging_comissoes: {
        Row: {
          construtora: string | null
          faixa: string | null
          imobiliaria_id: string | null
          parcelas: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      converter_reserva_em_venda: {
        Args: {
          p_num_parcelas?: number
          p_percentual_comissao?: number
          p_reserva_id: string
          p_valor: number
        }
        Returns: string
      }
      expirar_reservas: { Args: never; Returns: number }
      gerar_automacoes: { Args: never; Returns: Json }
      get_my_imobiliaria_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reservar_unidade: {
        Args: {
          p_horas_validade?: number
          p_lead_id: string
          p_unidade_id: string
        }
        Returns: string
      }
      validar_politica_comercial: {
        Args: {
          p_empreendimento_id: string
          p_entrada: number
          p_preco_proposto: number
          p_preco_tabela: number
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "gestor" | "corretor"
      cobranca_acao: "email" | "whatsapp" | "ligacao" | "acordo"
      comissao_status: "prevista" | "liberada" | "paga"
      documento_status: "pendente" | "enviado" | "aprovado" | "rejeitado"
      estagio_funil:
        | "novo_lead"
        | "em_qualificacao"
        | "qualificado"
        | "proposta_enviada"
        | "visita_agendada"
        | "em_negociacao"
        | "fechado_ganho"
        | "fechado_perdido"
      etapa_status: "pendente" | "em_andamento" | "concluida" | "travada"
      lead_score: "novo" | "frio" | "morno" | "quente" | "perdido" | "fechado"
      origem_lead:
        | "site"
        | "whatsapp"
        | "instagram"
        | "facebook"
        | "google_ads"
        | "indicacao"
        | "portal"
        | "outro"
      reserva_status: "ativa" | "expirada" | "convertida" | "cancelada"
      status_empreendimento:
        | "em_lancamento"
        | "em_obras"
        | "pronto_para_morar"
        | "entregue"
        | "esgotado"
      status_tipologia: "disponivel" | "reservada" | "vendida" | "bloqueada"
      status_visita:
        | "agendada"
        | "confirmada"
        | "realizada"
        | "cancelada"
        | "nao_compareceu"
      tipo_atividade:
        | "ligacao"
        | "whatsapp"
        | "email"
        | "visita"
        | "reuniao"
        | "nota"
      tipo_notificacao: "visita_lembrete" | "lead_quente_parado" | "sistema"
      unidade_status: "disponivel" | "reservada" | "vendida" | "bloqueada"
      venda_etapa:
        | "proposta_aceita"
        | "analise_credito"
        | "assinatura"
        | "repasse"
        | "registro"
        | "chaves"
      wa_conv_status: "aberta" | "pausada" | "arquivada"
      wa_msg_direction: "inbound" | "outbound"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["gestor", "corretor"],
      cobranca_acao: ["email", "whatsapp", "ligacao", "acordo"],
      comissao_status: ["prevista", "liberada", "paga"],
      documento_status: ["pendente", "enviado", "aprovado", "rejeitado"],
      estagio_funil: [
        "novo_lead",
        "em_qualificacao",
        "qualificado",
        "proposta_enviada",
        "visita_agendada",
        "em_negociacao",
        "fechado_ganho",
        "fechado_perdido",
      ],
      etapa_status: ["pendente", "em_andamento", "concluida", "travada"],
      lead_score: ["novo", "frio", "morno", "quente", "perdido", "fechado"],
      origem_lead: [
        "site",
        "whatsapp",
        "instagram",
        "facebook",
        "google_ads",
        "indicacao",
        "portal",
        "outro",
      ],
      reserva_status: ["ativa", "expirada", "convertida", "cancelada"],
      status_empreendimento: [
        "em_lancamento",
        "em_obras",
        "pronto_para_morar",
        "entregue",
        "esgotado",
      ],
      status_tipologia: ["disponivel", "reservada", "vendida", "bloqueada"],
      status_visita: [
        "agendada",
        "confirmada",
        "realizada",
        "cancelada",
        "nao_compareceu",
      ],
      tipo_atividade: [
        "ligacao",
        "whatsapp",
        "email",
        "visita",
        "reuniao",
        "nota",
      ],
      tipo_notificacao: ["visita_lembrete", "lead_quente_parado", "sistema"],
      unidade_status: ["disponivel", "reservada", "vendida", "bloqueada"],
      venda_etapa: [
        "proposta_aceita",
        "analise_credito",
        "assinatura",
        "repasse",
        "registro",
        "chaves",
      ],
      wa_conv_status: ["aberta", "pausada", "arquivada"],
      wa_msg_direction: ["inbound", "outbound"],
    },
  },
} as const
