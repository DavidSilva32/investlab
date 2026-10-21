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
import { UserProfileDialog } from "@/components/user-profile-dialog";
import { AdminSupportViewControl } from "@/components/admin-support-view-control";
import { AdminSupportViewBanner } from "@/components/admin-support-view-banner";
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

const ShellUserContext = createContext<{
  user: ShellUser;
  updateName: (name: string) => void;
} | null>(null);

const AdminSupportViewContext = createContext<boolean | null | "error">(null);

export function useAdminSupportView() {
  return useContext(AdminSupportViewContext);
}

export function ShellUserProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  const [currentUser, setCurrentUser] = useState(user);
  return (
    <ShellUserContext.Provider
      value={{
        user: currentUser,
        updateName: (name) =>
          setCurrentUser((previous) => ({ ...previous, name })),
      }}
    >
      {children}
    </ShellUserContext.Provider>
  );
}

const navigation = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/carteira", label: "Carteira", Icon: WalletCards },
  { href: "/planejamento", label: "Planejamento", Icon: Calculator },
  { href: "/estrategia", label: "Estratégia", Icon: Compass },
  { href: "/aprender", label: "Aprender", Icon: BookOpen },
  { href: "/analises", label: "Análises", Icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", Icon: Settings },
];

const adminNavigation = [
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/apresentacao", label: "Landing page" },
  { href: "/demonstracao", label: "Demonstração" },
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
  const isAdministrationRoute =
    pathname.startsWith("/admin") ||
    pathname === "/apresentacao" ||
    pathname === "/demonstracao";
  const [adminOpen, setAdminOpen] = useState(isAdministrationRoute);

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
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
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
          open={adminOpen || isAdministrationRoute}
          onOpenChange={setAdminOpen}
          className="mt-1"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Administração"
              className="flex min-h-11 w-full justify-between rounded-xl px-3 text-sm font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-sidebar-ring"
            >
              <span className="flex items-center gap-3">
                <UserRoundCog aria-hidden="true" className="size-4" />
                Administração
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`size-4 transition-transform ${adminOpen || isAdministrationRoute ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1 pl-4">
            {adminNavigation.map(({ href, label }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              const link = (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                >
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
  const userContext = useContext(ShellUserContext);
  if (!userContext) {
    throw new Error(
      "AppShell precisa ser renderizado dentro de ShellUserProvider.",
    );
  }
  const { user, updateName } = userContext;
  const [supportViewActive, setSupportViewActive] = useState<
    boolean | null | "error"
  >(user.role === "ADMIN" ? null : false);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar-background p-5 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col [&_.text-brand]:text-sidebar-brand [&_.text-foreground]:text-sidebar-foreground">
        <div className="px-1 py-2">
          <Brand />
        </div>
        <div className="mt-8">
          <Navigation pathname={pathname} user={user} />
        </div>
        <div className="mt-auto border-t border-sidebar-border pt-5 [&>button]:text-sidebar-muted [&>button]:hover:text-sidebar-foreground [&>button]:focus-visible:ring-sidebar-ring">
          <p className="mb-3 px-3 text-xs font-medium text-sidebar-muted">
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
              <SheetContent className="bg-sidebar-background text-sidebar-foreground [&_.text-brand]:text-sidebar-brand [&_.text-foreground]:text-sidebar-foreground">
                <Brand />
                <div className="mt-9">
                  <Navigation pathname={pathname} user={user} closeOnSelect />
                </div>
                <div className="mt-8 border-t border-sidebar-border pt-4 [&>button]:text-sidebar-muted [&>button]:hover:text-sidebar-foreground [&>button]:focus-visible:ring-sidebar-ring">
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
            {user.role === "ADMIN" && <AdminSupportViewControl />}
            <UserProfileDialog
              name={user.name}
              email={user.email}
              role={user.role}
              onNameUpdated={updateName}
            />
          </div>
        </header>
        {user.role === "ADMIN" && (
          <AdminSupportViewBanner onSupportViewChange={setSupportViewActive} />
        )}
        <AdminSupportViewContext.Provider value={supportViewActive}>
          <main className="w-full p-4 sm:p-6 lg:p-8">{children}</main>
        </AdminSupportViewContext.Provider>
      </div>
      <PortfolioChatAssistant />
    </div>
  );
}
