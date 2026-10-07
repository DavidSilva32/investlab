// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FundamentalsEvolution } from "@/app/analyses/_components/fundamentals-evolution";

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
  }: {
    formatter?: (value: unknown) => React.ReactNode;
  }) => <span data-testid="exact-tooltip">{formatter?.(1000000)}</span>,
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({
    data,
    children,
  }: {
    data: Array<{ year: string }>;
    children: React.ReactNode;
  }) => (
    <div data-years={data.map((point) => point.year).join(",")}>{children}</div>
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

describe("FundamentalsEvolution", () => {
  it("charts annual DFP series separately and formats exact tooltip values", () => {
    const { container } = render(
      <FundamentalsEvolution
        periods={[
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2025-12-31",
            sourceDocument: "DFP",
            revenue: "1200000",
            netIncome: "150000",
            equity: "600000",
          },
          {
            referenceDate: "2025-12-31",
            filingReferenceDate: "2026-04-01",
            sourceDocument: "DFP",
            revenue: "1250000",
            netIncome: "155000",
            equity: "610000",
          },
          {
            referenceDate: "2026-12-31",
            sourceDocument: "DFP",
            revenue: null,
            netIncome: "not-a-number",
            equity: "0",
          },
          {
            referenceDate: "2025-06-30",
            sourceDocument: "ITR",
            revenue: "700000",
            netIncome: "70000",
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.getAllByText("Receita").length).toBeGreaterThan(0);
    expect(screen.getByText("Lucro líquido")).toBeTruthy();
    expect(screen.getByText("Patrimônio líquido")).toBeTruthy();
    expect(screen.getAllByTestId("exact-tooltip").length).toBe(3);
    expect(
      screen
        .getAllByTestId("chart-config-colors")
        .map((chart) => chart.getAttribute("data-colors")),
    ).toEqual([
      "var(--chart-category-1)",
      "var(--chart-category-5)",
      "var(--chart-category-4)",
    ]);
    expect(
      document.querySelector("[data-years='2024,2025,2026']"),
    ).toBeTruthy();
    expect(screen.getAllByTestId("compact-tick").length).toBe(3);
  });

  it("renders nothing when annual statements are absent", () => {
    const { container } = render(<FundamentalsEvolution periods={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an accessible unavailable state for annual equity without mixing ITR", () => {
    const { container } = render(
      <FundamentalsEvolution
        periods={[
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "100",
            netIncome: "10",
            equity: null,
          },
          {
            referenceDate: "2025-12-31",
            sourceDocument: "DFP",
            revenue: "120",
            netIncome: "12",
            equity: null,
          },
          {
            referenceDate: "2026-06-30",
            sourceDocument: "ITR",
            revenue: "70",
            netIncome: "7",
            equity: "500",
          },
        ]}
      />,
    );

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Não há valores anuais de patrimônio líquido disponíveis nos demonstrativos DFP.",
    );
    expect(
      container.querySelectorAll('[data-testid="chart-config-colors"]'),
    ).toHaveLength(2);
    expect(container.querySelector("[data-years='2024,2025']")).toBeTruthy();
  });
});
