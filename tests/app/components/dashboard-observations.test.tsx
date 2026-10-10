// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardObservations } from "@/app/_components/dashboard-observations";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import {
  getPortfolioInsights,
  type PortfolioInsightPosition,
} from "@/lib/portfolio-insights";

const emptyReserve: EmergencyReserveCalculation = {
  monthlyExpenses: 1000,
  targetMonths: 3,
  selectedValue: 2000,
  selectedGroups: 1,
  unvaluedGroups: 0,
  referenceDate: "2026-09-01",
  targetValue: 3000,
  coveredMonths: 2,
  difference: 1000,
  progressPercentage: 66.7,
  status: "below_target",
};

function renderObservations(
  positions: PortfolioInsightPosition[],
  emergencyReserve?: EmergencyReserveCalculation,
) {
  return renderToStaticMarkup(
    <DashboardObservations
      positions={positions}
      insights={getPortfolioInsights(
        positions,
        new Date("2026-09-30T12:00:00-03:00"),
      )}
      emergencyReserve={emergencyReserve}
    />,
  );
}

describe("DashboardObservations", () => {
  afterEach(cleanup);

  it("shows supported portfolio facts and links to the portfolio", () => {
    const html = renderObservations([
      {
        product: "CDB Banco A",
        institution: "Banco A",
        maturityAt: "2030-01-01",
        totalValue: "100",
        referenceDate: "2026-09-01",
      },
      {
        product: "Tesouro Selic",
        institution: "Tesouro",
        maturityAt: "2026-10-01",
        totalValue: "300",
        referenceDate: "2026-09-01",
      },
    ]);

    expect(html).toContain("O que merece atenção");
    expect(html).toContain("Não há pontos de atenção identificados");
    expect(html).toContain("Fatos da carteira");
    expect(html).not.toContain("Leitura da carteira");
    expect(html).not.toContain("Dados registrados");
    expect(html).toContain("Maior posição na carteira conhecida");
    expect(html).toContain("Próximo vencimento informado");
    expect(html).toContain("Tesouro Selic · 01/10/2026");
    expect(html).toContain('href="/portfolio"');
  });

  it("limits interpretation when positions have no current values", () => {
    const html = renderObservations([
      {
        product: "Ativo sem valor",
        institution: null,
        maturityAt: null,
        totalValue: null,
      },
    ]);

    expect(html).toContain(
      "A leitura fica limitada enquanto houver posições sem valor atual.",
    );
    expect(html).toContain('href="/portfolio"');
    expect(html).not.toContain("Fatos da carteira");
  });

  it("explains when there are no positions to inspect", () => {
    const html = renderObservations([]);

    expect(html).toContain(
      "Ainda não há posições conhecidas para identificar pontos de atenção.",
    );
    expect(html).not.toContain('href="/portfolio"');
    expect(html).not.toContain("Fatos da carteira");
  });

  it("calls out incomplete reserve data before other observations", () => {
    const html = renderObservations(
      [
        {
          product: "CDB",
          institution: "Banco A",
          maturityAt: null,
          totalValue: "100",
        },
      ],
      { ...emptyReserve, unvaluedGroups: 1 },
    );

    expect(html).toContain("Os dados da reserva estão incompletos");
    expect(html).not.toContain("A reserva está abaixo da sua meta pessoal");
  });

  it("explains a reserve shortfall as the user's own personal goal", () => {
    const html = renderObservations(
      [
        {
          product: "CDB",
          institution: "Banco A",
          maturityAt: null,
          totalValue: "100",
        },
      ],
      emptyReserve,
    );

    expect(html).toContain("A reserva está abaixo da sua meta pessoal");
    expect(html).toContain("não é uma recomendação do InvestLab");
  });

  it("keeps a known position fact when no maturity was informed", () => {
    const html = renderObservations([
      {
        product: "CDB Banco A",
        institution: "Banco A",
        maturityAt: null,
        totalValue: "100",
      },
    ]);

    expect(html).toContain("Maior posição na carteira conhecida");
    expect(html).not.toContain("Próximo vencimento informado");
  });
});
