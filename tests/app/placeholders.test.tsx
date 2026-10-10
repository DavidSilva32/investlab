// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/portfolio-import", () => ({
  PortfolioImport: () => <div>importador</div>,
}));

import AnalysesPage from "@/app/analyses/page";
import ImportsPage from "@/app/imports/page";
import SettingsPage from "@/app/settings/page";

function renderWithQueryClient(element: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>,
  );
}

describe("secondary pages", () => {
  it("renders each planned area with its context", async () => {
    const imports = renderWithQueryClient(<ImportsPage />);
    expect(imports).toContain("importador");
    expect(imports).not.toContain("Importe posições ou movimentações da B3");
    expect(
      renderWithQueryClient(
        await AnalysesPage({ searchParams: Promise.resolve({}) }),
      ),
    ).toContain("Minha carteira");
    expect(renderWithQueryClient(<SettingsPage />)).toContain(
      "Fundamentos e cadastro",
    );
  });

  it("opens a shared analysis with the ticker from the query string", async () => {
    const markup = renderWithQueryClient(
      await AnalysesPage({
        searchParams: Promise.resolve({ ticker: "VALE3" }),
      }),
    );
    expect(markup).toContain('value="VALE3"');
  });
});
