// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Children, isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyPortfolioReview } from "@/app/portfolio/_components/monthly-portfolio-review";
import type {
  MonthlyPortfolioReview as MonthlyPortfolioReviewData,
  MonthlyPortfolioSnapshotSummary,
} from "@/backend/services/monthly-portfolio-review";

vi.mock("recharts", () => {
  const Chart = ({
    children,
    data,
    type,
  }: {
    children: React.ReactNode;
    data: Array<{ month: string; value: number | null }>;
    type: string;
  }) => (
    <div
      aria-label="Gráfico da evolução do patrimônio conhecido"
      data-months={data.map((point) => point.month).join(",")}
      data-values={data.map((point) => point.value ?? "null").join(",")}
      data-testid={`${type}-chart`}
    >
      {type === "area"
        ? Children.toArray(children).filter(
            (child) => !isValidElement(child) || child.type !== "defs",
          )
        : children}
    </div>
  );
  return {
    Area: () => <span data-testid="area-series" />,
    AreaChart: (props: Omit<Parameters<typeof Chart>[0], "type">) => (
      <Chart {...props} type="area" />
    ),
    Bar: () => <span data-testid="bar-series" />,
    BarChart: (props: Omit<Parameters<typeof Chart>[0], "type">) => (
      <Chart {...props} type="bar" />
    ),
    CartesianGrid: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Tooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
    XAxis: ({
      dataKey,
      tickFormatter,
    }: {
      dataKey: string;
      tickFormatter: (value: string) => string;
    }) => (
      <span data-testid={`x-axis-${dataKey}`}>{tickFormatter("2026-07")}</span>
    ),
    YAxis: ({
      tickFormatter,
    }: {
      tickFormatter: (value: number) => string;
    }) => <span data-testid="y-axis">{tickFormatter(60000)}</span>,
  };
});

vi.mock("@/components/ui/chart", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/chart")>();
  return {
    ...actual,
    ChartTooltipContent: (props: Record<string, unknown>) => {
      const labelFormatter = props.labelFormatter as (
        label: unknown,
      ) => React.ReactNode;
      const formatter = props.formatter as (
        value: number,
        name: string,
        item: {
          payload: {
            cents: string;
            isPartial: boolean;
            referenceDate: string | null;
          };
        },
        index: number,
        payload: unknown[],
      ) => React.ReactNode;
      return (
        <span data-testid="chart-tooltip">
          {labelFormatter("2026-07")} / {labelFormatter(2026)} /{" "}
          {formatter(
            12.5,
            "value",
            {
              payload: {
                cents: "125050",
                isPartial: true,
                referenceDate: "2026-07-31",
              },
            },
            0,
            [],
          )}
          {formatter(
            12.5,
            "value",
            {
              payload: {
                cents: "125050",
                isPartial: false,
                referenceDate: null,
              },
            },
            1,
            [],
          )}
        </span>
      );
    },
  };
});

const flowExplanation =
  "Não é possível separar aportes de rendimento com os dados disponíveis.";
