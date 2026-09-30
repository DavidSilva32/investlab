// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FundamentalsGrid } from "@/app/analyses/_components/fundamentals-grid";

describe("FundamentalsGrid", () => {
  afterEach(cleanup);
  it("renders annual values without compacting the exact amounts", () => {
    render(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2025-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
        ]}
      />,
    );
    expect(screen.getByText("Receita")).toBeTruthy();
    expect(screen.getByText("Lucro líquido")).toBeTruthy();
    expect(screen.getByText("Patrimônio líquido")).toBeTruthy();
    expect(screen.getByText(/1\.000\.000,00/)).toBeTruthy();
  });
  it("explains when the requested statement type is unavailable", () => {
    render(<FundamentalsGrid type="ITR" periods={[]} />);
    expect(
      screen.getByText("Sem informações trimestrais disponíveis."),
    ).toBeTruthy();
  });

  it("shows annual direction and percent only for consecutive aligned DFP periods", () => {
    render(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "-100000",
            equity: "500000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "1100000",
            netIncome: "-50000",
            equity: "550000",
          },
        ]}
      />,
    );

    expect(screen.getByText(/Aumentou R\$\s?100\.000 \(\+10%\)/)).toBeTruthy();
    expect(screen.getByText(/Aumentou R\$\s?50\.000$/)).toBeTruthy();
    expect(screen.getAllByLabelText(/Aumentou entre 2023 e 2024/)).toHaveLength(
      2,
    );
  });

  it("does not compare nonconsecutive or differently anchored annual periods", () => {
    const { rerender } = render(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2022-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "1100000",
            netIncome: "120000",
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/entre 2023 e 2024/)).toBeNull();

    rerender(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2024-06-30",
            sourceDocument: "DFP",
            revenue: "1100000",
            netIncome: "120000",
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/entre 2023 e 2024/)).toBeNull();

    rerender(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "1100000",
            netIncome: "120000",
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/entre 2023 e 2024/)).toBeNull();
  });

  it("omits DFP movements when either annual value is nonnumeric", () => {
    const { rerender } = render(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: null,
            netIncome: "invalid",
            equity: "500000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "1100000",
            netIncome: "120000",
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/entre 2023 e 2024/)).toBeNull();

    rerender(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "1000000",
            netIncome: "100000",
            equity: "500000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "invalid",
            netIncome: null,
            equity: "550000",
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/entre 2023 e 2024/)).toBeNull();
  });

  it("marks annual declines and unchanged values with direction-only colors", () => {
    const { container } = render(
      <FundamentalsGrid
        type="DFP"
        periods={[
          {
            referenceDate: "2023-12-31",
            sourceDocument: "DFP",
            revenue: "100000",
            netIncome: "0",
            equity: "50000",
          },
          {
            referenceDate: "2024-12-31",
            sourceDocument: "DFP",
            revenue: "90000",
            netIncome: "0",
            equity: "50000",
          },
        ]}
      />,
    );

    expect(screen.getByText(/Diminuiu R\$\s?10\.000 \(-10%\)/)).toBeTruthy();
    expect(
      screen.getByLabelText(/Sem variação entre 2023 e 2024/),
    ).toBeTruthy();
    expect(container.querySelector(".text-amber-700")).toBeTruthy();
    expect(container.querySelector(".text-muted-foreground")).toBeTruthy();
  });

  it("shows interim profit sign neutrally without comparing accumulated periods", () => {
    const { rerender } = render(
      <FundamentalsGrid
        type="ITR"
        periods={[
          {
            referenceDate: "2025-03-31",
            sourceDocument: "ITR",
            revenue: "100000",
            netIncome: "10000",
            equity: "50000",
          },
          {
            referenceDate: "2025-06-30",
            sourceDocument: "ITR",
            revenue: "200000",
            netIncome: "-5000",
            equity: "45000",
          },
        ]}
      />,
    );

    expect(screen.getByText(/10\.000,00/).className).toContain(
      "text-emerald-600",
    );
    expect(screen.getByText(/-R\$\s?5\.000,00/).className).toContain(
      "text-rose-600",
    );
    expect(screen.queryByText(/Aumentou|Diminuiu/)).toBeNull();

    rerender(
      <FundamentalsGrid
        type="ITR"
        periods={[
          {
            referenceDate: "2025-03-31",
            sourceDocument: "ITR",
            revenue: "100000",
            netIncome: "0",
            equity: "50000",
          },
        ]}
      />,
    );
    expect(screen.getByText(/R\$\s?0,00/).className).not.toMatch(
      /text-(?:emerald|rose)-600/,
    );
  });
});
it("labels accumulated interim data and marks invalid values as unavailable", () => {
  render(
    <FundamentalsGrid
      type="ITR"
      periods={[
        {
          referenceDate: "2026-06-30",
          sourceDocument: "ITR",
          revenue: null,
          netIncome: "invalid",
          equity: "0",
        },
      ]}
    />,
  );

  expect(screen.getByText(/Acumulado at?/)).toBeTruthy();
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.getByText("R$ 0,00")).toBeTruthy();
});
