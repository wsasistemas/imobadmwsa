import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function Header() {
  const navigate = useNavigate();
  const { usuario, signOut } = useAuth();

  const { data: imob } = useQuery({
    queryKey: ["imobiliaria", usuario?.imobiliariaId],
    enabled: !!usuario?.imobiliariaId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("imobiliarias")
        .select("nome")
        .eq("id", usuario!.imobiliariaId)
        .maybeSingle();
      return data;
    },
  });

  async function handleLogout() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">
          {imob?.nome ?? "ImobSystem"}
        </div>
        {usuario?.role && (
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {usuario.role === "gestor" ? "Gestor" : "Corretor"}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell />
        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials(usuario?.nome)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">
              {usuario?.nome ?? "Usuário"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{usuario?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
