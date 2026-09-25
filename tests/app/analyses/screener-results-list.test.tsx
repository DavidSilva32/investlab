/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  ScreenerResultsList,
  type ScreenerResult,
} from "@/app/analyses/_components/screener-results-list";

const counts = {
  withNetIncome: 20,
  withEquity: 19,
  withRoe: 18,
  withNetMargin: 17,
  withPe: 15,
  withPb: 14,
};

function company(index: number): ScreenerResult {
  return {
    cnpj: String(index).padStart(14, "0"),
    cvmCode: String(index),
    name: `Empresa ${String(index).padStart(2, "0")}`,
    sector: index === 1 ? "Indústria" : null,
    quantitativeEligible: index !== 2,
    securities: [
      { ticker: `TICK${index}3`, name: `Ação ${index}` },
      ...(index === 1
        ? [{ ticker: `TICK${index}4`, name: `Ação preferencial ${index}` }]
        : []),
    ],
    metrics: {
      latestNetIncome: index === 1 ? 1250 : null,
      latestEquity: index === 1 ? 5000 : null,
      roe: index === 1 ? 25 : null,
      netMargin: index === 1 ? 12.5 : null,
      pe: index === 1 ? 8.4 : null,
      pb: index === 1 ? 1.6 : null,
      valuationMarketDate: index === 1 ? "2026-09-24T21:31:30.000Z" : null,
      valuationFinancialDate: index === 1 ? "2025-12-31" : null,
      valuationSourceTicker: index === 1 ? "PETR3" : null,
    },
  };
}

afterEach(cleanup);

describe("ScreenerResultsList", () => {
  it("shows coverage context and only the first 12 cards from 25 results", () => {
    const results = Array.from({ length: 25 }, (_, index) =>
      company(index + 1),
    );
    render(<ScreenerResultsList results={results} counts={counts} />);

    expect(screen.getByText("Cobertura dos fundamentos")).toBeTruthy();
    expect(
      screen.getByText(
        /setor validado e fatos financeiros compatíveis.*preço recente validado/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Mostrando 1–12 de 25")).toBeTruthy();
    expect(screen.getByText("Empresa 01")).toBeTruthy();
    expect(screen.getByText("Empresa 12")).toBeTruthy();
    expect(screen.queryByText("Empresa 13")).toBeNull();
    expect(screen.getByText("1.250")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(
      screen.getByText(/Base das múltiplas: BRAPI .*PETR3.*DFP/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "TICK13 · Analisar" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=TICK13");
    expect(
      screen.getByText(
        "Fundamentos quantitativos indisponíveis para este setor.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Paginação dos resultados" }),
    ).toBeTruthy();
  });

  it("navigates accessible pages and shows the final partial page", async () => {
    const user = userEvent.setup();
    const results = Array.from({ length: 25 }, (_, index) =>
      company(index + 1),
    );
    render(<ScreenerResultsList results={results} counts={counts} />);

    const previous = screen.getByRole("button", { name: "Página anterior" });
    const next = screen.getByRole("button", { name: "Próxima página" });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    await user.click(next);
    expect(screen.getByText("Mostrando 13–24 de 25")).toBeTruthy();
    expect(screen.getByText("Empresa 13")).toBeTruthy();
    expect(screen.queryByText("Empresa 12")).toBeNull();
    await user.click(next);
    expect(screen.getByText("Mostrando 25–25 de 25")).toBeTruthy();
    expect(screen.getByText("Empresa 25")).toBeTruthy();
    expect((next as HTMLButtonElement).disabled).toBe(true);
    await user.click(previous);
    expect(screen.getByText("Mostrando 13–24 de 25")).toBeTruthy();
  });

  it("resets to the first page when a new result set arrives", async () => {
    const user = userEvent.setup();
    const initialResults = Array.from({ length: 25 }, (_, index) =>
      company(index + 1),
    );
    const { rerender } = render(
      <ScreenerResultsList results={initialResults} counts={counts} />,
    );
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Mostrando 25–25 de 25")).toBeTruthy();

    const newResults = Array.from({ length: 30 }, (_, index) =>
      company(101 + index),
    );
    rerender(<ScreenerResultsList results={newResults} counts={counts} />);
    await waitFor(() =>
      expect(screen.getByText("Mostrando 1–12 de 30")).toBeTruthy(),
    );
    expect(screen.getByText("Empresa 101")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Paginação dos resultados" }),
    ).toBeTruthy();
  });

  it("keeps coverage visible for an empty result set without creating page controls", () => {
    render(<ScreenerResultsList results={[]} counts={counts} />);

    expect(screen.getByText("Cobertura dos fundamentos")).toBeTruthy();
    expect(screen.queryByText(/Mostrando/)).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
