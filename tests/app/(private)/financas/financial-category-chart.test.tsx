// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
    config: unknown;
  }) => <div {...props}>{children}</div>,
  ChartTooltip: ({
    content,
  }: {
    content: React.ReactElement<{
      valueFormatter?: (value: unknown) => React.ReactNode;
    }>;
  }) => (
    <span data-testid="category-chart-tooltip">
      {content.props.valueFormatter?.("120.00")}
    </span>
  ),
  ChartTooltipContent: () => null,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => (
    <span data-testid="chart-cell" data-fill={fill} />
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { FinancialCategoryChart } from "@/app/(private)/financas/_components/financial-category-chart";

afterEach(cleanup);

describe("FinancialCategoryChart", () => {
  it("shows category values and switches between expenses and income", async () => {
    const user = userEvent.setup();
    render(
      <FinancialCategoryChart
        expenses={[
          {
            categoryId: "investment",
            categoryName: "Investimentos",
            amount: "120.00",
          },
          { categoryId: "food", categoryName: "Alimentação", amount: "30.00" },
        ]}
        income={[
          { categoryId: "salary", categoryName: "Salário", amount: "500.00" },
        ]}
      />,
    );

    expect(screen.getByText("Investimentos")).toBeTruthy();
    expect(screen.getByText(/150,00/)).toBeTruthy();
    expect(screen.getByTestId("category-chart-tooltip").textContent).toContain(
      "120,00",
    );
    expect(screen.getAllByTestId("chart-cell")).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Entradas" }));

    expect(screen.getByText("Salário")).toBeTruthy();
    expect(screen.getAllByText(/500,00/)).toHaveLength(2);
    expect(screen.queryByText("Investimentos")).toBeNull();
    expect(
      screen.getByLabelText("Gráfico de rosca de entradas por categoria"),
    ).toBeTruthy();
  });

  it("shows an empty state when the selected flow has no realized categories", async () => {
    const user = userEvent.setup();
    render(<FinancialCategoryChart income={[]} expenses={[]} />);

    expect(
      screen.getByText(/Ainda não há saídas realizadas neste mês/),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Entradas" }));
    expect(screen.getByText(/ainda não há entradas/i)).toBeTruthy();
  });
});
