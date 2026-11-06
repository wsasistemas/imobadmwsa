import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/visitasMeta";
import type { Visita } from "@/types";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function VisitasCalendar({
  visitas,
  onSelectDay,
}: {
  visitas: Visita[];
  onSelectDay?: (date: Date) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Visita[]>();
    for (const v of visitas) {
      const d = new Date(v.data_hora);
      const key = d.toDateString();
      const arr = m.get(key) ?? [];
      arr.push(v);
      m.set(key, arr);
    }
    return m;
  }, [visitas]);

  const today = new Date().toDateString();

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm font-medium">
          {MESES[cursor.getMonth()]} {cursor.getFullYear()}
        </div>
        <div className="flex gap-1">
          <Button
            size="icon" variant="ghost"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          ><ChevronLeft className="h-4 w-4" /></Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}
          >Hoje</Button>
          <Button
            size="icon" variant="ghost"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          ><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const key = d.toDateString();
          const items = byDay.get(key) ?? [];
          const isToday = key === today;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay?.(d)}
              className={cn(
                "min-h-[90px] border-b border-r p-1.5 text-left align-top transition-colors hover:bg-accent/40",
                !inMonth && "bg-muted/20 text-muted-foreground",
                (i + 1) % 7 === 0 && "border-r-0",
              )}
            >
              <div className={cn(
                "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                isToday && "bg-primary text-primary-foreground font-semibold",
              )}>{d.getDate()}</div>
              <div className="space-y-1">
                {items.slice(0, 3).map((v) => {
                  const m = statusMeta(v.status);
                  const hh = new Date(v.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={v.id} className="flex items-center gap-1 truncate rounded bg-muted/40 px-1 py-0.5 text-[10px]">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.color)} />
                      <span className="font-medium">{hh}</span>
                    </div>
                  );
                })}
                {items.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
