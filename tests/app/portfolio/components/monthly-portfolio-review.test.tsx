// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyPortfolioReview } from "@/app/portfolio/_components/monthly-portfolio-review";
import type {
  MonthlyPortfolioReview as MonthlyPortfolioReviewData,
  MonthlyPortfolioSnapshotSummary,
} from "@/backend/services/monthly-portfolio-review";

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
): MonthlyPortfolioReviewData => ({
  availablePeriods: ["2026-08", "2026-07"],
  selectedPeriod: "2026-08",
  untrackedManualPositionCount: 0,
  status: "ready",
  dateAlignment: "aligned",
  compositionCoverage: "equivalent",
  current: summary(),
  previous: summary({
    referenceDate: "2026-07-31",
    knownValueCents: "120050",
  }),
  observedChangeCents: "5000",
  gapMonths: 0,
  flowSeparation: { status: "unavailable", explanation: flowExplanation },
  ...overrides,
});
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
    expect(screen.getByText(/Ainda não há valores históricos/)).toBeTruthy();

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
    expect(screen.getByText("Fechamento mensal")).toBeTruthy();
    expect(screen.getByText("Variação observada")).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.replace(/\u00a0/g, " ") === "+R$ 50,00",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.replace(/\u00a0/g, " ") === "R$ 1.250,50",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(/2 de 2 posições com valor/)).toHaveLength(2);
    expect(document.querySelector("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
    expect(screen.getByText("31/07/2026", { exact: false })).toBeTruthy();
    expect(screen.getAllByText(/registro em 01\/09\/2026/)).toHaveLength(2);
    expect(screen.getAllByText(/importada em 02\/09\/2026/)).toHaveLength(2);
    expect(screen.getByText(new RegExp(flowExplanation))).toBeTruthy();
    expect(screen.getByLabelText("Mês do fechamento")).toBeTruthy();
  });

  it("lets the user select an available month", async () => {
    const user = userEvent.setup();
    const { onPeriodChange } = renderReview(review());
    await user.click(
      screen.getByRole("combobox", { name: "Mês do fechamento" }),
    );
    await user.click(screen.getByRole("option", { name: "julho de 2026" }));
    expect(onPeriodChange).toHaveBeenCalledWith("2026-07");
  });

  it("shows a first close without inventing a comparison", () => {
    renderReview(
      review({
        status: "no_previous_close",
        previous: null,
        observedChangeCents: null,
      }),
    );
    expect(screen.getByText("Último fechamento")).toBeTruthy();
    expect(screen.getByText(/Ainda não há outro fechamento/)).toBeTruthy();
    expect(screen.queryByText("Variação observada")).toBeNull();
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
    expect(screen.getByText(/Não há um registro de posições/)).toBeTruthy();

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
    expect(screen.getByText(/Faltam valores conhecidos/)).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(1);
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
    expect(screen.getByText("Diferença entre valores conhecidos")).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
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
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
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
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
    expect(
      screen.getByText(/2 posições manuais sem histórico anterior/),
    ).toBeTruthy();
  });

  it("explains empty closes and zero change without implying growth", () => {
    renderReview(
      review({
        status: "partial",
        current: summary({
          positionCount: 0,
          valuedPositionCount: 0,
          knownValueCents: null,
        }),
        observedChangeCents: "0",
      }),
    );
    expect(
      screen.getByText(/A cobertura da carteira não pode ser confirmada/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.replace(/\u00a0/g, " ") === "R$ 0,00",
      ),
    ).toBeTruthy();
  });

  it("shows skipped months and different valuation criteria", () => {
    renderReview(
      review({
        gapMonths: 1,
        current: summary({ valuationMethods: ["MTM"] }),
        previous: summary({ valuationMethods: ["CURVA"] }),
      }),
    );
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
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
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
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
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
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

    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
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
      screen.getByRole("combobox", { name: "Mês do fechamento" }).textContent,
    ).toContain("Escolha um mês");
    fireEvent.click(screen.getByText("Ver datas, fontes e limites"));
    expect(
      screen.getByText(/Valor informado: posição avaliada em 31\/08\/2026/),
    ).toBeTruthy();
  });
});
