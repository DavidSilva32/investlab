/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { StockAnalysisReading } from "@/app/analyses/_components/stock-analysis-reading";

const annualPeriod = {
  referenceDate: "2024-12-31",
  sourceDocument: "DFP" as const,
  revenue: "1000000",
  netIncome: "100000",
  equity: "500000",
};

describe("StockAnalysisReading", () => {
  afterEach(cleanup);

  it("shows latest profit and compact annual movements with values and percentages", () => {
    render(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2023-12-31", revenue: "900000" },
          {
            ...annualPeriod,
            referenceDate: "2024-12-31",
            revenue: "1000000",
            netIncome: "120000",
          },
          {
            ...annualPeriod,
            sourceDocument: "ITR",
            referenceDate: "2025-06-30",
            revenue: "700000",
            netIncome: "50000",
          },
        ]}
      />,
    );

    expect(screen.getByText("Lucro líquido do exercício")).toBeTruthy();
    expect(screen.getAllByText(/R\$\s?120\.000/)).toHaveLength(2);
    expect(screen.getByText("Exercício 2024")).toBeTruthy();
    expect(screen.getByText("Receita anual")).toBeTruthy();
    expect(screen.getByText(/R\$\s?1\.000\.000/)).toBeTruthy();
    expect(
      screen.getByText(/Aumentou R\$\s?100\.000 \(\+11,1%\)/),
    ).toBeTruthy();
    expect(screen.getByText(/Aumentou R\$\s?20\.000 \(\+20%\)/)).toBeTruthy();
    expect(screen.getAllByText("2023 → 2024")).toHaveLength(2);
    expect(screen.queryByText(/recomendação de investimento/)).toBeNull();
  });

  it("colors and labels a negative reported profit as a fact, not a recommendation", () => {
    const { container } = render(
      <StockAnalysisReading
        periods={[{ ...annualPeriod, netIncome: "-25000" }]}
      />,
    );

    expect(screen.getByText("Resultado negativo")).toBeTruthy();
    expect(screen.getByText(/-R\$\s?25\.000/)).toBeTruthy();
    expect(container.querySelector(".text-status-danger")).toBeTruthy();
    expect(
      screen.getByText(/Sem períodos anuais consecutivos e alinhados/),
    ).toBeTruthy();
  });

  it("shows zero and unavailable latest profit explicitly", () => {
    const { rerender } = render(
      <StockAnalysisReading periods={[{ ...annualPeriod, netIncome: "0" }]} />,
    );

    expect(screen.getByText("Resultado zerado")).toBeTruthy();
    expect(screen.getByText(/R\$\s?0/)).toBeTruthy();

    rerender(
      <StockAnalysisReading
        periods={[{ ...annualPeriod, netIncome: "invalid" }]}
      />,
    );
    expect(screen.getByText("Valor não informado")).toBeTruthy();
    expect(screen.getByText("Indisponível")).toBeTruthy();
  });

  it("omits percent when prior profit is negative or zero while showing nominal movement", () => {
    const { rerender } = render(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2023-12-31", netIncome: "-10000" },
          { ...annualPeriod, netIncome: "5000" },
        ]}
      />,
    );

    expect(screen.getByText(/Aumentou R\$\s?15\.000/)).toBeTruthy();
    expect(screen.queryByText(/15\.000.*%/)).toBeNull();

    rerender(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2023-12-31", netIncome: "0" },
          { ...annualPeriod, netIncome: "5000" },
        ]}
      />,
    );
    expect(screen.getByText(/Aumentou R\$\s?5\.000/)).toBeTruthy();
    expect(screen.queryByText(/5\.000.*%/)).toBeNull();
  });

  it("omits empty comparison rows when consecutive annual values are missing", () => {
    const { container } = render(
      <StockAnalysisReading
        periods={[
          {
            ...annualPeriod,
            referenceDate: "2023-12-31",
            revenue: null,
            netIncome: "10000",
          },
          {
            ...annualPeriod,
            referenceDate: "2024-12-31",
            revenue: "50000",
            netIncome: "not-numeric",
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/Sem períodos anuais consecutivos e alinhados/),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        "ul[aria-label='Síntese dos dados anuais'] > li",
      ),
    ).toHaveLength(2);
    expect(screen.queryByText("Receita anual")).toBeNull();
  });

  it("shows only the available comparable metric and handles a nominal decrease", () => {
    render(
      <StockAnalysisReading
        periods={[
          {
            ...annualPeriod,
            referenceDate: "2023-12-31",
            revenue: "100000",
            netIncome: null,
          },
          {
            ...annualPeriod,
            referenceDate: "2024-12-31",
            revenue: "90000",
            netIncome: "40000",
          },
        ]}
      />,
    );

    expect(screen.getByText(/Diminuiu R\$\s?10\.000 \(-10%\)/)).toBeTruthy();
    expect(screen.queryByText("Lucro líquido anual")).toBeNull();
  });

  it("does not compare nonconsecutive years or nonnumeric values", () => {
    render(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2022-12-31" },
          {
            ...annualPeriod,
            referenceDate: "2024-12-31",
            revenue: "not-numeric",
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/Sem períodos anuais consecutivos e alinhados/),
    ).toBeTruthy();
    expect(screen.queryByText("Receita anual")).toBeNull();
  });

  it("marks unchanged numeric values as neutral without a percentage", () => {
    render(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2023-12-31" },
          { ...annualPeriod },
        ]}
      />,
    );

    expect(screen.getAllByText("Mesmo valor")).toHaveLength(2);
  });

  it("does not compare annual statements with different reported closing dates", () => {
    render(
      <StockAnalysisReading
        periods={[
          { ...annualPeriod, referenceDate: "2023-12-31" },
          { ...annualPeriod, referenceDate: "2024-06-30" },
        ]}
      />,
    );

    expect(
      screen.getByText(/Sem períodos anuais consecutivos e alinhados/),
    ).toBeTruthy();
    expect(screen.queryByText("Receita anual")).toBeNull();
    expect(screen.queryByText("Lucro líquido anual")).toBeNull();
  });

  it("places long interpretation limitations under an accessible disclosure", async () => {
    render(<StockAnalysisReading periods={[annualPeriod]} />);
    const user = userEvent.setup();

    expect(screen.queryByText(/Mudanças de critérios contábeis/)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /como ler estes dados/i }),
    );
    expect(
      await screen.findByText(/Mudanças de critérios contábeis/),
    ).toBeTruthy();
    expect(
      screen.getByText(/duração exata dos períodos não é validada/),
    ).toBeTruthy();
    expect(screen.getByText(/sem ajuste pela inflação/)).toBeTruthy();
  });

  it("explains when annual statements are unavailable", () => {
    render(<StockAnalysisReading periods={[]} />);

    expect(
      screen.getByText(/Ainda não há demonstrações anuais disponíveis/),
    ).toBeTruthy();
  });
});
