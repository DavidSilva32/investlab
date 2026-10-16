"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Calculator,
  Compass,
  LayoutDashboard,
  Menu,
  Settings,
  WalletCards,
  UserRoundCog,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { PortfolioChatAssistant } from "@/components/portfolio-chat-assistant";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navigation = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/carteira", label: "Carteira", Icon: WalletCards },
  { href: "/planejamento", label: "Planejamento", Icon: Calculator },
  { href: "/estrategia", label: "Estratégia", Icon: Compass },
  { href: "/aprender", label: "Aprender", Icon: BookOpen },
  { href: "/analises", label: "Análises", Icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", Icon: Settings },
];
function Brand() {
  return (
    <Link
      href="/"
      aria-label="InvestLab, página inicial"
      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BrandLogo />
    </Link>
  );
}
function Navigation({
  pathname,
  isAdmin,
}: {
  pathname: string;
  isAdmin: boolean;
}) {
  const visibleNavigation = isAdmin
    ? [
        ...navigation,
        { href: "/admin/usuarios", label: "Usuários", Icon: UserRoundCog },
      ]
    : navigation.filter((item) => item.href !== "/configuracoes");
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
      {visibleNavigation.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          (href === "/aprender" && pathname?.startsWith("/aprender")) ||
          (href === "/planejamento" && pathname?.startsWith("/planejamento")) ||
          (href === "/analises" && pathname?.startsWith("/analises"));
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
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { user?: { role?: string } } | null) => {
        if (active) setIsAdmin(body?.user?.role === "ADMIN");
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-card/55 p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-1 py-2">
          <Brand />
        </div>
        <div className="mt-8">
          <Navigation pathname={pathname} isAdmin={isAdmin} />
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
                  <Navigation pathname={pathname} isAdmin={isAdmin} />
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
      <PortfolioChatAssistant />
    </div>
  );
}
