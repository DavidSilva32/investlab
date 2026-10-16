"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Calculator,
  ChevronDown,
  Compass,
  LayoutDashboard,
  Menu,
  Settings,
  UserRoundCog,
  WalletCards,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { PortfolioChatAssistant } from "@/components/portfolio-chat-assistant";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export type ShellUser = {
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

const ShellUserContext = createContext<ShellUser | null>(null);

export function ShellUserProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  return (
    <ShellUserContext.Provider value={user}>
      {children}
    </ShellUserContext.Provider>
  );
}

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
  user,
  closeOnSelect = false,
}: {
  pathname: string;
  user: ShellUser;
  closeOnSelect?: boolean;
}) {
  const isAdmin = user.role === "ADMIN";
  const visibleNavigation = isAdmin
    ? navigation
    : navigation.filter((item) => item.href !== "/configuracoes");
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith("/admin"));

  return (
    <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
      {visibleNavigation.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          (href === "/aprender" && pathname.startsWith("/aprender")) ||
          (href === "/planejamento" && pathname.startsWith("/planejamento")) ||
          (href === "/analises" && pathname.startsWith("/analises"));
        const link = (
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
        return closeOnSelect ? (
          <SheetClose key={href} asChild>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
      {isAdmin && (
        <Collapsible
          open={adminOpen || pathname.startsWith("/admin")}
          onOpenChange={setAdminOpen}
          className="mt-1"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Administração"
              className="flex min-h-11 w-full justify-between rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <span className="flex items-center gap-3">
                <UserRoundCog aria-hidden="true" className="size-4" />
                Administração
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`size-4 transition-transform ${adminOpen || pathname.startsWith("/admin") ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1 pl-4">
            {closeOnSelect ? (
              <SheetClose asChild>
                <Link
                  href="/admin/usuarios"
                  aria-current={
                    pathname.startsWith("/admin/usuarios") ? "page" : undefined
                  }
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pathname.startsWith("/admin/usuarios") ? "bg-brand/15 text-brand shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  Usuários
                </Link>
              </SheetClose>
            ) : (
              <Link
                href="/admin/usuarios"
                aria-current={
                  pathname.startsWith("/admin/usuarios") ? "page" : undefined
                }
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pathname.startsWith("/admin/usuarios") ? "bg-brand/15 text-brand shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                Usuários
              </Link>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </nav>
  );
}

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const user = useContext(ShellUserContext);
  if (!user) {
    throw new Error(
      "AppShell precisa ser renderizado dentro de ShellUserProvider.",
    );
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-card/55 p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-1 py-2">
          <Brand />
        </div>
        <div className="mt-8">
          <Navigation pathname={pathname} user={user} />
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
                  <Menu aria-hidden="true" className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <Brand />
                <div className="mt-9">
                  <Navigation pathname={pathname} user={user} closeOnSelect />
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
          <div className="flex min-w-0 items-center gap-3">
            <ThemeToggle />
            <div className="hidden min-w-0 border-l border-border/70 pl-4 text-right sm:block">
              <p
                className="max-w-52 truncate text-sm font-medium"
                title={user.name || user.email}
              >
                {user.name || user.email}
              </p>
              <p
                className="max-w-52 truncate text-xs text-muted-foreground"
                title={user.email}
              >
                {user.email}
              </p>
            </div>
          </div>
        </header>
        <main className="w-full p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <PortfolioChatAssistant />
    </div>
  );
}
