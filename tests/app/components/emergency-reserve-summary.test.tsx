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
  progressPercentage: 100 / 6,
  status: "below_target",
};

describe("EmergencyReserveSummary", () => {
  afterEach(cleanup);
  it("explains setup when the personal goal is not configured", () => {
    const html = renderToStaticMarkup(<EmergencyReserveSummary />);

    expect(html).toContain("custo mensal");
    expect(html).toContain("sua meta em meses");
    expect(html).toContain('href="/portfolio"');
  });

  it("shows coverage, personal target, calculation, date, and caveats", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary calculation={calculation} />,
    );

    expect(html).toContain("2.5 meses");
    expect(html).toContain("Meta pessoal · 6 meses");
    expect(html).toContain("01/09/2026");
    expect(html).toContain("Posição registrada");
    expect(html).toContain("Prazo e resgate não verificados.");
    expect(html).toContain("<progress");
  });

  it("shows the calculation method only when requested", async () => {
    const user = userEvent.setup();
    render(<EmergencyReserveSummary calculation={calculation} />);
    const trigger = screen.getByRole("button", { name: /Como .* calculado/ });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Meses cobertos = valor selecionado/)).toBeTruthy();
    expect(screen.getByText(/valor selecionado/)).toBeTruthy();
    expect(screen.getByText(/universal/)).toBeTruthy();
  });

  it("reports the excess and groups whose positions have no value", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          selectedValue: 7000,
          coveredMonths: 7,
          difference: -1000,
          progressPercentage: 100,
          unvaluedGroups: 1,
          missingSelectionCount: 1,
          status: "above_target",
        }}
      />,
    );

    expect(html).toContain("Acima da meta configurada");
    expect(html).toContain("1 grupo(s) selecionado(s)");
    expect(html).toContain("não entra(m) no cálculo");
  });

  it("labels a goal that is exactly met", () => {
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

    expect(html).toContain("Diferença para a meta");
    expect(html).toContain("R$");
  });
  it("asks for a positive monthly cost before dividing into months", () => {
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

    expect(html).toContain("custo mensal maior que zero");
  });
});
