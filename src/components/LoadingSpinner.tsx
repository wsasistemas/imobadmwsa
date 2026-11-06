import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground", className)}
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function FullPageSpinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <LoadingSpinner label={label} />
    </div>
  );
}
