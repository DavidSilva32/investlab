// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundamentalsEvolution } from "@/app/analyses/_components/fundamentals-evolution";
import type { AnalysisPeriod } from "@/app/analyses/_components/stock-analysis-types";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config,
  }: {
    children: React.ReactNode;
    config: Record<string, { color?: string }>;
  }) => (
    <div
      data-testid="chart-config-colors"
      data-colors={Object.values(config)
        .map(({ color }) => color)
        .join(",")}
    >
      {children}
    </div>
  ),
  ChartTooltipContent: ({
    formatter,
    labelFormatter,
  }: {
    formatter?: (value: unknown) => React.ReactNode;
    labelFormatter?: (
      label: unknown,
      payload: ReadonlyArray<{ payload?: unknown }>,
    ) => React.ReactNode;
  }) => (
    <>
      <span data-testid="exact-tooltip">{formatter?.(1000000)}</span>
      <span data-testid="tooltip-source-label">
        {labelFormatter?.("2026", [
          {
            payload: {
              periodLabel: "2026",
              referenceDate: "2026-06-30",
              sourceDocument: "ITR",
              isPartial: true,
            },
          },
        ])}
      </span>
      <span data-testid="tooltip-equity-label">
        {labelFormatter?.("2026", [
          {
            payload: {
              periodLabel: "2026",
              referenceDate: "2026-06-30",
              sourceDocument: "ITR",
              isPartial: true,
            },
          },
        ])}
      </span>
      <span data-testid="tooltip-fallback-label">
        {labelFormatter?.("Ano sem fonte", [])}
      </span>
      <span data-testid="tooltip-default-label">
        {labelFormatter?.("2025", [
          {
            payload: {
              periodLabel: "2025",
              referenceDate: null,
              isPartial: false,
            },
          },
        ])}
      </span>
    </>
  ),
}));

