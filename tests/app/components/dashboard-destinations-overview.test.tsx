// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardDestinationsOverview,
  type DashboardDestinationSummary,
} from "@/app/_components/dashboard-destinations-overview";
import { formatCurrency } from "@/lib/utils";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config: _config,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  ChartTooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  ChartTooltipContent: ({
    formatter,
  }: {
    formatter: (value: number) => string;
  }) => <span data-testid="tooltip">{formatter(1234.56)}</span>,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => (
    <span data-testid="cell" data-fill={fill} />
  ),
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
const summary: DashboardDestinationSummary = {
  categories: [
    { key: "reserve", value: 700, percentage: 70 },
    { key: "long_term", value: 300, percentage: 30 },
    { key: "unassigned", value: 0, percentage: 0 },
  ],
  knownTotal: 1000,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
};

afterEach(cleanup);
describe("DashboardDestinationsOverview", () => {
  it("reuses canonical amounts, proportions, destination colors and exact tooltip", () => {
    const onOpenObjectives = vi.fn();
    render(
      <DashboardDestinationsOverview
        summary={summary}
        onOpenObjectives={onOpenObjectives}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "valores conhecidos",
    );
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText(/R\$\s700,00/)).toBeTruthy();
    expect(screen.getByTestId("tooltip").textContent).toBe(
      formatCurrency(1234.56),
    );
    expect(screen.queryByText("Sem destino")).toBeNull();
    expect(
      screen
        .getAllByTestId("cell")
        .map((item) => item.getAttribute("data-fill")),
    ).toEqual(["var(--color-reserve)", "var(--color-long_term)"]);
    fireEvent.click(screen.getByRole("button", { name: "Objetivos" }));
    expect(onOpenObjectives).toHaveBeenCalledOnce();
    expect(screen.getByRole("img").className).toContain("aspect-square");
    expect(screen.getByRole("img").className).toContain("@lg:max-w-none");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("opens the long-term class breakdown and returns to destination values", () => {
    render(
      <DashboardDestinationsOverview
        summary={summary}
        positions={[]}
        longTermMissingPositionCount={1}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver composição do investimento de longo prazo",
      }),
    );
    expect(
      screen.getByText(
        "Ainda não há valores conhecidos nas posições de longo prazo.",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar aos destinos" }),
    );
    expect(screen.getByText("30%")).toBeTruthy();
  });
  it("keeps a zero-value long-term destination actionable for unvalued positions", () => {
    const zeroLongTermSummary: DashboardDestinationSummary = {
      categories: [
        { key: "reserve", value: 1000, percentage: 100 },
        { key: "long_term", value: 0, percentage: 0 },
      ],
      knownTotal: 1000,
      missingPositionCount: 1,
      unvaluedPositionCount: 1,
    };
    render(
      <DashboardDestinationsOverview
        summary={zeroLongTermSummary}
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 1,
            knownValueCents: "0",
            objectivePurpose: "LONG_TERM_INVESTMENT",
          },
        ]}
        longTermMissingPositionCount={1}
      />,
    );

    const drilldown = screen.getByRole("button", {
      name: "Ver composição do investimento de longo prazo",
    });
    expect(drilldown.closest("li")?.textContent).toContain("0%");
    expect(drilldown.closest("li")?.textContent).toContain("0,00");
    fireEvent.click(drilldown);

    expect(
      screen.getByText(
        "Ainda não há valores conhecidos nas posições de longo prazo.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Composição parcial",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "não foram encontradas",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "sem valor conhecido",
    );
  });
  it("shows an empty donut and a zero-value detail when the long-term category is absent", () => {
    render(
      <DashboardDestinationsOverview
        summary={{
          categories: [],
          knownTotal: 0,
          missingPositionCount: 0,
          unvaluedPositionCount: 1,
        }}
        positions={[
          {
            product: "CDB",
            assetClass: "Renda fixa",
            geography: "Brasil",
            positionCount: 1,
            unvaluedPositions: 1,
            knownValueCents: "0",
            objectivePurpose: "LONG_TERM_INVESTMENT",
          },
        ]}
      />,
    );

    expect(screen.getByText("Sem valores conhecidos")).toBeTruthy();
    const drilldown = screen.getByRole("button", {
      name: "Ver composição do investimento de longo prazo",
    });
    expect(drilldown.closest("li")?.textContent).toContain("0%");
    expect(drilldown.closest("li")?.textContent).toContain("0,00");
    fireEvent.click(drilldown);
    expect(screen.getByRole("status").textContent).toContain(
      "sem valor conhecido",
    );
  });
  it.each([{ missingPositionCount: 1 }, { unvaluedPositionCount: 1 }])(
    "marks incomplete coverage without changing canonical percentages",
    (incomplete) => {
      render(
        <DashboardDestinationsOverview
          summary={{ ...summary, ...incomplete }}
        />,
      );
      expect(screen.getByRole("status").textContent).toContain(
        "Distribuição parcial",
      );
      expect(screen.getByText("70%")).toBeTruthy();
    },
  );
  it("shows an empty state without inventing data", () => {
    render(
      <DashboardDestinationsOverview
        summary={{ ...summary, categories: [], knownTotal: 0 }}
      />,
    );
    expect(screen.getByText("Ainda sem valores conhecidos.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("shows an independent loading state", () => {
    render(<DashboardDestinationsOverview loading />);
    expect(
      screen
        .getByLabelText("Carregando destinos da carteira")
        .getAttribute("aria-busy"),
    ).toBe("true");
  });
  it("omits the card before any state is available", () => {
    const { container } = render(
      <DashboardDestinationsOverview summary={null} />,
    );
    expect(container.innerHTML).toBe("");
  });
  it("keeps cached data visible during refetch", () => {
    render(<DashboardDestinationsOverview loading summary={summary} />);
    expect(screen.getByText("70%")).toBeTruthy();
    expect(
      screen.queryByLabelText("Carregando destinos da carteira"),
    ).toBeNull();
  });
  it("allows retry without presenting unavailable values as zero", () => {
    const onRetry = vi.fn();
    render(
      <DashboardDestinationsOverview
        unavailable
        onRetry={onRetry}
        summary={{ ...summary, missingPositionCount: 1 }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Destinos indisponíveis",
    );
    expect(screen.queryByText("70%")).toBeNull();
    expect(screen.queryByText(/Distribuição parcial/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("renders an unavailable state without a previous summary or callback", () => {
    render(<DashboardDestinationsOverview unavailable />);
    expect(screen.getByText("Destinos indisponíveis")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  });
});
