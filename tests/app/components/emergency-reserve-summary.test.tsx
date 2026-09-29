// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

const calculation: EmergencyReserveCalculation = {
  monthlyExpenses: 1000,
  targetMonths: 6,
  selectedValue: 2500,
  selectedGroups: 2,
  unvaluedGroups: 0,
  referenceDate: "2026-09-01",
  targetValue: 6000,
  coveredMonths: 2.5,
  difference: 3500,
  progressPercentage: (2.5 / 6) * 100,
  status: "below_target",
};

describe("EmergencyReserveSummary", () => {
  afterEach(cleanup);

  it("shows coverage and the personal target with a visual progress bar", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary calculation={calculation} />,
    );

    expect(html).toContain("2.5 meses de despesas");
    expect(html).toContain("Sua meta: 6 meses");
    expect(html).toContain("meta que você escolheu");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Cobertura em relação à sua meta pessoal");
    expect(html).toContain('href="/portfolio"');
  });

  it("calculates and shows months even without a personal target", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          targetMonths: null,
          targetValue: null,
          coveredMonths: 2.5,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
        }}
      />,
    );

    expect(html).toContain("2.5 meses de despesas");
    expect(html).toContain("Sem meta pessoal configurada");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("recomendação do InvestLab");
  });

  it("describes coverage above the configured personal target", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          selectedValue: 7000,
          coveredMonths: 7,
          difference: -1000,
          progressPercentage: 100,
          status: "above_target",
        }}
      />,
    );

    expect(html).toContain("7.0 meses de despesas");
    expect(html).toContain("A cobertura está R$ 1.000,00 acima da meta");
  });

  it("describes a personal target that is exactly reached", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          selectedValue: 6000,
          coveredMonths: 6,
          difference: 0,
          progressPercentage: 100,
          status: "on_target",
        }}
      />,
    );

    expect(html).toContain("Sua meta pessoal está atingida.");
  });

  it("keeps methodology and liquidity limitations under disclosure", async () => {
    const user = userEvent.setup();
    render(<EmergencyReserveSummary calculation={calculation} />);
    const trigger = screen.getByRole("button", {
      name: "Origem, cálculo e limitações",
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByText(/divide o valor conhecido das posições/),
    ).toBeTruthy();
    expect(
      screen.getByText(/não verifica carência, resgate ou prazo/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Data-base dos valores: 01\/09\/2026/),
    ).toBeTruthy();
  });

  it("shows why coverage cannot be calculated when expenses are absent", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          monthlyExpenses: null,
          coveredMonths: null,
          targetValue: null,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
        }}
      />,
    );

    expect(html).toContain("Informe suas despesas mensais");
  });

  it("reports reserve data unavailability without asking the user to add expenses", () => {
    const html = renderToStaticMarkup(<EmergencyReserveSummary />);

    expect(html).toContain("Não foi possível carregar os dados da reserva");
    expect(html).not.toContain("Informe suas despesas mensais");
  });

  it("preserves the limitation when selected positions have incomplete values", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          unvaluedGroups: 1,
          missingSelectionCount: 1,
        }}
      />,
    );

    expect(html).toContain("Estimativa parcial: 2.5 meses de despesas");
    expect(html).toContain("A comparação com sua meta está incompleta");
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain("Origem, cálculo e limitações");
    expect(html).not.toContain("contêm posições sem valor");
  });

  it("reveals incomplete-selection reasons when details are opened", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          unvaluedGroups: 1,
          missingSelectionCount: 2,
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Origem, cálculo e limitações" }),
    );
    expect(screen.getByText(/contêm posições sem valor/)).toBeTruthy();
    expect(screen.getByText(/2 seleção\(ões\) salva\(s\)/)).toBeTruthy();
  });

  it("explains that non-positive expenses cannot be used", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          monthlyExpenses: 0,
          coveredMonths: null,
          progressPercentage: null,
          status: "expenses_required",
        }}
      />,
    );

    expect(html).toContain("maiores que zero");
  });
});
