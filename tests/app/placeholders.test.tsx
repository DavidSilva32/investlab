// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
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
import { ComingSoonPage } from "@/components/coming-soon-page";

describe("secondary pages", () => {
  it("renders each planned area with its context", () => {
    expect(renderToStaticMarkup(<ImportsPage />)).toContain(
      "Importe posições ou movimentações da B3",
    );
    expect(renderToStaticMarkup(<AnalysesPage />)).toContain(
      "análises da sua carteira",
    );
    expect(renderToStaticMarkup(<SettingsPage />)).toContain(
      "configurações da sua conta",
    );
  });

  it("renders the reusable empty-state presentation", () => {
    expect(
      renderToStaticMarkup(
        <ComingSoonPage title="Teste" description="Contexto" />,
      ),
    ).toContain("Em desenvolvimento");
  });
});
