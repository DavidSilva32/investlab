"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Compass,
  Download,
  LayoutDashboard,
  Menu,
  Settings,
  WalletCards,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navigation = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/portfolio", label: "Carteira", Icon: WalletCards },
  { href: "/strategy", label: "Estratégia", Icon: Compass },
  { href: "/imports", label: "Importações", Icon: Download },
  { href: "/analyses", label: "Análises", Icon: BarChart3 },
  { href: "/settings", label: "Configurações", Icon: Settings },
];
function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 font-semibold tracking-tight"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
        I
      </span>
      InvestLab
    </Link>
  );
}
function Navigation({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
      {navigation.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          (href === "/analyses" && pathname?.startsWith("/analyses"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-brand/15 text-brand shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-72 shrink-0 border-r border-border/70 bg-card/55 p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-1 py-2">
          <Brand />
        </div>
        <div className="mt-10">
          <Navigation pathname={pathname} />
        </div>
        <div className="mt-auto border-t border-border/70 pt-5">
          <p className="mb-3 px-3 text-xs font-medium text-muted-foreground">
            CONTA
          </p>
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <Brand />
                <div className="mt-9">
                  <Navigation pathname={pathname} />
                </div>
                <div className="mt-8 border-t pt-4">
                  <LogoutButton />
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                InvestLab
              </p>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden border-l border-border/70 pl-4 text-right sm:block">
              <p className="text-sm font-medium">Usuário autorizado</p>
              <p className="text-xs text-muted-foreground">Área pessoal</p>
            </div>
          </div>
        </header>
        <main className="w-full p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
