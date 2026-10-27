// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
    config: Record<string, unknown>;
  }) => <div {...props}>{children}</div>,
  ChartTooltip: ({
    content,
  }: {
    content: React.ReactElement<{
      valueFormatter?: (value: unknown) => React.ReactNode;
    }>;
  }) => <span>{content.props.valueFormatter?.("5000.00")}</span>,
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
  formatFinancialHistoryTick,
} from "@/app/(private)/financas/_components/financial-history";

afterEach(cleanup);

describe("FinancialHistory", () => {
  it("includes the year in abbreviated month ticks", () => {
    expect(formatFinancialHistoryTick("2025-01")).not.toBe(
      formatFinancialHistoryTick("2026-01"),
    );
  });

  it("preserves missing months as unavailable and explains recorded-only history", () => {
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
        selectedMonth="2026-10"
        explanation="Os meses sem registros não representam valores zero."
      />,
    );

    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBe(3);
    expect(
      screen.getByText("Os meses sem registros não representam valores zero."),
    ).toBeTruthy();
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
            recordedBalance: "1800.00",
          },
          {
            month: "2026-10",
            realizedIncome: null,
            realizedExpenses: "120.00",
            recordedBalance: null,
          },
        ]}
        selectedMonth="2026-10"
        explanation="Comparação limitada aos meses com registros."
      />,
    );

    expect(
      screen.getByLabelText(
        "Gráfico de entradas e saídas realizadas nos últimos 12 meses",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Entradas").length).toBeGreaterThan(0);
    expect(
      within(
        screen.getByLabelText(
          "Gráfico de entradas e saídas realizadas nos últimos 12 meses",
        ),
      ).getByText(/5\.000,00/),
    ).toBeTruthy();
    expect(screen.getAllByText("Sem registro").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeNull();
    expect(
      screen.getByText("Comparação limitada aos meses com registros."),
    ).toBeTruthy();
  });
});
