"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  Upload,
  WalletCards,
} from "lucide-react";
import { useAdminSupportView } from "@/components/app-shell";
import { PortfolioImport } from "@/components/portfolio-import";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

export type PortfolioView = "overview" | "positions" | "movements";

export function PortfolioNavigation({
  activeView,
}: {
  activeView: PortfolioView;
}) {
  const supportView = useAdminSupportView();
  const [importOpen, setImportOpen] = useState(false);
  const canImport = supportView === false;

  return (
    <div className="mb-6 flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between">
      <nav
        className="flex min-w-0 gap-1 overflow-x-auto sm:flex-1"
        aria-label="Visões da carteira"
      >
        <PortfolioLink href="/carteira" active={activeView === "overview"}>
          <ChartNoAxesCombined aria-hidden="true" className="size-4" />
          Visão geral
        </PortfolioLink>
        <PortfolioLink
          href="/carteira?view=positions"
          active={activeView === "positions"}
        >
          <WalletCards aria-hidden="true" className="size-4" />
          Posições
        </PortfolioLink>
        <PortfolioLink
          href="/carteira?view=movements"
          active={activeView === "movements"}
        >
          <ArrowLeftRight aria-hidden="true" className="size-4" />
          Movimentações
        </PortfolioLink>
      </nav>
      <Sheet
        open={importOpen && canImport}
        onOpenChange={(open) => {
          if (canImport) setImportOpen(open);
        }}
      >
        {canImport && (
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0 self-start sm:self-auto"
            >
              <Upload aria-hidden="true" className="size-4" />
              Importar dados
            </Button>
          </SheetTrigger>
        )}
        <SheetContent
          side="right"
          className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden p-4 sm:max-w-6xl sm:p-6"
        >
          <SheetHeader className="mb-5 shrink-0 pr-8">
            <SheetTitle>Importar e conciliar</SheetTitle>
            <SheetDescription>
              Revise os dados do arquivo e escolha como tratar cada
              correspondência antes de confirmar.
            </SheetDescription>
          </SheetHeader>
          <div
            aria-label="Importação e conciliação"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            role="region"
          >
            <PortfolioImport readOnly={!canImport} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PortfolioLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
