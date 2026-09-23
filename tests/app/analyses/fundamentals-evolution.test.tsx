// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FundamentalsEvolution } from "@/app/analyses/_components/fundamentals-evolution";

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
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("FundamentalsEvolution", () => {
  it("charts annual DFP series separately and keeps exact values visible", () => {
    render(
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
    expect(screen.getAllByText(/1\.000\.000,00/).length).toBeGreaterThan(0);
    expect(
      document.querySelector("[data-years='2024,2025,2026']"),
    ).toBeTruthy();
    expect(screen.getAllByText("Não informado").length).toBeGreaterThan(0);
  });

  it("renders nothing when annual statements are absent", () => {
    const { container } = render(<FundamentalsEvolution periods={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
