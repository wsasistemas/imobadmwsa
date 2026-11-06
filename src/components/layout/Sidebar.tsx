import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Calculator, CalendarDays, LayoutDashboard, MessageCircle, Settings, Users, ChevronsLeft, ChevronsRight, BarChart3, LayoutGrid, Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
  { label: "Leads / CRM", to: "/leads", icon: Users, match: (p) => p.startsWith("/leads") },
  { label: "Empreendimentos", to: "/empreendimentos", icon: Building2, match: (p) => p.startsWith("/empreendimentos") },
  { label: "Espelho de Vendas", to: "/espelho", icon: LayoutGrid, match: (p) => p.startsWith("/espelho") },
  { label: "Admin Unidades", to: "/admin/unidades", icon: Boxes, match: (p) => p.startsWith("/admin/unidades") },
  { label: "Agenda", to: "/agenda", icon: CalendarDays, match: (p) => p.startsWith("/agenda") },
  { label: "WhatsApp", to: "/whatsapp", icon: MessageCircle, match: (p) => p.startsWith("/whatsapp") && !p.startsWith("/configuracoes") },
  { label: "Simulador", to: "/simulador", icon: Calculator, match: (p) => p.startsWith("/simulador") },
  { label: "Relatórios", to: "/relatorios", icon: BarChart3, match: (p) => p.startsWith("/relatorios") },
  { label: "Configurações", to: "/configuracoes", icon: Settings, match: (p) => p.startsWith("/configuracoes") },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">ImobSystem</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        className={cn(
          "m-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && <span>Recolher</span>}
      </button>
    </aside>
  );
}
