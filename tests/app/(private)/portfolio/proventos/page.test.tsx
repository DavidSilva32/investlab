import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    title,
  }: React.PropsWithChildren<{ title: string }>) => (
    <main data-title={title}>{children}</main>
  ),
}));
vi.mock("@/app/(private)/portfolio/_components/portfolio-navigation", () => ({
  PortfolioNavigation: ({ activeView }: { activeView: string }) => (
    <nav>navigation:{activeView}</nav>
  ),
}));
vi.mock("@/app/(private)/portfolio/_components/portfolio-proventos", () => ({
  PortfolioProventos: () => <section>proventos</section>,
}));

import PortfolioProventosPage from "@/app/(private)/portfolio/proventos/page";

describe("PortfolioProventosPage", () => {
  it("renders the proventos view inside the portfolio shell", () => {
    const html = renderToStaticMarkup(PortfolioProventosPage());

    expect(html).toContain('data-title="Carteira"');
    expect(html).toContain("navigation:proventos");
    expect(html).toContain("proventos");
  });
});
