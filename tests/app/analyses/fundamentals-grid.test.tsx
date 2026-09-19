// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundamentalsGrid } from "@/app/analyses/_components/fundamentals-grid";

describe("FundamentalsGrid", () => {
  it("renders annual financial values", () => {
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
    expect(screen.getByText("Patrimônio")).toBeTruthy();
  });

  it("explains when the requested statement type is unavailable", () => {
    render(<FundamentalsGrid type="ITR" periods={[]} />);
    expect(screen.getByText("Sem ITR disponível.")).toBeTruthy();
  });
});
