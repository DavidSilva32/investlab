// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockValuationPanel } from "@/app/analyses/_components/stock-valuation-panel";

describe("StockValuationPanel", () => {
  it("shows a simple unavailable state without asking the user to act", () => {
    render(<StockValuationPanel ticker="TEST3" />);

    expect(screen.getByText("Estimativa de valor indisponível")).toBeTruthy();
    expect(
      screen.getByText(
        "O InvestLab ainda não pode apresentar uma estimativa confiável para TEST3.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Não é necessário preencher dados ou realizar qualquer ação.",
      ),
    ).toBeTruthy();
  });

  it("does not expose manual forms, technical methodology, or valuation actions", () => {
    render(<StockValuationPanel ticker="TEST3" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.queryByText(
        /FCFF|CAPM|ERP|beta|WACC|taxa-base|sensibilidade|metodologia|horizonte|custo da dívida|peso do capital/i,
      ),
    ).toBeNull();
  });
});
