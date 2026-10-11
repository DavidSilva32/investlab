// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config,
    ...props
  }: React.PropsWithChildren<
    {
      config: { share: { color: string } };
    } & Record<string, unknown>
  >) => (
    <div {...props} data-series-color={config.share.color}>
      {children}
    </div>
  ),
}));

vi.mock("recharts", () => ({
  Bar: ({
    background,
    isAnimationActive,
  }: {
    background: { fill: string };
    isAnimationActive: boolean;
  }) => (
    <span
      data-testid="bar-track"
      data-fill={background.fill}
      data-animation={String(isAnimationActive)}
    />
  ),
  BarChart: ({ children }: React.PropsWithChildren) => (
    <div data-testid="bar-chart">{children}</div>
  ),
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
  afterEach(cleanup);
  it("animates distributions only with multiple known categories", () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
    const props = {
      institutionItems: institutions,
      classItems: [],
      unclassifiedValue: 0,
      unclassifiedPercentage: 0,
      loading: false,
    };
    const { rerender } = render(<PortfolioDistributionCharts {...props} />);
    expect(
      screen
        .getAllByTestId("bar-track")
        .every((bar) => bar.dataset.animation === "true"),
    ).toBe(true);
    rerender(
      <PortfolioDistributionCharts
        {...props}
        institutionItems={institutions.slice(0, 1)}
      />,
    );
    expect(screen.getByTestId("bar-track").dataset.animation).toBe("false");
    media.matches = true;
    rerender(<PortfolioDistributionCharts {...props} />);
    expect(
      screen
        .getAllByTestId("bar-track")
        .every((bar) => bar.dataset.animation === "false"),
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("uses generic category colors and accessible shares with visible amounts", () => {
    const classItems = [
      ...portfolioAssetClassOptions.map((label) => ({
        label,
        value: label === portfolioAssetClassOptions[0] ? 300 : 50,
        percentage: label === portfolioAssetClassOptions[0] ? 30 : 5,
      })),
      { label: "Unknown category", value: 100, percentage: 10 },
    ];
    const { rerender } = render(
      <PortfolioDistributionCharts
        institutionItems={institutions}
        classItems={classItems}
        unclassifiedValue={300}
        unclassifiedPercentage={30}
        loading={false}
      />,
    );

    expect(screen.getByText("Onde está · por instituição")).toBeTruthy();
    expect(screen.getByText("Como se distribui · por classe")).toBeTruthy();
    expect(screen.getByText("Banco 1")).toBeTruthy();
    expect(screen.getByText(/700,00/)).toBeTruthy();
    const firstInstitutionRow = screen.getByText("Banco 1").closest("li");
    expect(firstInstitutionRow?.textContent).toContain("700,00");
    expect(firstInstitutionRow?.textContent).not.toContain("25,0%");
    expect(
      screen.getByRole("img", { name: /Banco 1:.*700,00, 25%/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/25,0%/)).toBeNull();
    expect(screen.getByText("Demais instituições")).toBeTruthy();
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    const fixedIncomeRow = screen.getByText("Renda fixa").closest("li");
    expect(fixedIncomeRow?.textContent).toContain("300,00");
    expect(fixedIncomeRow?.textContent).not.toContain("30,0%");
    expect(
      screen.getByRole("img", { name: /Renda fixa:.*300,00, 30%/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/30,0%/)).toBeNull();
    expect(screen.getByText("Unknown category")).toBeTruthy();
    expect(screen.getByText(/sem classe informada/)).toBeTruthy();
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(13);
    const genericCategoryColors = [
      "var(--chart-category-1)",
      "var(--chart-category-2)",
      "var(--chart-category-3)",
      "var(--chart-category-4)",
      "var(--chart-category-5)",
      "var(--chart-category-6)",
    ];
    expect(
      screen
        .getAllByRole("img")
        .slice(0, institutions.length)
        .every((chart) =>
          genericCategoryColors.includes(
            chart.getAttribute("data-series-color")!,
          ),
        ),
    ).toBe(true);
    const getColorForLabel = (label: string) =>
      screen
        .getAllByRole("img")
        .find((chart) =>
          chart.getAttribute("aria-label")?.startsWith(`${label}:`),
        )
        ?.getAttribute("data-series-color");
    const expectedClassColors = new Map([
      ["Renda fixa", "var(--chart-category-4)"],
      ["Renda variável", "var(--chart-category-1)"],
      ["Fundos", "var(--chart-category-5)"],
      ["Criptoativos", "var(--chart-category-2)"],
      ["Imóveis", "var(--chart-category-3)"],
      ["Outros", "var(--chart-category-6)"],
      ["Unknown category", "var(--asset-class-neutral)"],
    ]);

    for (const [label, color] of expectedClassColors) {
      expect(getColorForLabel(label)).toBe(color);
    }
    const expectedInstitutionColors = new Map(
      institutions.map(({ label }) => [label, getColorForLabel(label)]),
    );

    rerender(
      <PortfolioDistributionCharts
        institutionItems={[...institutions].reverse()}
        classItems={[...classItems].reverse()}
        unclassifiedValue={300}
        unclassifiedPercentage={30}
        loading={false}
      />,
    );
    for (const [label, color] of expectedClassColors) {
      expect(getColorForLabel(label)).toBe(color);
    }
    for (const [label, color] of expectedInstitutionColors) {
      expect(getColorForLabel(label)).toBe(color);
    }
    expect(
      screen
        .getAllByTestId("bar-track")
        .every((track) => track.getAttribute("data-fill") === "var(--muted)"),
    ).toBe(true);
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
    expect(screen.getByRole("status", { name: /Carregando/ })).toBeTruthy();

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
