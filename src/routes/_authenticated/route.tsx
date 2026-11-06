import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/adm/app-shell";
import { api } from "@/lib/adm/api";
import { sb } from "@/lib/adm/supabase";

// Todo o painel exige login no Supabase central e o super admin da Central de Acessos.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname } });
    const pode = await api.souSuperAdmin().catch(() => false);
    if (!pode) {
      await sb.auth.signOut();
      throw redirect({ to: "/auth", search: { next: undefined } });
    }
    return { email: data.session.user.email ?? null };
  },
  component: Layout,
});

function Layout() {
  const { email } = Route.useRouteContext();
  return <AppShell email={email} />;
}
