// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceHistoryChart } from "@/app/analyses/_components/price-history-chart";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
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
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("PriceHistoryChart", () => {
  it("renders an official chart with the supplied chronological points", () => {
    render(
      <PriceHistoryChart
        points={[
          { date: "2026-01-01", close: 10 },
          { date: "2026-01-02", close: 11 },
        ]}
      />,
    );
    expect(
      screen.getByLabelText("Gráfico do histórico de preço de fechamento"),
    ).toBeTruthy();
    expect(screen.getByTestId("price-chart").dataset.points).toBe(
      "2026-01-01,2026-01-02",
    );
  });

  it("explains when the selected interval has insufficient history", () => {
    render(<PriceHistoryChart points={[{ date: "2026-01-01", close: 10 }]} />);
    expect(screen.getByText(/não há histórico suficiente/i)).toBeTruthy();
  });
});
