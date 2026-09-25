// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
  it("explains setup when the personal goal is not configured", () => {
    const html = renderToStaticMarkup(<EmergencyReserveSummary />);

    expect(html).toContain("custo mensal");
    expect(html).toContain("meta pessoal");
    expect(html).toContain('href="/portfolio"');
  });

  it("shows coverage, personal target, calculation, date, and caveats", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary calculation={calculation} />,
    );

    expect(html).toContain("2.5 meses");
    expect(html).toContain("Meta pessoal · 6 meses");
    expect(html).toContain("valor selecionado ÷ custo mensal");
    expect(html).toContain("01/09/2026");
    expect(html).toContain("não representa uma recomendação universal");
    expect(html).toContain("prazo nem condições de resgate");
    expect(html).toContain("<progress");
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
