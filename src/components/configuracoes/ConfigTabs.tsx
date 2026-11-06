import { Link, useRouterState } from "@tanstack/react-router";
import { Building, MessageCircle, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/configuracoes", label: "Perfil", icon: User },
  { to: "/configuracoes/construtoras", label: "Construtoras", icon: Building },
  { to: "/configuracoes/corretores", label: "Corretores", icon: Users },
  { to: "/configuracoes/whatsapp", label: "WhatsApp", icon: MessageCircle },
] as const;

export function ConfigTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
