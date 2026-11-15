// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinancialCapacitySummary } from "@/app/(private)/financas/_components/financial-capacity-summary";

afterEach(cleanup);

describe("FinancialCapacitySummary", () => {
  const baseProps = {
    monthLabel: "novembro de 2026",
    expectedBalance: "2000.00",
    historicalMonth: false,
    simulation: null,
  };

  it("shows a concise strategy panel and warns about unrecorded commitments", () => {
    render(<FinancialCapacitySummary {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: "Distribuição pela estratégia" }),
    ).toBeTruthy();
    expect(screen.getByText("novembro de 2026")).toBeTruthy();
    expect(
      screen.getByText(
        /A simulação usa a estratégia, as posições e a Reserva atuais\. Compromissos não cadastrados podem não estar incluídos/u,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("R$ 2.000,00")).toBeNull();
  });

  it("does not replace missing values with zero", () => {
    render(<FinancialCapacitySummary {...baseProps} expectedBalance={null} />);

    expect(
      screen.getByText(/Valores sem registro não são tratados como zero/u),
    ).toBeTruthy();
  });

  it("explains a zero forecast without showing a strategy distribution", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        expectedBalance="0.00"
        simulation={{ ...readySimulation, state: "ready" }}
      />,
    );

    expect(
      screen.getByText(/não mostram saldo previsto para simular/u),
    ).toBeTruthy();
    expect(screen.queryByText("Simulação pela sua estratégia")).toBeNull();
  });

  it("does not project current holdings into a past month", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        historicalMonth={true}
        simulation={{ ...readySimulation, state: "ready" }}
      />,
    );

    expect(
      screen.getByText(/Meses passados não recebem simulação/u),
    ).toBeTruthy();
    expect(screen.queryByText("Simulação pela sua estratégia")).toBeNull();
  });

  it("does not show a strategy simulation for a negative balance", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        expectedBalance="-100.00"
        simulation={{ ...readySimulation, state: "ready" }}
      />,
    );

    expect(
      screen.getByText(/não há saldo para simular uma distribuição/u),
    ).toBeTruthy();
    expect(screen.queryByText("Simulação pela sua estratégia")).toBeNull();
  });

  it("shows an explanation when a strategy is not active", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "unavailable" }}
      />,
    );

    expect(
      screen.getByText(/Ative sua estratégia de longo prazo/u),
    ).toBeTruthy();
  });

  it("shows the pending state while the strategy simulation is loading", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "loading" }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Calculando uma simulação pela sua estratégia",
    );
  });

  it("shows a client-safe message when the strategy simulation fails", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "error" }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Não foi possível calcular a simulação agora.",
    );
  });

  it("shows a non-persistent strategy scenario by reserve and asset class", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "ready" }}
      />,
    );

    expect(screen.getByText("Simulação pela sua estratégia")).toBeTruthy();
    expect(
      screen.getByText(
        "Cenário informativo; não cria lançamentos nem executa aportes.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Reserva")).toBeTruthy();
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a reserve-only scenario when the existing reserve priority consumes the amount", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{
          ...readySimulation,
          state: "reserve-priority",
          reserveContributionCents: "125000",
          allocations: [],
        }}
      />,
    );

    expect(
      screen.getByText(/Simulação pela prioridade da Reserva/u),
    ).toBeTruthy();
    expect(screen.getByText(/R\$\s*1\.250,00/u)).toBeTruthy();
    expect(
      screen.getByText(/não cria lançamentos nem executa aportes/u),
    ).toBeTruthy();
  });

  it("treats an absent reserve amount as zero in a reserve-priority explanation", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{
          ...readySimulation,
          state: "reserve-priority",
          reserveContributionCents: null,
          allocations: [],
        }}
      />,
    );

    expect(screen.getByText(/R\$\s*0,00 à Reserva/u)).toBeTruthy();
  });

  it("shows the amount that remains unallocated by the active strategy", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{
          ...readySimulation,
          state: "unallocated",
          reserveContributionCents: "0",
          allocations: [],
          unallocatedContributionCents: "75000",
        }}
      />,
    );

    expect(screen.getByText(/deixa R\$\s*750,00 sem alocação/u)).toBeTruthy();
  });

  it("formats simulation cents without converting them to floating-point reais", () => {
    render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{
          ...readySimulation,
          state: "ready",
          reserveContributionCents: "9007199254740993",
          allocations: [],
          unallocatedContributionCents: "0",
        }}
      />,
    );

    expect(screen.getByText(/90\.071\.992\.547\.409,93/u)).toBeTruthy();
  });

  it("explains missing portfolio and reserve data before presenting a distribution", () => {
    const { rerender } = render(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "portfolio-incomplete" }}
      />,
    );
    expect(
      screen.getByText(
        /posições de Longo Prazo com valor e classificação completos/u,
      ),
    ).toBeTruthy();

    rerender(
      <FinancialCapacitySummary
        {...baseProps}
        simulation={{ ...readySimulation, state: "reserve-incomplete" }}
      />,
    );
    expect(
      screen.getByText(
        /faltam dados para aplicar a prioridade atual da Reserva/u,
      ),
    ).toBeTruthy();
  });
});

const readySimulation = {
  reserveContributionCents: "50000",
  allocations: [
    { label: "Renda fixa", contributionValueCents: "125000" },
    { label: "Ações e BDRs", contributionValueCents: "0" },
  ],
  unallocatedContributionCents: "75000",
};
