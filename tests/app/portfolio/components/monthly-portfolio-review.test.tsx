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
    sourceReferences: [{ source: "B3", referenceDate }],
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

  it("shows the observed change with dates, values, coverage and the flow caveat", () => {
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
    expect(screen.getByText("31/07/2026", { exact: false })).toBeTruthy();
    expect(screen.getAllByText(/2 de 2 posições com valor/)).toHaveLength(2);
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
    expect(screen.getByText(/Comparação parcial/)).toBeTruthy();
  });

  it("explains that manually maintained positions need a saved baseline", () => {
    renderReview(
      review({
        status: "partial",
        untrackedManualPositionCount: 1,
      }),
    );
    expect(
      screen.getByText(/1 posição manual sem histórico de alterações/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Comparação parcial: há posições manuais/),
    ).toBeTruthy();
    expect(
      screen.getByText(/valores substituídos antes desse ponto/),
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
      screen.getByText(/não tem posições registradas com valor conhecido/),
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
    expect(
      screen.getByText(/Não há registro de posições para 1 mês/),
    ).toBeTruthy();
    expect(screen.getByText(/critérios de avaliação diferentes/)).toBeTruthy();
  });

  it("uses plural wording for multiple missing months and method-list length changes", () => {
    renderReview(
      review({
        gapMonths: 2,
        current: summary({ valuationMethods: ["MTM", "FECHAMENTO"] }),
        previous: summary({ valuationMethods: ["MTM"] }),
      }),
    );
    expect(
      Array.from(document.querySelectorAll("p")).some(
        (element) =>
          element.textContent?.includes("2") &&
          element.textContent?.includes("entre essas datas"),
      ),
    ).toBe(true);
    expect(screen.getByText(/critérios de avaliação diferentes/)).toBeTruthy();
  });

  it("does not report evaluation changes when methods match", () => {
    renderReview(
      review({
        current: summary({ valuationMethods: ["CURVA", "MTM"] }),
        previous: summary({ valuationMethods: ["CURVA", "MTM"] }),
      }),
    );
    expect(screen.queryByText(/critérios de avaliação diferentes/)).toBeNull();
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
              recordedAt: "2026-09-01",
            },
          ],
        }),
      }),
    );

    expect(screen.getByText(/Datas dos valores manuais/)).toBeTruthy();
    expect(screen.getByText(/Conversão para reais em/)).toBeTruthy();
    expect(screen.getByText(/cotação que você registrou/)).toBeTruthy();
  });

  it("shows the date alignment warning and plural manual wording", () => {
    renderReview(
      review({
        status: "partial",
        dateAlignment: "outdated",
        untrackedManualPositionCount: 2,
        current: summary({
          sourceReferences: [
            { source: "Valor informado", referenceDate: "2026-07-31" },
          ],
        }),
      }),
    );

    expect(screen.getAllByText(/s manuais/)).toHaveLength(2);
    expect(
      screen.getByText(/não tem valor atualizado para o mês selecionado/),
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
      screen.getByText(/as fontes usam datas de referência diferentes/),
    ).toBeTruthy();
    expect(
      screen.getByText(/as datas das fontes precisam ser conferidas/),
    ).toBeTruthy();
  });

  it("supports an unset period and manual records without a save timestamp", () => {
    renderReview(
      review({
        selectedPeriod: null,
        current: summary({
          sourceReferences: [
            { source: "Valor informado", referenceDate: "2026-08-31" },
          ],
        }),
      }),
    );

    expect(
      screen.getByRole("combobox", { name: "Mês do fechamento" }).textContent,
    ).toContain("Escolha um mês");
    expect(
      screen.getByText(/Último valor manual: em 31\/08\/2026/),
    ).toBeTruthy();
  });
});
