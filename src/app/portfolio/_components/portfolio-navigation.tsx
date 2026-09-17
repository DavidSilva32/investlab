import Link from "next/link";

export type PortfolioView = "overview" | "positions" | "movements";

export function PortfolioNavigation({
  activeView,
}: {
  activeView: PortfolioView;
}) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      <PortfolioLink href="/portfolio" active={activeView === "overview"}>
        Visão geral
      </PortfolioLink>
      <PortfolioLink
        href="/portfolio?view=positions"
        active={activeView === "positions"}
      >
        Posições
      </PortfolioLink>
      <PortfolioLink
        href="/portfolio?view=movements"
        active={activeView === "movements"}
      >
        Movimentações
      </PortfolioLink>
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
      className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
