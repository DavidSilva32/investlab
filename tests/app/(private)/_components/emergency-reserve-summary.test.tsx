// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmergencyReserveSummary } from "@/app/(private)/_components/emergency-reserve-summary";
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

    expect(html).toContain("Reserva de emergência");
    expect(html).toContain("Cobertura em meses");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("2,5 meses de despesas");
    expect(html).toContain("Sua meta pessoal");
    expect(html).toContain("6 meses");
    expect(html).toContain("meta que você escolheu");
    expect(html).toContain("42% da sua meta pessoal");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Cobertura em relação à sua meta pessoal");
    expect(html).toContain("Ver reserva");
    expect(html).not.toContain('href="/carteira?panel=objectives');
  });

  it("opens the reserve panel through the provided dashboard action", () => {
    const onOpenReserve = vi.fn();
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        onOpenReserve={onOpenReserve}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));

    expect(onOpenReserve).toHaveBeenCalledOnce();
  });

  it("keeps configured reserve information visible without an edit action in read-only mode", () => {
    render(<EmergencyReserveSummary calculation={calculation} readOnly />);

    expect(screen.getByText("6 meses")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver reserva" })).toBeNull();
  });

  it("keeps the reserve link safe when no dashboard panel action is provided", () => {
    render(<EmergencyReserveSummary calculation={calculation} />);

    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));

    expect(screen.getByRole("button", { name: "Ver reserva" })).toBeTruthy();
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

    expect(html).toContain("2,5 meses de despesas");
    expect(html).toContain("Sem meta pessoal configurada");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("recomendação do InvestLab");
  });

  it("shows all four reserve coverage horizons and the calculated essential reference", async () => {
    const data = {
      ...calculation,
      targetMonths: null,
      targetValue: null,
      difference: null,
      essentialMonthlyExpenses: 850,
      essentialExpenseSources: [
        {
          id: "rent",
          description: "Aluguel",
          frequency: "Mensal",
          amount: 850,
          monthlyEquivalent: 850,
        },
      ],
      horizons: [3, 6, 9, 12].map((months) => ({
        months: months as 3 | 6 | 9 | 12,
        targetValue: 850 * months,
        targetValueCents: String(85000 * months),
        difference: 850 * months - 2500,
        differenceCents: String(85000 * months - 250000),
      })),
    };
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary calculation={data} />,
    );

    expect(html).toContain("Cenários de cobertura da reserva");
    expect(html).toContain("3 meses");
    expect(html).toContain("6 meses");
    expect(html).toContain("9 meses");
    expect(html).toContain("12 meses");
    expect(html).not.toContain("R$ 850,00 por mês");

    render(<EmergencyReserveSummary calculation={data} />);
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Origem, cálculo e limitações" }),
      );
    expect(screen.getByText(/mínimo estimado pelas recorrências/)).toBeTruthy();
    expect(screen.getByText(/Aluguel \(Mensal\)/)).toBeTruthy();
    expect(
      screen.getByText(/não projetam aportes ou rendimentos/),
    ).toBeTruthy();
  });

  it("renders all horizon difference states and unavailable references", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          selectedValue: 6000,
          coveredMonths: 6,
          targetMonths: null,
          targetValue: null,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
          horizons: [
            {
              months: 3,
              targetValue: null,
              targetValueCents: null,
              difference: null,
              differenceCents: null,
            },
            {
              months: 6,
              targetValue: 6500,
              targetValueCents: "650000",
              difference: 500,
              differenceCents: "50000",
            },
            {
              months: 9,
              targetValue: 5500,
              targetValueCents: "550000",
              difference: -500,
              differenceCents: "-50000",
            },
            {
              months: 12,
              targetValue: 6000,
              targetValueCents: "600000",
              difference: 0,
              differenceCents: "0",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Sem referência");
    expect(html).toContain("Faltam R$ 500,00");
    expect(html).toContain("R$ 500,00 acima");
    expect(html).toContain("Valor atingido");
  });

  it("describes coverage above the configured personal target", () => {
    const html = renderToStaticMarkup(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          selectedValue: 7000,
          coveredMonths: 7,
          difference: -1000,
          progressPercentage: 116.7,
          status: "above_target",
        }}
      />,
    );

    expect(html).toContain("7 meses de despesas");
    expect(html).toContain("A cobertura está R$ 1.000,00 acima da meta");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("117% da sua meta pessoal");
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
    expect(html).toContain("100% da sua meta pessoal");
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
    expect(screen.getByText(/ponto de partida é 6 meses/)).toBeTruthy();
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
          horizons: [
            {
              months: 3,
              targetValue: 3000,
              targetValueCents: "300000",
              difference: 500,
              differenceCents: "50000",
            },
            {
              months: 6,
              targetValue: 2000,
              targetValueCents: "200000",
              difference: -500,
              differenceCents: "-50000",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Estimativa parcial: 2,5 meses de despesas");
    expect(html).toContain("A comparação com sua meta está incompleta");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("% da sua meta pessoal");
    expect(html).toContain("Origem, cálculo e limitações");
    expect(html).toContain("R$ 3.000,00");
    expect(html).not.toContain("Faltam R$ 500,00");
    expect(html).not.toContain("R$ 500,00 acima");
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