vi.mock("recharts", () => ({
  Bar: ({
    children,
    isAnimationActive,
  }: {
    children: React.ReactNode;
    isAnimationActive: boolean;
  }) => (
    <div
      data-testid="fundamental-bar"
      data-animation={String(isAnimationActive)}
    >
      {children}
    </div>
  ),
  Cell: ({ fillOpacity }: { fillOpacity?: number }) => (
    <span data-testid="bar-cell-opacity" data-opacity={fillOpacity} />
  ),
  BarChart: ({
    data,
    children,
  }: {
    data: Array<{
      periodLabel: string;
      revenue: number | null;
      netIncome: number | null;
      equity: number | null;
      sourceDocument: string | null;
      referenceDate: string | null;
      isPartial: boolean;
    }>;
    children: React.ReactNode;
  }) => (
    <div
      data-periods={data.map((point) => point.periodLabel).join(",")}
      data-revenue={data.map((point) => point.revenue ?? "").join(",")}
      data-net-income={data.map((point) => point.netIncome ?? "").join(",")}
      data-equity={data.map((point) => point.equity ?? "").join(",")}
      data-sources={data.map((point) => point.sourceDocument ?? "").join(",")}
      data-references={data.map((point) => point.referenceDate ?? "").join(",")}
      data-partial={data.map((point) => String(point.isPartial)).join(",")}
    >
      {children}
    </div>
  ),
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  XAxis: () => null,
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }) => (
    <span data-testid="compact-tick">{tickFormatter?.(1000000)}</span>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FundamentalsEvolution", () => {
  const annualPeriods = (): AnalysisPeriod[] =>
    [2022, 2023, 2024, 2025].map((year) => ({
      referenceDate: `${year}-12-31`,
      sourceDocument: "DFP" as const,
      periodType: "annual" as const,
      periodBasis: "annual" as const,
      revenue: String(year * 100),
      netIncome: String(year * 10),
      equity: year === 2022 ? null : String(year * 1000),
    }));

  const periods = (): AnalysisPeriod[] => [
    ...annualPeriods(),
    {
      referenceDate: "2022-09-30",
      sourceDocument: "ITR" as const,
      periodType: "interim" as const,
      periodBasis: "year_to_date" as const,
      revenue: null,
      netIncome: null,
      equity: "22000",
    },
    {
      referenceDate: "2024-06-30",
      sourceDocument: "ITR" as const,
      periodType: "interim" as const,
      periodBasis: "year_to_date" as const,
      revenue: null,
      netIncome: null,
      equity: "24000",
    },
    {
      referenceDate: "2024-09-30",
      sourceDocument: "ITR" as const,
      periodType: "interim" as const,
      periodBasis: "year_to_date" as const,
      revenue: null,
      netIncome: null,
      equity: "24500",
    },
    {
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      sourceDocument: "ITR" as const,
      periodType: "interim" as const,
      periodBasis: "year_to_date" as const,
      revenue: "450",
      netIncome: "45",
      equity: "26000",
    },
  ];

  it("animates only multiple real values and honors reduced motion", () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
    const { rerender } = render(
      <FundamentalsEvolution periods={annualPeriods()} />,
    );
    expect(
      screen
        .getAllByTestId("fundamental-bar")
        .every((bar) => bar.dataset.animation === "true"),
    ).toBe(true);
    rerender(<FundamentalsEvolution periods={annualPeriods().slice(0, 1)} />);
    expect(
      screen
        .getAllByTestId("fundamental-bar")
        .every((bar) => bar.dataset.animation === "false"),
    ).toBe(true);
    media.matches = true;
    rerender(<FundamentalsEvolution periods={annualPeriods()} />);
    expect(
      screen
        .getAllByTestId("fundamental-bar")
        .every((bar) => bar.dataset.animation === "false"),
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("shows five complete aligned years, uses one balance per year, and labels the partial year simply", () => {
    const { container } = render(<FundamentalsEvolution periods={periods()} />);

    const charts = container.querySelectorAll(
      "[data-periods='2022,2023,2024,2025,2026']",
    );
    expect(charts).toHaveLength(3);
    expect(charts[0].getAttribute("data-revenue")).toBe(
      "202200,202300,202400,202500,450",
    );
    expect(charts[1].getAttribute("data-net-income")).toBe(
      "20220,20230,20240,20250,45",
    );
    expect(charts[2].getAttribute("data-equity")).toBe(
      "22000,2023000,2024000,2025000,26000",
    );
    expect(charts[2].getAttribute("data-references")).toBe(
      "2022-09-30,2023-12-31,2024-12-31,2025-12-31,2026-06-30",
    );
    expect(charts[0].getAttribute("data-sources")).toBe(",,,,");
    expect(charts[2].getAttribute("data-partial")).toBe(
      "false,false,false,false,true",
    );
    expect(
      [...container.querySelectorAll('[data-testid="bar-cell-opacity"]')]
        .map((cell) => cell.getAttribute("data-opacity"))
        .filter((opacity) => opacity === "0.62"),
    ).toHaveLength(3);
    expect(screen.getAllByTestId("tooltip-source-label")[0].textContent).toBe(
      "2026 · Período parcial",
    );
    expect(screen.getAllByTestId("tooltip-equity-label")[2].textContent).toBe(
      "Data-base: 30/06/2026",
    );
    expect(screen.getAllByTestId("tooltip-fallback-label")[0].textContent).toBe(
      "Ano sem fonte",
    );
    expect(screen.getAllByTestId("tooltip-default-label")[0].textContent).toBe(
      "2025",
    );
    expect(container.textContent).not.toMatch(/DFP|ITR|1S 2026/);
    expect(screen.getAllByTestId("exact-tooltip")).toHaveLength(3);
  });

  it("keeps five year categories when one year has no source value", () => {
    const recentPeriods = periods().filter(
      (period) => period.referenceDate.slice(0, 4) !== "2022",
    );
    const { container } = render(
      <FundamentalsEvolution periods={recentPeriods} />,
    );

    const charts = container.querySelectorAll(
      "[data-periods='2022,2023,2024,2025,2026']",
    );
    expect(charts).toHaveLength(3);
    expect(charts[0].getAttribute("data-revenue")).toBe(
      ",202300,202400,202500,450",
    );
    expect(charts[1].getAttribute("data-net-income")).toBe(
      ",20230,20240,20250,45",
    );
    expect(charts[2].getAttribute("data-equity")).toBe(
      ",2023000,2024000,2025000,26000",
    );
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("keeps valid annual balances ahead of intermediate balances and ignores invalid partial flows", () => {
    const { container } = render(
      <FundamentalsEvolution
        periods={[
          ...annualPeriods().filter(
            (period) => period.referenceDate.slice(0, 4) !== "2022",
          ),
          {
            referenceDate: "2024-06-30",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: null,
            netIncome: null,
            equity: "24000",
          },
          {
            referenceDate: "2026-06-30",
            periodStart: "2026-04-01",
            periodEnd: "2026-06-30",
            sourceDocument: "ITR",
            periodType: "interim",
            periodBasis: "quarterly",
            revenue: "999",
            netIncome: "99",
            equity: "26000",
          },
          {
            referenceDate: "2026-09-30",
            sourceDocument: "ITR",
            periodType: "interim",
            periodBasis: "year_to_date",
            isDerived: true,
            revenue: "9999",
            netIncome: "999",
            equity: "99999",
          },
        ]}
      />,
    );

    const charts = [...container.querySelectorAll("[data-periods]")];
    expect(charts).toHaveLength(3);
    expect(charts.map((chart) => chart.getAttribute("data-periods"))).toEqual([
      "2022,2023,2024,2025,2026",
      "2022,2023,2024,2025,2026",
      "2022,2023,2024,2025,2026",
    ]);
    expect(charts[0].getAttribute("data-revenue")).toBe(
      ",202300,202400,202500,",
    );
    expect(charts[2].getAttribute("data-equity")).toBe(
      ",2023000,2024000,2025000,26000",
    );
  });

  it("keeps annual equity-only records out of flows while displaying their balance", () => {
    const annualFlowsWithoutEquity: AnalysisPeriod[] = [
      {
        referenceDate: "2023-12-31",
        periodType: "annual",
        periodBasis: "annual",
        sourceDocument: "DFP",
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        revenue: null,
        netIncome: null,
        equity: "3000",
      },
      {
        referenceDate: "2024-12-31",
        periodType: "annual",
        periodBasis: "annual",
        sourceDocument: "DFP",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        revenue: "100",
        netIncome: "10",
        equity: null,
      },
      {
        referenceDate: "2025-12-31",
        periodType: "annual",
        periodBasis: "annual",
        sourceDocument: "DFP",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        revenue: "200",
        netIncome: "20",
        equity: null,
      },
    ];

    const { container } = render(
      <FundamentalsEvolution periods={annualFlowsWithoutEquity} />,
    );

    const charts = [...container.querySelectorAll("[data-periods]")];
    expect(charts).toHaveLength(3);
    expect(charts[0].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[0].getAttribute("data-revenue")).toBe(",,100,200,");
    expect(charts[1].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[1].getAttribute("data-net-income")).toBe(",,10,20,");
    expect(charts[2].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[2].getAttribute("data-equity")).toBe(",3000,,,");
  });

  it("ignores unsupported periods, invalid numeric values, and malformed equity dates", () => {
    const partialAndInvalidPeriods: AnalysisPeriod[] = [
      {
        referenceDate: "2025-12-31",
        periodType: "annual",
        periodBasis: "annual",
        sourceDocument: "DFP",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        revenue: "100",
        netIncome: "not-a-number",
        equity: "not-a-number",
      },
      {
        referenceDate: "2026-06-30",
        periodType: "interim",
        periodBasis: "unknown",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        revenue: "999",
        netIncome: "99",
        equity: null,
      },
      {
        referenceDate: "2026-02-30",
        periodType: "interim",
        periodBasis: "unknown",
        sourceDocument: "ITR",
        periodStart: null,
        revenue: null,
        netIncome: null,
        equity: "999999",
      },
      {
        referenceDate: "2026/06/30",
        periodType: "interim",
        periodBasis: "unknown",
        sourceDocument: "ITR",
        periodStart: null,
        revenue: null,
        netIncome: null,
        equity: "888888",
      },
    ];

    const { container } = render(
      <FundamentalsEvolution periods={partialAndInvalidPeriods} />,
    );

    const charts = [...container.querySelectorAll("[data-periods]")];
    expect(charts).toHaveLength(1);
    expect(charts[0].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[0].getAttribute("data-revenue")).toBe(",,,100,");
    expect(
      screen.getByText(
        "Não há valores de lucro líquido disponíveis para os períodos selecionados.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Não há saldos de patrimônio líquido disponíveis para os períodos selecionados.",
      ),
    ).toBeTruthy();
  });

  it("selects the latest current-year values by reference date and filing date", () => {
    const currentYearFilings: AnalysisPeriod[] = [
      {
        referenceDate: "2026-03-31",
        periodType: "interim",
        periodBasis: "year_to_date",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        filingReferenceDate: "2026-05-01",
        periodEnd: "2026-03-31",
        revenue: "100",
        netIncome: "10",
        equity: "30000",
      },
      {
        referenceDate: "2026-06-30",
        periodType: "interim",
        periodBasis: "year_to_date",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        filingReferenceDate: "2026-08-01",
        periodEnd: "2026-06-30",
        revenue: "200",
        netIncome: "20",
        equity: "40000",
      },
      {
        referenceDate: "2026-06-30",
        periodType: "interim",
        periodBasis: "year_to_date",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        filingReferenceDate: "2026-08-15",
        periodEnd: "2026-06-30",
        revenue: "250",
        netIncome: "25",
        equity: "55000",
      },
      {
        referenceDate: "2026-06-30",
        periodType: "interim",
        periodBasis: "year_to_date",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        revenue: "1",
        netIncome: "1",
        equity: "100",
      },
      {
        referenceDate: "2026-06-30",
        periodType: "interim",
        periodBasis: "year_to_date",
        sourceDocument: "ITR",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        revenue: "2",
        netIncome: "2",
        equity: "200",
      },
      {
        referenceDate: "2026-99-99",
        periodType: "interim",
        periodBasis: "unknown",
        sourceDocument: "ITR",
        periodStart: null,
        filingReferenceDate: "2026-09-01",
        revenue: null,
        netIncome: null,
        equity: "999999",
      },
    ];

    const { container } = render(
      <FundamentalsEvolution periods={currentYearFilings} />,
    );

    const charts = [...container.querySelectorAll("[data-periods]")];
    expect(charts).toHaveLength(3);
    expect(charts[0].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[0].getAttribute("data-revenue")).toBe(",,,,250");
    expect(charts[1].getAttribute("data-net-income")).toBe(",,,,25");
    expect(charts[2].getAttribute("data-equity")).toBe(",,,,55000");
    expect(charts[2].getAttribute("data-references")).toBe(",,,,2026-06-30");
  });

  it("uses a current-year YTD period when only net income is available", () => {
    const { container } = render(
      <FundamentalsEvolution
        periods={[
          {
            referenceDate: "2026-03-31",
            periodType: "interim",
            periodBasis: "year_to_date",
            sourceDocument: "ITR",
            periodStart: "2026-01-01",
            periodEnd: "2026-03-31",
            revenue: null,
            netIncome: "12",
            equity: null,
          },
        ]}
      />,
    );

    const charts = [...container.querySelectorAll("[data-periods]")];
    expect(charts).toHaveLength(1);
    expect(charts[0].getAttribute("data-periods")).toBe(
      "2022,2023,2024,2025,2026",
    );
    expect(charts[0].getAttribute("data-net-income")).toBe(",,,,12");
  });

  it("shows a simple status when no periods arrive", () => {
    render(<FundamentalsEvolution periods={[]} />);
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent?.includes(
            "Não há dados suficientes para mostrar a evolução dos fundamentos financeiros.",
          ),
        ),
    ).toBe(true);
  });
});
