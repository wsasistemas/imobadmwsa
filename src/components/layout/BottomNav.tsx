import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, CalendarDays, LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Início", to: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { label: "Leads", to: "/leads", icon: Users, match: (p: string) => p.startsWith("/leads") },
  { label: "Imóveis", to: "/empreendimentos", icon: Building2, match: (p: string) => p.startsWith("/empreendimentos") },
  { label: "Agenda", to: "/agenda", icon: CalendarDays, match: (p: string) => p.startsWith("/agenda") },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-card md:hidden">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
