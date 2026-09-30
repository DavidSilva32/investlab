// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectivesOverview } from "@/app/portfolio/_components/portfolio-objectives-overview";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    config,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div
      {...props}
      data-chart-colors={Object.values(
        config as Record<string, { color: string }>,
      )
        .map((item) => item.color)
        .join("|")}
    >
      {children}
    </div>
  ),
  ChartTooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  ChartTooltipContent: ({
    formatter,
  }: {
    formatter: (value: number) => string;
  }) => <span data-testid="chart-tooltip-value">{formatter(250)}</span>,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => (
    <span data-testid="chart-cell" data-fill={fill} />
  ),
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const objectives: PortfolioObjective[] = [
  {
    id: reserveObjectiveId,
    kind: "RESERVE",
    name: "Reserva",
    targetAmount: 1000,
    monthlyPlannedAmount: null,
    currentValue: 200,
    knownValue: 250,
    remainingAmount: 800,
    progressPercent: 20,
    assignedPositionCount: 2,
    missingPositionCount: 1,
    unvaluedPositionCount: 1,
    assignedAssetKeys: [],
    canEditAssignments: false,
  },
  {
    id: "trip",
    kind: "CUSTOM",
    name: "Viagem",
    targetAmount: 2000,
    monthlyPlannedAmount: null,
    currentValue: 300,
    knownValue: 300,
    remainingAmount: 1700,
    progressPercent: 15,
    assignedPositionCount: 1,
    missingPositionCount: 0,
    unvaluedPositionCount: 0,
    assignedAssetKeys: [],
    canEditAssignments: true,
  },
];

describe("PortfolioObjectivesOverview", () => {
  afterEach(cleanup);

  it("shows the known partial distribution, missing data and accessible objective actions", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    render(
      <PortfolioObjectivesOverview
        data={{
          objectives,
          unassignedKnownValue: 450,
          unassignedPositionCount: 3,
          unassignedUnvaluedPositionCount: 2,
        }}
        deleting={false}
        deleteObjectiveId={null}
        onOpen={onOpen}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByText("Conhecido · parcial")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*1\.000,00/)).toHaveLength(2);
    const chart = screen.getByRole("img", {
      name: "Gráfico de rosca dos valores conhecidos por destino",
    });
    expect(chart.getAttribute("data-chart-colors")).toBe(
      "var(--primary)|var(--accent-foreground)|var(--muted-foreground)",
    );
    expect(
      screen
        .getAllByTestId("chart-cell")
        .map((cell) => cell.getAttribute("data-fill")),
    ).toEqual([
      "var(--color-reserve)",
      "var(--color-personal)",
      "var(--color-unassigned)",
    ]);
    expect(screen.getByTestId("chart-tooltip-value").textContent).toBe(
      "R$ 250,00",
    );
    const distribution = within(
      screen.getByRole("list", { name: "Valores e proporções por destino" }),
    );
    const distributionRows = distribution.getAllByRole("listitem");
    expect(distributionRows[0].textContent).toContain("25");
    expect(distributionRows[0].textContent).toContain("%");
    expect(distributionRows[2].textContent).toContain("45");
    expect(distributionRows[2].textContent).toContain("%");
    fireEvent.click(
      screen.getByRole("button", { name: /Como ler estes valores/ }),
    );
    expect(screen.getByText(/1 vínculo\(s\) não encontrados/)).toBeTruthy();
    expect(
      screen.getByText(/3 posição\(ões\) sem valor conhecido/),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Gráfico de rosca dos valores conhecidos por destino",
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    expect(onOpen).toHaveBeenCalledWith(objectives[1]);
    fireEvent.click(screen.getByRole("button", { name: "+ Novo objetivo" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("shows an empty chart state when all known category values are zero", () => {
    render(
      <PortfolioObjectivesOverview
        data={{
          objectives: [],
          unassignedKnownValue: 0,
          unassignedPositionCount: 1,
          unassignedUnvaluedPositionCount: 1,
        }}
        deleting={false}
        deleteObjectiveId={null}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDeleteOpenChange={vi.fn()}
        onDelete={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Sem valores conhecidos para compor o gráfico",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nenhum objetivo pessoal cadastrado. Você pode começar por uma meta que já tenha em mente.",
      ),
    ).toBeTruthy();
  });
});
