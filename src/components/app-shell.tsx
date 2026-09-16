"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Carteira" },
  { href: "/#importacoes", label: "Importações" },
  { href: "/#analises", label: "Análises" },
  { href: "/#configuracoes", label: "Configurações" },
];

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="border-b border-slate-200 bg-white p-3 sm:p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between lg:block">
          <Link href="/" className="text-lg font-bold text-emerald-700">
            InvestLab
          </Link>
          <div className="lg:hidden">
            <LogoutButton />
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 ${pathname === item.href ? "bg-emerald-50 font-medium text-emerald-800" : "text-slate-600"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 hidden lg:mt-auto lg:block">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              InvestLab
            </p>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">Usuário autorizado</p>
            <p className="text-xs text-slate-500">Área pessoal</p>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