const summary = (
  overrides: Partial<MonthlyPortfolioSnapshotSummary> = {},
): MonthlyPortfolioSnapshotSummary => {
  const referenceDate = overrides.referenceDate ?? "2026-08-31";
  return {
    referenceDate,
    importedAt: "2026-09-01T12:00:00.000Z",
    sources: ["B3"],
    sourceReferences: [
      {
        source: "B3",
        referenceDate,
        recordedAt: "2026-09-01T12:00:00.000Z",
        importedAt: "2026-09-02T12:00:00.000Z",
      },
    ],
    positionCount: 2,
    valuedPositionCount: 2,
    unvaluedPositionCount: 0,
    knownValueCents: "125050",
    valuationMethods: ["FECHAMENTO"],
    manualPositionDates: [],
    manualConversionDates: [],
    valuationReferenceDates: [referenceDate],
    ...overrides,
  };
};
const review = (
  overrides: Partial<MonthlyPortfolioReviewData> = {},
): MonthlyPortfolioReviewData => {
  const availablePeriods = overrides.availablePeriods ?? ["2026-08", "2026-07"];
  const selectedPeriod =
    overrides.selectedPeriod === undefined
      ? "2026-08"
      : overrides.selectedPeriod;
  const current =
    overrides.current === undefined ? summary() : overrides.current;
  const previous =
    overrides.previous === undefined
      ? summary({ referenceDate: "2026-07-31", knownValueCents: "120050" })
      : overrides.previous;
  const toHistoryPoint = (
    period: string,
    snapshot: MonthlyPortfolioSnapshotSummary,
  ) => ({
    period,
    summary: snapshot,
    completeness:
      snapshot.knownValueCents !== null && snapshot.unvaluedPositionCount === 0
        ? ("complete" as const)
        : ("partial" as const),
  });
  const currentPeriod =
    selectedPeriod ?? current?.referenceDate.slice(0, 7) ?? "2026-08";
  const previousPeriod = availablePeriods.find(
    (period) => period < currentPeriod,
  );
  const history =
    overrides.history ??
    [
      ...(previous
        ? [
            toHistoryPoint(
              previousPeriod ?? previous.referenceDate.slice(0, 7),
              previous,
            ),
          ]
        : []),
      ...(current ? [toHistoryPoint(currentPeriod, current)] : []),
    ].sort((left, right) => left.period.localeCompare(right.period));

  return {
    availablePeriods,
    history,
    selectedPeriod,
    untrackedManualPositionCount: 0,
    status: "ready",
    dateAlignment: "aligned",
    compositionCoverage: "equivalent",
    current,
    previous,
    observedChangeCents: "5000",
    gapMonths: 0,
    flowSeparation: { status: "unavailable", explanation: flowExplanation },
    ...overrides,
  };
};
const renderReview = (
  data: MonthlyPortfolioReviewData | undefined,
  options: { loading?: boolean; error?: string } = {},
) => {
  const onPeriodChange = vi.fn();
  const onRetry = vi.fn();
  const result = render(
    <MonthlyPortfolioReview
      review={data}
      selectedPeriod={null}
      loading={options.loading ?? false}
      error={options.error}
      onPeriodChange={onPeriodChange}
      onRetry={onRetry}
    />,
  );
  return { ...result, onPeriodChange, onRetry };
};

