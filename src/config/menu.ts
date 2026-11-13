// Registro único do menu (padrão menuRegistry.ts do imobatendimento), na ordem do mockup v2 aprovado.
// `fase` marca o que ainda não foi construído: aparece no menu com a etiqueta "em breve", sem link.
import type { NomeIcone } from "@/components/icones/icone-colorido";

export interface ItemMenu {
  to: string;
  label: string;
  icone: NomeIcone;
  fase?: number;
  depois?: boolean; // LinkedIn e TikTok: fora deste plano
  filhos?: ItemMenu[];
}

export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

export const MENU: GrupoMenu[] = [
  {
    titulo: "Menu principal",
    itens: [
      { to: "/dashboard", label: "Painel", icone: "flat-color-icons:combo-chart" },
      { to: "/empresas", label: "Empresas", icone: "flat-color-icons:department" },
      { to: "/mensalidades", label: "Mensalidades", icone: "flat-color-icons:money-transfer" },
      { to: "/sistemas", label: "Sistemas e schemas", icone: "flat-color-icons:data-configuration" },
      { to: "/visao-cliente", label: "Visão do cliente", icone: "fluent-color:shield-checkmark-24", fase: 9 },
    ],
  },
  {
    titulo: "Gestão Comercial",
    itens: [
      { to: "/leads", label: "Leads & Contatos", icone: "fluent-color:people-list-24" },
      { to: "/funil", label: "Funil de Vendas", icone: "fluent-color:board-24" },
      { to: "/atendimento-online", label: "Atendimento ONLINE", icone: "fluent-color:chat-24" },
      { to: "/agendamentos", label: "Agendamentos", icone: "fluent-color:calendar-24" },
      { to: "/relatorios-comerciais", label: "Relatórios Comerciais", icone: "fluent-color:chart-multiple-24" },
    ],
  },
  {
    titulo: "Gestão Marketing",
    itens: [
      {
        to: "/fontes",
        label: "Fonte de leads",
        icone: "logos:meta-icon",
        filhos: [
          { to: "/fontes/landing", label: "Landing pages e sites", icone: "fluent-color:person-add-24" },
          { to: "/fontes/meta", label: "Facebook e Instagram", icone: "logos:facebook" },
          { to: "/fontes/linkedin", label: "LinkedIn", icone: "logos:linkedin-icon", depois: true },
          { to: "/fontes/tiktok", label: "TikTok", icone: "logos:tiktok-icon", depois: true },
        ],
      },
    ],
  },
  {
    titulo: "Configurações",
    itens: [
      { to: "/usuarios", label: "Usuários", icone: "fluent-color:people-24" },
      { to: "/regua", label: "Régua de cobrança", icone: "fluent-color:clock-24" },
      { to: "/google-agenda", label: "Google Agenda", icone: "fluent-color:calendar-sync-24" },
      { to: "/permissoes", label: "Permissões por aplicativo", icone: "fluent-color:lock-shield-24" },
      { to: "/como-funciona", label: "Como funciona", icone: "flat-color-icons:database" },
    ],
  },
];
