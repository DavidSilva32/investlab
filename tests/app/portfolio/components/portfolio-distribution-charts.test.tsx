// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: () => <div data-testid="bar-chart" />,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { PortfolioDistributionCharts } from "@/app/portfolio/_components/portfolio-distribution-charts";

const institutions = Array.from({ length: 5 }, (_, index) => ({
  label: `Banco ${index + 1}`,
  value: (7 - index) * 100,
  percentage: ((7 - index) / 28) * 100,
})).concat([{ label: "Demais instituições", value: 300, percentage: 10.7 }]);

describe("PortfolioDistributionCharts", () => {
  it("shows amounts and shares and uses the right remainder label per distribution", () => {
    render(
      <PortfolioDistributionCharts
        institutionItems={institutions}
        classItems={[
          { label: "Renda fixa", value: 300, percentage: 30 },
          { label: "Ações", value: 150, percentage: 15 },
          { label: "Fundos", value: 100, percentage: 10 },
          { label: "ETFs", value: 50, percentage: 5 },
          { label: "Exterior", value: 50, percentage: 5 },
          { label: "Demais classes", value: 100, percentage: 10 },
        ]}
        unclassifiedValue={300}
        unclassifiedPercentage={30}
        loading={false}
      />,
    );

    expect(screen.getByText("Onde está · por instituição")).toBeTruthy();
    expect(screen.getByText("Como se distribui · por classe")).toBeTruthy();
    expect(screen.getByText("Banco 1")).toBeTruthy();
    expect(screen.getByText(/700,00 · 25,0%/)).toBeTruthy();
    expect(screen.getByText("Demais instituições")).toBeTruthy();
    expect(screen.getAllByText(/300,00 · 10,7%/)).toHaveLength(2);
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText(/300,00 · 30,0%/)).toBeTruthy();
    expect(screen.getByText("Demais classes")).toBeTruthy();
    expect(screen.getByText(/sem classe informada/)).toBeTruthy();
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(12);
  });

  it("keeps the class chart loading, unavailable and empty states distinct", () => {
    const { rerender } = render(
      <PortfolioDistributionCharts
        institutionItems={[]}
        classItems={null}
        unclassifiedValue={null}
        unclassifiedPercentage={null}
        loading
      />,
    );
    expect(screen.getByText("Carregando distribuição…")).toBeTruthy();

    rerender(
      <PortfolioDistributionCharts
        institutionItems={[]}
        classItems={null}
        unclassifiedValue={null}
        unclassifiedPercentage={null}
        loading={false}
      />,
    );
    expect(
      screen.getByText("Não foi possível carregar esta distribuição."),
    ).toBeTruthy();

    rerender(
      <PortfolioDistributionCharts
        institutionItems={[]}
        classItems={[]}
        unclassifiedValue={0}
        unclassifiedPercentage={0}
        loading={false}
      />,
    );
    expect(
      screen.getAllByText(
        "Ainda não há valores conhecidos para mostrar a distribuição.",
      ),
    ).toHaveLength(1);
    expect(
      screen.getByText("Não há valores classificados disponíveis."),
    ).toBeTruthy();
    expect(
      screen.queryByText(/R\$\s*0,00 \(0%\) sem classe informada/),
    ).toBeNull();
  });

  it("shows a safe zero percentage when the backend omitted that summary", () => {
    render(
      <PortfolioDistributionCharts
        institutionItems={[]}
        classItems={[]}
        unclassifiedValue={100}
        unclassifiedPercentage={null}
        loading={false}
      />,
    );

    expect(screen.getByText(/100,00 \(0%\) sem classe informada/)).toBeTruthy();
  });
});