describe("MonthlyPortfolioReview", () => {
  beforeEach(() => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
    HTMLElement.prototype.scrollIntoView = () => undefined;
  });
  afterEach(cleanup);

  it("shows loading, reports no history and lets the user retry errors", async () => {
    const { rerender } = renderReview(undefined, { loading: true });
    expect(screen.getByRole("status").textContent).toContain("Carregando");

    rerender(
      <MonthlyPortfolioReview
        review={review({
          status: "no_history",
          current: null,
          previous: null,
          availablePeriods: [],
          selectedPeriod: null,
        })}
        selectedPeriod={null}
        loading={false}
        onPeriodChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/histórico aparecerá após o primeiro fechamento/),
    ).toBeTruthy();

    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <MonthlyPortfolioReview
        review={undefined}
        selectedPeriod={null}
        loading={false}
        error="Falha ao carregar."
        onPeriodChange={vi.fn()}
        onRetry={onRetry}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the summary compact and puts source dates and limits in details", () => {
    renderReview(review());
    expect(screen.getByText("Evolução patrimonial")).toBeTruthy();
    expect(screen.getByText(/Diferença/)).toBeTruthy();
    expect(screen.getByText("+R$ 50,00")).toBeTruthy();
    expect(screen.getByText(/R\$ 1\.200,50.*R\$ 1\.250,50/s)).toBeTruthy();
    expect(screen.getByTestId("area-chart").getAttribute("data-months")).toBe(
      "2026-07,2026-08",
    );
    expect(
      screen
        .getByRole("button", { name: "Gráfico de área" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText(/posições com valor conhecido/)).toBeNull();
    expect(screen.getByTestId("x-axis-month").textContent).toMatch(/jul/i);
    expect(screen.getByTestId("y-axis").textContent).toMatch(/R\$/);
    expect(screen.getByTestId("chart-tooltip").textContent).toMatch(
      /julho de 2026.*R\$\s1\.250,50.*parcial.*31\/07\/2026.*R\$\s1\.250,50/,
    );
    expect(document.querySelector("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(
      screen.getAllByText("31/07/2026", { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/registro em 01\/09\/2026/)).toHaveLength(2);
    expect(screen.getAllByText(/importada em 02\/09\/2026/)).toHaveLength(2);
    expect(screen.getByText(new RegExp(flowExplanation))).toBeTruthy();
    expect(screen.getByLabelText("Mês de referência")).toBeTruthy();
  });

  it("switches the historical comparison between area and bar charts", async () => {
    const user = userEvent.setup();
    renderReview(review());

    await user.click(screen.getByRole("button", { name: "Gráfico de barras" }));

    expect(screen.getByTestId("bar-chart")).toBeTruthy();
    expect(screen.queryByTestId("area-chart")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Gráfico de barras" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Gráfico de área" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Gráfico de área" }));
    expect(screen.getByTestId("area-chart")).toBeTruthy();
  });

  it("plots all recorded months and leaves gaps blank instead of interpolating them", () => {
    const current = summary({
      referenceDate: "2026-04-30",
      knownValueCents: "12500",
    });
    const previous = summary({
      referenceDate: "2026-01-31",
      knownValueCents: "10000",
    });
    renderReview(
      review({
        selectedPeriod: "2026-04",
        availablePeriods: ["2026-04", "2026-01"],
        current,
        previous,
        history: [
          {
            period: "2026-01",
            summary: previous,
            completeness: "complete",
          },
          {
            period: "2026-04",
            summary: current,
            completeness: "complete",
          },
        ],
      }),
    );

    const chart = screen.getByTestId("area-chart");
    expect(chart.getAttribute("data-months")).toBe(
      "2026-01,2026-02,2026-03,2026-04",
    );
    expect(chart.getAttribute("data-values")).toBe("100,null,null,125");
    expect(
      screen.getByText(/fevereiro de 2026: sem fechamento registrado/),
    ).toBeTruthy();
    expect(screen.queryByText(/rentabilidade/i)).toBeTruthy();
  });

  it("keeps partially known history as an exact partial point without treating it as zero", () => {
    const partial = summary({
      referenceDate: "2026-03-31",
      knownValueCents: "12345",
      positionCount: 3,
      valuedPositionCount: 2,
      unvaluedPositionCount: 1,
    });
    const earlier = summary({
      referenceDate: "2026-01-31",
      knownValueCents: "10000",
    });
    const unvalued = summary({
      referenceDate: "2026-02-28",
      knownValueCents: null,
      positionCount: 1,
      valuedPositionCount: 0,
      unvaluedPositionCount: 1,
    });
    renderReview(
      review({
        selectedPeriod: "2026-03",
        availablePeriods: ["2026-03", "2026-02", "2026-01"],
        current: partial,
        previous: unvalued,
        status: "partial",
        history: [
          { period: "2026-01", summary: earlier, completeness: "complete" },
          { period: "2026-02", summary: unvalued, completeness: "partial" },
          { period: "2026-03", summary: partial, completeness: "partial" },
        ],
      }),
    );

    expect(screen.getByTestId("area-chart").getAttribute("data-values")).toBe(
      "100,null,123.45",
    );
    expect(screen.getByText(/valor parcial/)).toBeTruthy();
    expect(screen.getByText(/Há posições sem valor conhecido/)).toBeTruthy();
  });

  it("gives long histories a scrollable chart area sized for each month", () => {
    const history = Array.from({ length: 24 }, (_, index) => {
      const monthIndex = index + 1;
      const year = 2024 + Math.floor(index / 12);
      const month = String(((monthIndex - 1) % 12) + 1).padStart(2, "0");
      const period = `${year}-${month}`;
      return {
        period,
        summary: summary({
          referenceDate: `${period}-28`,
          knownValueCents: String((index + 1) * 10000),
        }),
        completeness: "complete" as const,
      };
    });
    const selected = history[history.length - 1];
    renderReview(
      review({
        availablePeriods: history.map(({ period }) => period).reverse(),
        selectedPeriod: selected.period,
        current: selected.summary,
        previous: history[history.length - 2].summary,
        history,
      }),
    );

    const scrollRegion = screen.getByRole("region", {
      name: "Deslize horizontalmente para ver todos os meses",
    });
    expect(scrollRegion.className).toContain("overflow-x-auto");
    expect(
      document.querySelector("[data-chart]")?.getAttribute("style"),
    ).toContain("min-width: 960px");
    const renderedMonths = screen
      .getByTestId("area-chart")
      .getAttribute("data-months");
    expect(renderedMonths).not.toBeNull();
    expect(renderedMonths?.split(",")).toHaveLength(24);
  });

  it("does not invent a difference if the service has no comparable delta", () => {
    renderReview(review({ observedChangeCents: null }));

    expect(screen.getByTestId("area-chart")).toBeTruthy();
    expect(screen.queryByText(/Diferença/)).toBeNull();
    expect(screen.queryByText(/R\$ 0,00/)).toBeNull();
  });

  it("lets the user select an available month", async () => {
    const user = userEvent.setup();
    const { onPeriodChange } = renderReview(review());
    await user.click(
      screen.getByRole("combobox", { name: "Mês de referência" }),
    );
    await user.click(screen.getByRole("option", { name: "julho de 2026" }));
    expect(onPeriodChange).toHaveBeenCalledWith("2026-07");
  });

  it("shows a first close without inventing a comparison", () => {
    renderReview(
      review({
        status: "no_previous_close",
        availablePeriods: ["2026-08"],
        previous: null,
        observedChangeCents: null,
      }),
    );
    expect(screen.getByText("Primeiro fechamento registrado")).toBeTruthy();
    expect(screen.getByText(/Registre outro fechamento/)).toBeTruthy();
    expect(screen.queryByTestId("area-chart")).toBeNull();
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(screen.queryByText(/rentabilidade/i)).toBeNull();
  });

  it("explains missing periods and insufficient values", () => {
    const { rerender } = render(
      <MonthlyPortfolioReview
        review={review({
          status: "missing_snapshot",
          selectedPeriod: "2026-06",
          current: null,
          previous: null,
        })}
        selectedPeriod="2026-06"
        loading={false}
        onPeriodChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Não há fechamento registrado/)).toBeTruthy();

    rerender(
      <MonthlyPortfolioReview
        review={review({
          status: "insufficient_values",
          observedChangeCents: null,
          current: summary({ knownValueCents: null, valuedPositionCount: 0 }),
        })}
        selectedPeriod={null}
        loading={false}
        onPeriodChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Não há valores suficientes/)).toBeTruthy();
  });

  it("labels partial totals and never presents them as the full portfolio", () => {
    renderReview(
      review({
        status: "partial",
        current: summary({
          positionCount: 3,
          valuedPositionCount: 2,
          unvaluedPositionCount: 1,
        }),
        observedChangeCents: "-1000",
      }),
    );
    expect(screen.getByText(/Diferença/)).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent?.replace(/\u00a0/g, " ") === "-R$ 10,00",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Há posições sem valor conhecido/)).toBeTruthy();
  });

  it("explains that manually maintained positions need a saved baseline", () => {
    renderReview(
      review({
        status: "partial",
        untrackedManualPositionCount: 1,
      }),
    );
    expect(
      screen.getByText(/O histórico manual ainda não cobre os dois períodos/),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(
      screen.getByText(/1 posição manual sem histórico anterior/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Valores substituídos antes do primeiro registro/),
    ).toBeTruthy();
  });

  it("explains when source composition cannot be identified", () => {
    renderReview(
      review({
        status: "partial",
        compositionCoverage: "unknown",
      }),
    );

    expect(
      screen.getByText(/Não foi possível confirmar todas as posições/),
    ).toBeTruthy();
  });

  it("explains changed source composition and missing months in a partial close", () => {
    const { rerender } = render(
      <MonthlyPortfolioReview
        review={review({ status: "partial", compositionCoverage: "changed" })}
        selectedPeriod={null}
        loading={false}
        onPeriodChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/As fontes ou posições mudaram/)).toBeTruthy();

    rerender(
      <MonthlyPortfolioReview
        review={review({ status: "partial", gapMonths: 1 })}
        selectedPeriod={null}
        loading={false}
        onPeriodChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Faltam fechamentos em meses intermediários/),
    ).toBeTruthy();
  });

  it("uses clear plural wording for multiple manual positions without history", () => {
    renderReview(
      review({
        status: "partial",
        untrackedManualPositionCount: 2,
      }),
    );
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(
      screen.getByText(/2 posições manuais sem histórico anterior/),
    ).toBeTruthy();
  });

  it("keeps unknown historical values as gaps without treating them as zero", () => {
    renderReview(
      review({
        status: "partial",
        current: summary({
          positionCount: 0,
          valuedPositionCount: 0,
          knownValueCents: null,
        }),
        observedChangeCents: null,
      }),
    );
    expect(
      screen.getByText(/A cobertura da carteira não pode ser confirmada/),
    ).toBeTruthy();
    expect(screen.getByTestId("area-chart").getAttribute("data-values")).toBe(
      "1200.5,null",
    );
    expect(screen.queryByTestId("bar-chart")).toBeNull();
  });

  it("shows skipped months and different valuation criteria", () => {
    renderReview(
      review({
        gapMonths: 1,
        current: summary({ valuationMethods: ["MTM"] }),
        previous: summary({ valuationMethods: ["CURVA"] }),
      }),
    );
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(screen.getByText(/Há 1 mês sem fechamento/)).toBeTruthy();
    expect(
      screen.getByText(/critérios de avaliação registrados mudaram/),
    ).toBeTruthy();
  });

  it("uses plural wording for multiple missing months and method-list length changes", () => {
    renderReview(
      review({
        gapMonths: 2,
        current: summary({ valuationMethods: ["MTM", "FECHAMENTO"] }),
        previous: summary({ valuationMethods: ["MTM"] }),
      }),
    );
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(screen.getByText(/Há 2 meses sem fechamento/)).toBeTruthy();
    expect(
      screen.getByText(/critérios de avaliação registrados mudaram/),
    ).toBeTruthy();
  });

  it("does not report evaluation changes when methods match", () => {
    renderReview(
      review({
        current: summary({ valuationMethods: ["CURVA", "MTM"] }),
        previous: summary({ valuationMethods: ["CURVA", "MTM"] }),
      }),
    );
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(
      screen.queryByText(/critérios de avaliação registrados mudaram/),
    ).toBeNull();
  });

  it("shows the dates and caveat for manually converted foreign values", () => {
    renderReview(
      review({
        current: summary({
          valuationMethods: ["MANUAL_CONVERTED"],
          manualPositionDates: ["2026-08-28", "2026-08-31"],
          manualConversionDates: ["2026-08-29", "2026-08-31"],
          sourceReferences: [
            {
              source: "Valor informado",
              referenceDate: "2026-08-31",
              recordedAt: "2026-09-01T12:00:00.000Z",
            },
          ],
        }),
      }),
    );

    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(screen.getByText(/Datas dos valores manuais/)).toBeTruthy();
    expect(screen.getByText(/Conversão para reais/)).toBeTruthy();
    expect(
      screen.getByText(/Ele pode refletir uma cotação de data diferente/),
    ).toBeTruthy();
  });

  it("shows the date alignment warning and plural manual wording", () => {
    renderReview(
      review({
        status: "partial",
        dateAlignment: "outdated",
        untrackedManualPositionCount: 2,
        current: summary({
          sourceReferences: [
            {
              source: "Valor informado",
              referenceDate: "2026-07-31",
              recordedAt: "2026-07-31T12:00:00.000Z",
            },
          ],
        }),
      }),
    );

    expect(
      screen.getByText(/O histórico manual ainda não cobre os dois períodos/),
    ).toBeTruthy();
  });

  it("explains mixed valuation dates", () => {
    renderReview(
      review({
        status: "partial",
        dateAlignment: "different_dates",
      }),
    );

    expect(
      screen.getByText(/As datas de avaliação não coincidem/),
    ).toBeTruthy();
  });

  it("supports an unset period and manual records without a save timestamp", () => {
    renderReview(
      review({
        selectedPeriod: null,
        current: summary({
          sourceReferences: [
            {
              source: "Valor informado",
              referenceDate: "2026-08-31",
              recordedAt: "2026-08-31T12:00:00.000Z",
            },
          ],
        }),
      }),
    );

    expect(
      screen.getByRole("combobox", { name: "Mês de referência" }).textContent,
    ).toContain("Escolha um mês");
    fireEvent.click(screen.getByText("Detalhes dos valores"));
    expect(
      screen.getByText(/Valor informado: posição avaliada em 31\/08\/2026/),
    ).toBeTruthy();
  });
});
