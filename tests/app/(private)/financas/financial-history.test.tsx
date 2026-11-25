// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TooltipProps } from "recharts";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
    config: Record<string, unknown>;
  }) => <div {...props}>{children}</div>,
  ChartTooltip: () => <span data-testid="history-tooltip" />,
  ChartTooltipContent: () => null,
}));
vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
import {
  FinancialHistory,
  FinancialHistoryTooltip,
  formatFinancialHistoryTick,
} from "@/app/(private)/financas/_components/financial-history";

afterEach(cleanup);

describe("FinancialHistory", () => {
  it("includes the year in abbreviated month ticks", () => {
    expect(formatFinancialHistoryTick("2025-01")).not.toBe(
      formatFinancialHistoryTick("2026-01"),
    );
  });

  it("shows monthly results in the tooltip and handles unavailable values", () => {
    const { rerender } = render(
      <FinancialHistoryTooltip active={false} payload={[]} />,
    );
    expect(screen.queryByText(/setembro de 2026/i)).toBeNull();

    rerender(<FinancialHistoryTooltip active payload={[]} />);
    expect(screen.queryByText(/setembro de 2026/i)).toBeNull();

    const unavailableValues = [
      {
        payload: {
          fullMonth: "2026-09",
          entradas: null,
          saidas: 3200,
          resultado: null,
        },
      },
    ] as unknown as TooltipProps<number, string>["payload"];
    rerender(<FinancialHistoryTooltip active payload={unavailableValues} />);

    expect(screen.getByText("setembro de 2026")).toBeTruthy();
    expect(screen.getByText("Entradas: Sem registro")).toBeTruthy();
    expect(screen.getByText(/Saídas:.*3\.200,00/)).toBeTruthy();
    expect(screen.getByText("Resultado do período: Sem registro")).toBeTruthy();
  });

  it("preserves missing months as unavailable without redundant helper copy", () => {
    render(
      <FinancialHistory
        months={[
          {
            month: "2026-10",
            realizedIncome: null,
            realizedExpenses: null,
            recordedBalance: null,
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Histórico realizado" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Mostra entradas e saídas realizadas; previsões não entram neste histórico.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBe(3);
    expect(
      screen.queryByText(/meses sem registros não representam valores zero/),
    ).toBeNull();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("shows the recorded comparison chart when at least one value exists", () => {
    render(
      <FinancialHistory
        months={[
          {
            month: "2026-09",
            realizedIncome: "5000.00",
            realizedExpenses: "3200.00",
            recordedBalance: "-1800.00",
          },
          {
            month: "2026-10",
            realizedIncome: null,
            realizedExpenses: "120.00",
            recordedBalance: null,
          },
        ]}
      />,
    );

    expect(
      screen.getByLabelText(
        "Gráfico de entradas e saídas realizadas nos últimos 12 meses",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Entradas").length).toBeGreaterThan(0);
    const historyTable = screen.getByRole("table", {
      name: "Valores mensais do histórico realizado",
    });
    expect(within(historyTable).getByText(/5\.000,00/)).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBeGreaterThan(0);
    expect(within(historyTable).getByText("Resultado do período")).toBeTruthy();
    expect(within(historyTable).getByText(/1\.800,00/)).toBeTruthy();
    expect(screen.getByTestId("history-tooltip")).toBeTruthy();
    expect(
      screen.queryByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeNull();
  });
});
