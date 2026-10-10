// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("opens financial context with keyboard focus", async () => {
    const user = userEvent.setup();
    const positions = [
      {
        product: "CDB",
        institution: null,
        maturityAt: null,
        totalValue: "100",
      },
    ];
    render(
      <DashboardObservations
        positions={positions}
        insights={getPortfolioInsights(
          positions,
          new Date("2026-09-30T12:00:00Z"),
        )}
      />,
    );
    await user.tab();
    const explanation = screen.getByRole("button", {
      name: "Participação no valor conhecido. Distribuição não mede risco.",
    });
    expect(document.activeElement).toBe(explanation);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    expect(explanation.className).toContain("focus-visible:ring-2");
  });
  it("shows compact facts and accessible financial limitations", () => {
    const html = renderObservations([
      {
        product: "CDB",
        institution: null,
        totalValue: "100",
        maturityAt: "2030-01-01",
      },
      {
        product: "Tesouro",
        institution: null,
        totalValue: "300",
        maturityAt: "2026-10-01",
      },
    ]);
    expect(html).toContain("Fatos da carteira");
    expect(html).toContain("Maior posição");
    expect(html).toContain("75.0%");
    expect(html).toContain("Próximo vencimento");
    expect(html).toContain("01/10/2026");
    expect(html).toContain("Distribuição não mede risco");
    expect(html).toContain("não confirma disponibilidade");
    expect(html).toContain('href="/portfolio?view=positions"');
    expect(html).not.toContain("O que merece atenção");
  });
  it("does not add a redundant empty state when values are unknown or positions absent", () => {
    expect(renderObservations([])).toBe("");
    expect(
      renderObservations([
        {
          product: "Sem valor",
          institution: null,
          maturityAt: null,
          totalValue: null,
        },
      ]),
    ).toBe("");
  });
  it("keeps only the largest position when no maturity exists and does not repeat reserve alerts", () => {
    const html = renderObservations(
      [
        {
          product: "CDB",
          institution: null,
          maturityAt: null,
          totalValue: "100",
        },
      ],
      {
        ...emptyReserve,
        unvaluedGroups: 1,
      },
    );
    expect(html).toContain("Maior posição");
    expect(html).not.toContain("Próximo vencimento");
    expect(html).not.toContain("reserva");
  });
  it("shows a maturity without inventing a value for an unvalued position", () => {
    const html = renderObservations([
      {
        product: "Sem valor",
        institution: null,
        totalValue: null,
        maturityAt: "2026-10-01",
      },
    ]);
    expect(html).toContain("Próximo vencimento");
    expect(html).not.toContain("Maior posição");
  });
});
