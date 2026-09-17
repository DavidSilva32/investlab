import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => <main data-title={title}>{children}</main>,
}));

import PortfolioLoading from "@/app/portfolio/loading";

describe("PortfolioLoading", () => {
  it("keeps the Carteira shell and presents an accessible skeleton immediately", () => {
    const html = renderToStaticMarkup(<PortfolioLoading />);
    expect(html).toContain('data-title="Carteira"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Carregando carteira");
    expect((html.match(/animate-pulse/g) ?? []).length).toBeGreaterThan(8);
  });
});
