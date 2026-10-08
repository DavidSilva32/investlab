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
    data: Array<{
      periodLabel: string;
      equity: number | null;
      sourceDocument?: string;
    }>;
    children: React.ReactNode;
  }) => (
    <div
      data-periods={data.map((point) => point.periodLabel).join(",")}
      data-equity={data.map((point) => point.equity ?? "").join(",")}
      data-sources={data.map((point) => point.sourceDocument ?? "").join(",")}
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
          {
            referenceDate: "2025-12-31",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: null,
            netIncome: null,
            equity: "620000",
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
      document.querySelector("[data-periods='2024,2025,2026']"),
    ).toBeTruthy();
    const equityChart = document.querySelector(
      "[data-periods='31/12/2024,30/06/2025,31/12/2025,31/12/2026']",
    );
    expect(equityChart?.getAttribute("data-sources")).toBe("DFP,ITR,DFP,DFP");
    expect(equityChart?.getAttribute("data-equity")).toBe(
      "500000,550000,610000,0",
    );
    expect(screen.getAllByTestId("compact-tick").length).toBe(3);
  });

  it("shows a status when neither annual statements nor equity balances exist", () => {
    render(<FundamentalsEvolution periods={[]} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Não há demonstrativos anuais ou saldos de patrimônio líquido disponíveis nos dados recebidos.",
    );
  });

  it("labels an annual-only equity series as DFP", () => {
    render(
      <FundamentalsEvolution
        periods={[
          {
            referenceDate: "2025-12-31",
            sourceDocument: "DFP",
            periodType: "annual",
            periodBasis: "annual",
            revenue: "120",
            netIncome: "12",
            equity: "500",
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Saldos anuais DFP, identificados pela data-base real."),
    ).toBeTruthy();
  });

  it("shows dated ITR balances when annual DFP equity is absent", () => {
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
            referenceDate: "2026-03-31",
            filingReferenceDate: "2026-05-01",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: null,
            netIncome: null,
            equity: "450",
          },
          {
            referenceDate: "2026-03-31",
            filingReferenceDate: "2026-05-15",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: null,
            netIncome: null,
            equity: "460",
          },
          {
            referenceDate: "2026-06-30",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: "70",
            netIncome: "7",
            equity: "500",
          },
          {
            referenceDate: "2026-12-31",
            sourceDocument: "ITR",
            periodType: "interim",
            isDerived: true,
            revenue: "90",
            netIncome: "9",
            equity: "600",
          },
          {
            referenceDate: "2026-99-99",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: "100",
            netIncome: "10",
            equity: "700",
          },
          {
            referenceDate: "2026-09-30",
            sourceDocument: "ITR",
            periodType: "annual",
            revenue: "100",
            netIncome: "10",
            equity: "800",
          },
          {
            referenceDate: "2026-09-30",
            sourceDocument: "ITR",
            periodType: "interim",
            revenue: "not-a-number",
            netIncome: null,
            equity: "not-a-number",
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "Saldos intermediários ITR, identificados pela data-base real.",
      ),
    ).toBeTruthy();
    expect(
      container.querySelectorAll('[data-testid="chart-config-colors"]'),
    ).toHaveLength(3);
    expect(container.querySelector("[data-periods='2024,2025']")).toBeTruthy();
    expect(
      container.querySelector("[data-periods='31/03/2026,30/06/2026']"),
    ).toBeTruthy();
    expect(
      container
        .querySelector("[data-periods='31/03/2026,30/06/2026']")
        ?.getAttribute("data-equity"),
    ).toBe("460,500");
    expect(
      container
        .querySelector("[data-periods='31/03/2026,30/06/2026']")
        ?.getAttribute("data-sources"),
    ).toBe("ITR,ITR");
  });
});
