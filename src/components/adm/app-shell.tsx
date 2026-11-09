import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { IconeColorido } from "@/components/icones/icone-colorido";
import { MENU, type ItemMenu } from "@/config/menu";
import { sb } from "@/lib/adm/supabase";
import { cn } from "@/lib/utils";

// Casca do painel no padrão do imobdocerias/Imobenviomassa: menu em grupos (título + itens compactos), item ativo
// com o degradê azul → abóbora (utility menu-ativo), submenu com seta e "Sair" no rodapé.

const ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-lg:min-h-11";
const ATIVO = "menu-ativo font-semibold text-primary-foreground! hover:bg-transparent";

function Etiqueta({ item }: { item: ItemMenu }) {
  if (item.depois) return <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">depois</span>;
  if (item.fase) return <span className="rounded-full bg-abobora-soft px-1.5 py-0.5 text-[10px] font-semibold text-abobora-dark">em breve</span>;
  return null;
}

function LinhaMenu({ item, onNavegar, pathname }: { item: ItemMenu; onNavegar: () => void; pathname: string }) {
  const filhoAtivo = item.filhos?.some((f) => pathname.startsWith(f.to));
  const [aberto, setAberto] = useState(!!filhoAtivo);

  if (item.filhos) {
    return (
      <li>
        <button type="button" className={ITEM} onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          <IconeColorido nome={item.icone} />
          <span className="flex-1 truncate">{item.label}</span>
          <ChevronRight className={cn("size-4 transition-transform", aberto && "rotate-90")} />
        </button>
        {aberto ? (
          <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
            {item.filhos.map((f) => <LinhaMenu key={f.to} item={f} onNavegar={onNavegar} pathname={pathname} />)}
          </ul>
        ) : null}
      </li>
    );
  }

  if (item.fase || item.depois) {
    return (
      <li>
        <span className={cn(ITEM, "cursor-default opacity-70 hover:bg-transparent hover:text-sidebar-foreground")} title={item.fase ? `Chega na Fase ${item.fase}` : "Fora deste plano"}>
          <IconeColorido nome={item.icone} />
          <span className="flex-1 truncate">{item.label}</span>
          <Etiqueta item={item} />
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link to={item.to} onClick={onNavegar} title={item.label} className={ITEM} activeProps={{ className: ATIVO }}>
        <IconeColorido nome={item.icone} />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

export function AppShell({ email }: { email: string | null }) {
  const [aberto, setAberto] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setAberto(false), [pathname]);

  const sair = async () => {
    await sb.auth.signOut();
    window.location.replace("/auth");
  };

  const nav = (
    <nav aria-label="Menu do painel">
      {MENU.map((g) => (
        <div key={g.titulo}>
          <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {g.itens.map((i) => <LinhaMenu key={i.to} item={i} onNavegar={() => setAberto(false)} pathname={pathname} />)}
          </ul>
        </div>
      ))}
    </nav>
  );

  const rodape = (
    <button type="button" onClick={sair} className={ITEM}>
      <IconeColorido nome="flat-color-icons:export" />
      <span>Sair</span>
    </button>
  );

  const iniciais = (email ?? "?").split("@")[0]!.split(/[._-]/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <Link to="/dashboard" className="flex h-16 shrink-0 items-center gap-2.5 px-4">
          <img src="/logo-wsa-128.png" alt="" className="size-10 shrink-0 rounded-full bg-card shadow-sm ring-1 ring-sidebar-border" />
          <span className="leading-tight">
            <strong className="block text-[15px] font-extrabold tracking-[-0.01em] text-foreground">ImobAdm</strong>
            <small className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">WSA Sistemas</small>
          </span>
        </Link>
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto px-3 pb-8">{nav}</div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar to-transparent" />
        </div>
        <div className="shrink-0 border-t border-sidebar-border px-3 py-2.5">{rodape}</div>
      </aside>

      <div className="min-w-0 lg:pl-[260px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
              onClick={() => setAberto((v) => !v)}
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            >
              {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <Link to="/dashboard" className="flex items-center gap-2 lg:hidden">
              <img src="/logo-wsa-128.png" alt="" className="size-8 rounded-full" />
              <strong className="text-[15px] font-extrabold">ImobAdm</strong>
            </Link>
            <div className="flex-1" />
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right leading-tight sm:block">
                <b className="block max-w-56 truncate text-[13px]">{email}</b>
                <span className="text-[11px] text-muted-foreground">Super admin</span>
              </div>
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{iniciais}</span>
            </div>
          </div>
          {aberto ? (
            <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-sidebar-border bg-sidebar px-3 py-2 lg:hidden">
              {nav}
              <div className="mt-2 border-t border-sidebar-border pt-2">{rodape}</div>
            </div>
          ) : null}
        </header>
        {/* O Funil usa a largura toda para caber as 8 colunas; as outras telas ficam com a leitura confortável. */}
        <main className={cn("painel-conteudo mx-auto min-w-0 px-4 py-6 sm:px-6", pathname.startsWith("/funil") ? "max-w-none" : "max-w-[1400px]")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
