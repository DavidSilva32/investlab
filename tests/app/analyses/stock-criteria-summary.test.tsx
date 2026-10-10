// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockCriteriaSummary } from "@/app/analyses/_components/stock-criteria-summary";
import type { StockAnalysis } from "@/app/analyses/_components/stock-analysis-types";

const preferencesKey = "investlab:analyses:stock-criteria:v1";
const summaryText = async () =>
  (
    await screen.findByRole("region", { name: "Critérios de análise" })
  ).textContent?.replace(/\s+/g, " ");

function analysis(overrides: Partial<StockAnalysis> = {}): StockAnalysis {
  return {
    ticker: "ABCD3",
    issuerSector: "Alimentos",
    issuerMetadataUpdatedAt: "2026-10-02T00:00:00.000Z",
    instrumentType: "stock",
    cnpj: "00000000000191",
    companyName: "Empresa de exemplo",
    price: 20,
    changePercent: null,
    priceUpdatedAt: "2026-10-01T12:00:00.000Z",
    history: [],
    fundamentals: [
      {
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodType: "annual",
        periodBasis: "annual",
        equity: "1000000",
        revenue: "2000000",
        netIncome: "100000",
      },
    ],
    indicators: [
      {
        key: "pe",
        value: 12,
        unavailableReason: null,
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodBasis: "annual",
        marketDataDate: "2026-10-01T12:00:00.000Z",
      },
      {
        key: "pb",
        value: 1.8,
        unavailableReason: null,
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodBasis: "point_in_time",
      },
      {
        key: "roe",
        value: 12,
        unavailableReason: null,
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodBasis: "annual",
      },
      {
        key: "netMargin",
        value: 5,
        unavailableReason: null,
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        periodBasis: "annual",
      },
    ],
    ...overrides,
  };
}

