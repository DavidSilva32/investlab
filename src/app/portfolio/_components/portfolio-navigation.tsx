import Link from "next/link";

import { ArrowLeftRight, ChartNoAxesCombined, WalletCards } from "lucide-react";

export type PortfolioView = "overview" | "positions" | "movements";

export function PortfolioNavigation({
  activeView,
}: {
  activeView: PortfolioView;
}) {
  return (
    <nav
      className="mb-6 flex gap-1 overflow-x-auto border-b"
      aria-label="Visões da carteira"
    >
      <PortfolioLink href="/portfolio" active={activeView === "overview"}>
        <ChartNoAxesCombined aria-hidden="true" className="size-4" />
        Visão geral
      </PortfolioLink>
      <PortfolioLink
        href="/portfolio?view=positions"
        active={activeView === "positions"}
      >
        <WalletCards aria-hidden="true" className="size-4" />
        Posições
      </PortfolioLink>
      <PortfolioLink
        href="/portfolio?view=movements"
        active={activeView === "movements"}
      >
        <ArrowLeftRight aria-hidden="true" className="size-4" />
        Movimentações
      </PortfolioLink>
    </nav>
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
