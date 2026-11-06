import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list-leads";
import createLead from "./tools/create-lead";
import listEmpreendimentos from "./tools/list-empreendimentos";
import listVisitas from "./tools/list-visitas";

// Direct Supabase host — required for RFC 8414 issuer match (not the .lovable.cloud proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "imobsystem-mcp",
  title: "ImobSystem MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do ImobSystem (CRM para imobiliárias). Use list_leads/list_empreendimentos/list_visitas para consultas e create_lead para registrar novos contatos. Toda ação executa como o usuário autenticado, respeitando RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, createLead, listEmpreendimentos, listVisitas],
});