describe("StockCriteriaSummary", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows criteria statuses without a universal score and leaves missing metrics neutral", async () => {
    render(<StockCriteriaSummary analysis={analysis()} />);

    expect(await summaryText()).toContain(
      "1 atendido · 2 avaliáveis · 2 sem base confiável",
    );
    expect(screen.getByText("P/L")).toBeTruthy();
    expect(screen.getByText(/Setor CVM: Alimentos/)).toBeTruthy();
    expect(
      screen.getByText(/cadastro atualizado em 02\/10\/2026/),
    ).toBeTruthy();
    expect(screen.getAllByText("Atende").length).toBeGreaterThan(0);
    expect(screen.getByText("Não atende")).toBeTruthy();
    expect(screen.getAllByText("Sem dado confiável").length).toBeGreaterThan(0);
    expect(screen.getByText("P/VP 1,8x")).toBeTruthy();
    expect(screen.getByText(/DY —/)).toBeTruthy();
    expect(screen.queryByText(/score/i)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(await screen.findByText("Demonstrações: 31/12/2025.")).toBeTruthy();
    expect(screen.getByText(/Cotação: 01\/10\/2026/)).toBeTruthy();
  });

  it("loads saved browser preferences and allows editing and restoring defaults", async () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ maximumPe: 10, minimumRoePercent: 8 }),
    );
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);

    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    const peInput = await screen.findByLabelText("P/L máximo");
    expect((peInput as HTMLInputElement).value).toBe("10");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("8");
    await user.clear(peInput);
    await user.type(peInput, "11");
    const roeInput = screen.getByLabelText("ROE mínimo (%)");
    await user.clear(roeInput);
    await user.type(roeInput, "9");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));

    expect(
      await screen.findByText("Critérios salvos neste navegador."),
    ).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(preferencesKey) ?? "{}"),
    ).toEqual({
      maximumPe: 11,
      minimumRoePercent: 9,
    });

    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    await user.click(
      await screen.findByRole("button", { name: "Restaurar padrões" }),
    );
    expect(
      await screen.findByText("Padrões restaurados neste navegador."),
    ).toBeTruthy();
    expect(window.localStorage.getItem(preferencesKey)).toBeNull();
  });

  it("applies a preset to the editable thresholds", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    await user.click(
      await screen.findByRole("button", { name: "Mais restrito" }),
    );
    expect(
      (screen.getByLabelText("P/L máximo") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("20");
    await user.click(screen.getByRole("button", { name: "Padrão" }));
    expect(
      (screen.getByLabelText("P/L máximo") as HTMLInputElement).value,
    ).toBe("15");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("15");
    await user.click(screen.getByRole("button", { name: "Mais amplo" }));
    expect(
      (screen.getByLabelText("P/L máximo") as HTMLInputElement).value,
    ).toBe("20");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("10");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Critérios salvos neste navegador."),
    ).toBeTruthy();
  });

  it("rejects non-positive configured limits", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    const peInput = await screen.findByLabelText("P/L máximo");
    await user.clear(peInput);
    await user.type(peInput, "0");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Informe limites maiores que zero."),
    ).toBeTruthy();
    expect(window.localStorage.getItem(preferencesKey)).toBeNull();
  });

  it("does not present stale or sector-unknown financial data as a signal", async () => {
    render(
      <StockCriteriaSummary
        analysis={analysis({ fundamentalsIsStale: true, issuerSector: null })}
      />,
    );
    expect(await screen.findByText(/dados financeiros antigos/i)).toBeTruthy();
    expect(await summaryText()).toContain(
      "0 atendidos · 0 avaliáveis · 4 sem base confiável",
    );
  });

  it("renders ambiguous instrument as unavailable rather than not applicable", async () => {
    render(
      <StockCriteriaSummary
        analysis={analysis({
          instrumentType: "unknown",
          issuerSector: "Emp. Adm. Part. - Bancos",
        })}
      />,
    );
    expect(await summaryText()).toContain(
      "0 atendidos · 0 avaliáveis · 4 sem base confiável",
    );
    expect(screen.getAllByText("Sem dado confiável").length).toBeGreaterThan(0);
  });

  it("shows explicit non-applicability for a confirmed FII", async () => {
    render(
      <StockCriteriaSummary analysis={analysis({ instrumentType: "fii" })} />,
    );
    expect(await summaryText()).toContain("0 atendidos · 0 avaliáveis");
    expect(screen.getAllByText("Não aplicável").length).toBeGreaterThan(0);
    expect(screen.queryByText("P/VP 1,8x")).toBeNull();
  });

  it("uses defaults for individually invalid preference values", async () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ maximumPe: 0, minimumRoePercent: "15" }),
    );
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    expect(
      ((await screen.findByLabelText("P/L máximo")) as HTMLInputElement).value,
    ).toBe("15");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("15");
  });

  it("keeps sector rules neutral and explains missing reference dates", async () => {
    const user = userEvent.setup();
    const financial = analysis({
      issuerSector: "Bancos",
      indicators: analysis().indicators.map((item) =>
        item.key === "roe"
          ? { ...item, periodBasis: "trailing_twelve_months" as const }
          : item,
      ),
    });
    render(<StockCriteriaSummary analysis={financial} />);
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(
      await screen.findByText(
        "A metodologia setorial atual não valida este critério.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ajuda sobre ROIC" }));
    expect(
      screen.getByText(
        "A metodologia setorial atual não valida este critério.",
      ),
    ).toBeTruthy();
  });

  it("handles invalid or absent dates and unconfirmed sectors neutrally", async () => {
    const user = userEvent.setup();
    const invalidDate = analysis({
      issuerSector: null,
      issuerMetadataUpdatedAt: "invalid",
      indicators: analysis().indicators.map((item) =>
        item.key === "pe"
          ? { ...item, referenceDate: "invalid", marketDataDate: "invalid" }
          : item.key === "roe"
            ? { ...item, referenceDate: null, sourceDocument: null }
            : item,
      ),
    });
    render(<StockCriteriaSummary analysis={invalidDate} />);
    expect(await screen.findByText(/Setor CVM:.*não confirmado/)).toBeTruthy();
    expect(
      screen.getByText(/cadastro atualizado em data indisponível/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(
      await screen.findByText("Demonstrações: data indisponível."),
    ).toBeTruthy();
    expect(screen.getByText("Data da cotação indisponível.")).toBeTruthy();
    expect(
      screen.getByText(
        "Não foi possível confirmar o setor para aplicar a metodologia.",
      ),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Ajuda sobre ROE" }));
    expect(
      screen.getByText("Data-base das demonstrações indisponível."),
    ).toBeTruthy();
  });

  it("renders the same initial thresholds during server rendering", () => {
    expect(
      renderToString(<StockCriteriaSummary analysis={analysis()} />),
    ).toContain("Critérios de análise");
  });

  it("does not use ROE when its equity source is missing or invalid", async () => {
    const missingSource = analysis({
      indicators: analysis().indicators.map((item) =>
        item.key === "roe" ? { ...item, referenceDate: null } : item,
      ),
    });
    const { rerender } = render(
      <StockCriteriaSummary analysis={missingSource} />,
    );
    expect(await summaryText()).toContain("1 avaliável");
    rerender(
      <StockCriteriaSummary
        analysis={analysis({
          fundamentals: analysis().fundamentals.map((period) => ({
            ...period,
            equity: "not-a-number",
          })),
        })}
      />,
    );
    expect(await summaryText()).toContain("1 avaliável");
  });

  it("keeps unconfirmed types neutral and handles absent reference metadata", async () => {
    const user = userEvent.setup();
    render(
      <StockCriteriaSummary
        analysis={analysis({
          instrumentType: undefined,
          issuerSector: undefined,
          issuerMetadataUpdatedAt: undefined,
          priceIsStale: true,
          indicators: analysis().indicators.map((item) =>
            item.key === "pe"
              ? { ...item, referenceDate: null, marketDataDate: null }
              : item,
          ),
        })}
      />,
    );
    expect(await summaryText()).toContain("4 sem base confiável");
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(
      await screen.findByText("Data-base das demonstrações indisponível."),
    ).toBeTruthy();
    expect(screen.getByText("Data da cotação indisponível.")).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    await user.keyboard("{Escape}");
  });

  it("keeps ROE unavailable without matching positive equity and explains missing industrial data", async () => {
    const user = userEvent.setup();
    render(
      <StockCriteriaSummary
        analysis={analysis({
          fundamentals: [],
          indicators: analysis().indicators.map((item) =>
            item.key === "roe"
              ? { ...item, referenceDate: "2024-12-31" }
              : item,
          ),
        })}
      />,
    );
    const region = await screen.findByRole("region", {
      name: "Critérios de análise",
    });
    expect(region.textContent).toContain("3 sem base confiável");
    await user.click(screen.getByRole("button", { name: "Ajuda sobre ROIC" }));
    expect(
      await screen.findByText(
        "A fonte atual não fornece este indicador de forma confiável.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Data-base das demonstrações indisponível."),
    ).toBeTruthy();
  });

  it("handles invalid storage and storage write restrictions", async () => {
    window.localStorage.setItem(preferencesKey, "not-json");
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    const peInput = await screen.findByLabelText("P/L máximo");
    expect((peInput as HTMLInputElement).value).toBe("15");
    await user.clear(peInput);
    await user.type(peInput, "12");
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Critérios aplicados até fechar esta página."),
    ).toBeTruthy();
    setItem.mockRestore();
  });

  it("handles failure to remove browser preferences when restoring defaults", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Ajustar critérios" }));
    const removeItem = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    await user.click(
      await screen.findByRole("button", { name: "Restaurar padrões" }),
    );
    expect(
      await screen.findByText("Padrões restaurados até fechar esta página."),
    ).toBeTruthy();
    removeItem.mockRestore();
  });

  it("uses defaults when browser storage cannot be read", async () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    render(<StockCriteriaSummary analysis={analysis()} />);
    expect(await summaryText()).toContain("2 avaliáveis");
    getItem.mockRestore();
  });
});
