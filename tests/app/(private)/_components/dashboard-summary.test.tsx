// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardSummary } from "@/app/(private)/_components/dashboard-summary";
import type { DashboardObjective } from "@/app/(private)/_components/dashboard-destinations-overview";
import {
  getPortfolioInsights,
  type PortfolioInsightPosition,
} from "@/lib/portfolio-insights";

const positions: PortfolioInsightPosition[] = [
  {
    product: "CDB Banco A",
    institution: "Banco A",
    maturityAt: "2030-01-01",
    totalValue: "100",
    referenceDate: "2026-09-01",
  },
];
const objectives: DashboardObjective[] = [
  {
    id: "trip",
    name: "Viagem",
    kind: "CUSTOM",
    currentValue: 14200.99,
    targetAmount: 16000,
    balanceTracking: {
      observedAmountCents: "1420099",
      observedOn: "2026-11-14",
    },
  },
];

function renderDashboard(input: {
  positions?: PortfolioInsightPosition[];
  objectives?: typeof objectives;
  reserve?: boolean;
  onObjectivesOpenChange?: (open: boolean) => void;
  onOpenReserve?: () => void;
  onOpenImport?: () => void;
  supportReadOnly?: boolean;
  supportChecking?: boolean;
  supportCheckError?: boolean;
  destinationsLoading?: boolean;
  destinationsUnavailable?: boolean;
  onRetryDestinations?: () => void;
}) {
  const {
    positions: currentPositions = positions,
    objectives: currentObjectives = objectives,
    reserve = true,
    ...props
  } = input;
  return render(
    <DashboardSummary
      positions={currentPositions}
      insights={getPortfolioInsights(
        currentPositions,
        new Date("2026-11-14T12:00:00-03:00"),
      )}
      objectives={currentObjectives}
      emergencyReserve={
        reserve
          ? {
              monthlyExpenses: 4650,
              targetMonths: 12,
              balance: 56042.48,
              referenceDate: "2026-11-14",
              targetValue: 55800,
              coveredMonths: 12.05,
              difference: -242.48,
              progressPercentage: 100,
              status: "above_target",
            }
          : undefined
      }
      reserveObservation={
        reserve
          ? { observedAmountCents: "5604248", observedOn: "2026-11-14" }
          : null
      }
      {...props}
    />,
  );
}

describe("DashboardSummary", () => {
  afterEach(cleanup);

  it("shows first-access guidance when the holdings list is empty", () => {
    renderDashboard({ positions: [], objectives: [], reserve: false });
    expect(screen.getByText("Sua carteira começa aqui")).toBeTruthy();
    expect(
      screen.getAllByText("Importar arquivo da B3").length,
    ).toBeGreaterThan(0);
  });

  it("shows goal balances separately from the holdings and reserve", () => {
    renderDashboard({});
    expect(screen.getByText("Viagem")).toBeTruthy();
    expect(screen.getByText("R$ 14.200,99")).toBeTruthy();
    expect(screen.getByText("Reserva de emergência")).toBeTruthy();
    expect(
      screen.getByText(/Saldos informados para objetivos não são somados/u),
    ).toBeTruthy();
  });

  it("shows a missing balance without treating it as zero", () => {
    renderDashboard({
      objectives: [
        { ...objectives[0]!, currentValue: null, balanceTracking: null },
      ],
    });
    expect(screen.getByText("Saldo não informado")).toBeTruthy();
    expect(screen.getByText(/Informe o saldo do banco/u)).toBeTruthy();
  });

  it.each([
    { supportReadOnly: true },
    { supportChecking: true },
    { supportCheckError: true },
  ])(
    "hides dashboard editing actions while support access is read-only",
    (state) => {
      renderDashboard({ positions: [], objectives, reserve: false, ...state });
      expect(
        screen.queryByRole("button", { name: "Ver objetivos" }),
      ).toBeNull();
    },
  );

  it("opens objectives and reserve actions from the first-access dashboard", () => {
    const onObjectivesOpenChange = vi.fn();
    const onOpenReserve = vi.fn();
    const onOpenImport = vi.fn();
    renderDashboard({
      positions: [],
      objectives,
      onObjectivesOpenChange,
      onOpenReserve,
      onOpenImport,
    });

    fireEvent.click(screen.getByRole("button", { name: "Ver objetivos" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar dados da B3" }),
    );

    expect(onObjectivesOpenChange).toHaveBeenCalledWith(true);
    expect(onOpenReserve).toHaveBeenCalledOnce();
    expect(onOpenImport).toHaveBeenCalledOnce();
  });

  it("opens objectives and prioritizes missing position values after first access", () => {
    const onObjectivesOpenChange = vi.fn();
    renderDashboard({
      onObjectivesOpenChange,
      positions: [{ ...positions[0]!, totalValue: null }],
    });

    screen
      .getAllByRole("button", { name: "Ver objetivos" })
      .forEach((button) => fireEvent.click(button));

    expect(onObjectivesOpenChange).toHaveBeenCalledTimes(2);
    expect(onObjectivesOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("Revise as posições sem valor atual")).toBeTruthy();
  });

  it("shows reserve setup as a next action when the observed reserve needs settings", () => {
    render(
      <DashboardSummary
        positions={positions}
        insights={getPortfolioInsights(positions)}
        emergencyReserve={{
          monthlyExpenses: null,
          targetMonths: 6,
          balance: null,
          referenceDate: null,
          targetValue: null,
          coveredMonths: null,
          difference: null,
          progressPercentage: null,
          status: "expenses_required",
        }}
        reserveObservation={{
          observedAmountCents: "250000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(screen.getByText("Complete a configuração da reserva")).toBeTruthy();
  });

  it("shows an observed reserve alone on first access and omits it when no data exists", () => {
    const { rerender } = renderDashboard({
      positions: [],
      objectives: [],
      reserve: true,
    });
    expect(screen.getByText("Reserva de emergência")).toBeTruthy();

    rerender(
      <DashboardSummary
        positions={[]}
        insights={getPortfolioInsights([])}
        objectives={[]}
      />,
    );
    expect(screen.queryByText("Reserva de emergência")).toBeNull();
    expect(screen.queryByText("Objetivos")).toBeNull();
  });

  it("safely invokes default action callbacks when optional handlers are omitted", () => {
    renderDashboard({});

    screen
      .getAllByRole("button", { name: "Ver objetivos" })
      .forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Importar e conciliar" }),
    );

    expect(screen.getByText("Viagem")).toBeTruthy();
  });

  it("shows a reserve with settings on first access even before its balance is observed", () => {
    render(
      <DashboardSummary
        positions={[]}
        insights={getPortfolioInsights([])}
        objectives={[]}
        emergencyReserve={{
          monthlyExpenses: null,
          targetMonths: 6,
          balance: null,
          referenceDate: null,
          targetValue: null,
          coveredMonths: null,
          difference: null,
          progressPercentage: null,
          status: "balance_required",
        }}
      />,
    );

    expect(screen.getByText("Reserva de emergência")).toBeTruthy();
    expect(screen.getByText(/Informe o saldo atual da Reserva/)).toBeTruthy();
  });

  it("does not show an unconfigured reserve on first access", () => {
    render(
      <DashboardSummary
        positions={[]}
        insights={getPortfolioInsights([])}
        objectives={[]}
        emergencyReserve={{
          monthlyExpenses: null,
          targetMonths: null,
          balance: null,
          referenceDate: null,
          targetValue: null,
          coveredMonths: null,
          difference: null,
          progressPercentage: null,
          status: "not_configured",
        }}
      />,
    );

    expect(screen.queryByText("Reserva de emergência")).toBeNull();
  });
});
