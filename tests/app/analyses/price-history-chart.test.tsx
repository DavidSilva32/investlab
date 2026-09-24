// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceHistoryChart } from "@/app/analyses/_components/price-history-chart";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: ({ stroke }: { stroke: string }) => (
    <div data-stroke={stroke} data-testid="price-line" />
  ),
  Legend: () => null,
  LineChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: Array<{ date: string }>;
  }) => (
    <div
      data-points={data.map((point) => point.date).join(",")}
      data-testid="price-chart"
    >
      {children}
    </div>
  ),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  XAxis: ({ tickFormatter }: { tickFormatter: (value: string) => string }) => (
    <span data-testid="month-label">{tickFormatter("2026-01-01")}</span>
  ),
  YAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => (
    <span data-testid="price-label">{tickFormatter(10)}</span>
  ),
}));

describe("PriceHistoryChart", () => {
  it("renders the chronological points with a visible theme color", () => {
    render(
      <PriceHistoryChart
        points={[
          { date: "2026-01-01", close: 10 },
          { date: "2026-01-02", close: 11 },
        ]}
      />,
    );

    const chart = screen.getByLabelText(
      /Gr.fico do hist.rico de pre.o de fechamento/,
    );
    expect(chart).toBeTruthy();
    expect(screen.getByTestId("price-chart").dataset.points).toBe(
      "2026-01-01,2026-01-02",
    );
    expect(chart.querySelector("style")?.textContent).toContain(
      "--color-close: var(--primary)",
    );
    expect(screen.getByTestId("price-line").dataset.stroke).toBe(
      "var(--color-close)",
    );
    expect(screen.getByTestId("month-label").textContent).toMatch(/jan/i);
    expect(screen.getByTestId("price-label").textContent).toContain("10,00");
    expect(screen.getByTestId("tooltip-label").textContent).toMatch(
      /01 de jan\. de 2026.*10,00/,
    );
  });

  it("explains when the selected interval has insufficient history", () => {
    render(<PriceHistoryChart points={[{ date: "2026-01-01", close: 10 }]} />);
    expect(screen.getByText(/hist.rico suficiente/i)).toBeTruthy();
  });
});
vi.mock("@/components/ui/chart", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui/chart")>(
    "@/components/ui/chart",
  );
  return {
    ...actual,
    ChartTooltipContent: ({
      labelFormatter,
      formatter,
    }: {
      labelFormatter: (value: string) => string;
      formatter: (value: number) => string;
    }) => (
      <div data-testid="tooltip-label">
        {labelFormatter("2026-01-01")}{" "}
        {labelFormatter(2026 as unknown as string)} {formatter(10)}
      </div>
    ),
  };
});
