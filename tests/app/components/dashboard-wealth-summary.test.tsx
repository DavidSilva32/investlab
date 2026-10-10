// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardWealthSummary } from "@/app/_components/dashboard-wealth-summary";
import { getPortfolioInsights } from "@/lib/portfolio-insights";

describe("DashboardWealthSummary", () => {
  afterEach(cleanup);

  it("shows known wealth, valued position count, and the shared reference date", () => {
    const positions = [
      {
        product: "Tesouro Selic",
        institution: "Tesouro",
        maturityAt: null,
        totalValue: "2500",
        referenceDate: "2026-09-01",
      },
    ];
    const html = renderToStaticMarkup(
      <DashboardWealthSummary
        positions={positions}
        insights={getPortfolioInsights(positions)}
      />,
    );

    expect(html).toContain("Patrimônio conhecido");
    expect(html).toContain("R$");
    expect(html).toContain("1 de 1");
    expect(html).toContain("Dados de 01/09/2026");
    expect(html).not.toContain(
      "Patrimônio da carteira que o InvestLab conhece",
    );
    expect(html).not.toContain("Dos valores registrados");
  });

  it("shows mixed or incomplete dates and values missing from the known total", () => {
    const positions = [
      {
        product: "CDB",
        institution: null,
        maturityAt: null,
        totalValue: "2500",
        referenceDate: "2026-09-01",
      },
      {
        product: "Ativo sem valor",
        institution: null,
        maturityAt: null,
        totalValue: null,
        referenceDate: null,
      },
    ];
    const html = renderToStaticMarkup(
      <DashboardWealthSummary
        positions={positions}
        insights={getPortfolioInsights(positions)}
      />,
    );

    expect(html).toContain("1 de 2");
    expect(html).toContain("1 sem valor atual");
    expect(html).toContain("Datas-base variadas ou incompletas");
  });

  it("explains when there are no known values or reference dates", () => {
    const html = renderToStaticMarkup(
      <DashboardWealthSummary
        positions={[]}
        insights={getPortfolioInsights([])}
      />,
    );

    expect(html).toContain("Ainda sem valores conhecidos");
    expect(html).toContain("0 de 0");
    expect(html).toContain("Não informada");
  });
});
