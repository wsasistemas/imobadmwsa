import { Bell, CalendarClock, Flame, Info, Check } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotificacoes, type Notificacao } from "@/hooks/useNotificacoes";
import { cn } from "@/lib/utils";

const ICONS: Record<Notificacao["tipo"], typeof Bell> = {
  visita_lembrete: CalendarClock,
  lead_quente_parado: Flame,
  sistema: Info,
};

export function NotificationBell() {
  const navigate = useNavigate();
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas } = useNotificacoes();

  function handleClick(n: Notificacao) {
    if (!n.lida) marcarLida.mutate(n.id);
    if (n.link) navigate({ to: n.link });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Notificações</div>
          {naoLidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => marcarTodasLidas.mutate()}>
              <Check className="h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notificacoes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação por aqui.
            </div>
          ) : (
            <ul className="divide-y">
              {notificacoes.map((n) => {
                const Icon = ICONS[n.tipo] ?? Info;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-3 text-left transition hover:bg-muted/50",
                        !n.lida && "bg-primary/5"
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        n.tipo === "lead_quente_parado" ? "bg-orange-100 text-orange-600" :
                        n.tipo === "visita_lembrete" ? "bg-blue-100 text-blue-600" :
                        "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate text-sm font-medium">{n.titulo}</div>
                          {!n.lida && <Badge variant="default" className="h-2 w-2 shrink-0 rounded-full p-0" />}
                        </div>
                        {n.descricao && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.descricao}</div>
                        )}
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
