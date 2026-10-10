// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockCriteriaSummary } from "@/app/analyses/_components/stock-criteria-summary";
import type { StockAnalysis } from "@/app/analyses/_components/stock-analysis-types";

const preferencesKey = "investlab:analyses:stock-criteria:v1";

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
        marketDataDate: "2026-10-01T12:00:00.000Z",
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
    vi.restoreAllMocks();
  });

  it("integrates each indicator and its evaluation in one compact card", async () => {
    render(<StockCriteriaSummary analysis={analysis()} />);

    expect(
      screen.getByRole("region", { name: "Indicadores financeiros" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "P/L" })).toHaveLength(1);
    expect(
      screen.getByRole("listitem", {
        name: /P\/L: 12,0x, referência 15,0x, Dentro do limite/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", {
        name: /P\/VP: 1,8x, referência 2,5x, Dentro do limite/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Margem Líquida")).toBeTruthy();
    expect(screen.queryByText("Critérios de análise")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ajuda sobre P/L" }));
    expect(await screen.findByText(/Cotação observada em/)).toBeTruthy();
    expect(
      screen.getByText(/Referência configurada: máximo de 15x/),
    ).toBeTruthy();
  });

  it("keeps raw numbers visible while stale data cannot generate criterion signals", () => {
    render(
      <StockCriteriaSummary
        analysis={analysis({ priceIsStale: true, fundamentalsIsStale: true })}
      />,
    );
    expect(
      screen.getByRole("listitem", { name: /P\/L: 12,0x, Desatualizado/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", { name: /ROE: 12,0%, Desatualizado/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Limites suspensos/i)).toBeTruthy();
  });

  it("shows financial-sector valuation values with method-specific applicability", () => {
    render(
      <StockCriteriaSummary analysis={analysis({ issuerSector: "Bancos" })} />,
    );
    expect(
      screen.getByRole("listitem", { name: /P\/L: 12,0x, Não aplicável/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", {
        name: /P\/VP: 1,8x, referência 2,5x, Dentro do limite/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", {
        name: /Margem Líquida: 5.0%, Não aplicável/,
      }),
    ).toBeTruthy();
  });

  it("does not clamp a mathematically possible margin above one hundred percent", () => {
    render(
      <StockCriteriaSummary
        analysis={analysis({
          indicators: analysis().indicators.map((indicator) =>
            indicator.key === "netMargin"
              ? { ...indicator, value: 215.1 }
              : indicator,
          ),
        })}
      />,
    );
    expect(
      screen.getByRole("listitem", {
        name: /Margem Líquida: 215,1%, Informativo/,
      }),
    ).toBeTruthy();
  });

  it("uses sector-specific neutral status for unknown sectors and unconfirmed instruments", () => {
    render(
      <StockCriteriaSummary
        analysis={analysis({ issuerSector: null, instrumentType: "unknown" })}
      />,
    );
    expect(
      screen.getByRole("listitem", { name: /P\/L: 12,0x, Sem dados/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", {
        name: /Margem Líquida: 5.0%, Não aplicável/,
      }),
    ).toBeTruthy();
  });

  it("loads saved custom preferences and allows editing and saving them", async () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({
        preset: "custom",
        maximumPe: 10,
        maximumPb: 1.2,
        minimumRoePercent: 8,
      }),
    );
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Limites" }));
    expect(
      (screen.getByLabelText("P/L máximo") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      (screen.getByLabelText("ROE mínimo (%)") as HTMLInputElement).value,
    ).toBe("8");
    expect(
      (screen.getByLabelText("P/VP máximo") as HTMLInputElement).value,
    ).toBe("1.2");
    await user.clear(screen.getByLabelText("P/L máximo"));
    await user.type(screen.getByLabelText("P/L máximo"), "11");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Limites salvos neste navegador."),
    ).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(preferencesKey) ?? "{}"),
    ).toEqual({
      preset: "custom",
      maximumPe: 11,
      maximumPb: 1.2,
      minimumRoePercent: 8,
    });
  });

  it("switches to custom mode when the user edits optional thresholds", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Limites" }));
    await user.click(screen.getByRole("button", { name: /Personalizado/ }));
    const pb = screen.getByLabelText("P/VP máximo");
    await user.clear(pb);
    await user.type(pb, "1.8");
    const roe = screen.getByLabelText("ROE mínimo (%)");
    await user.clear(roe);
    await user.type(roe, "12");
    expect((pb as HTMLInputElement).value).toBe("1.8");
    expect((roe as HTMLInputElement).value).toBe("12");
  });

  it("falls back to defaults when stored preferences are malformed or inaccessible", () => {
    window.localStorage.setItem(preferencesKey, "not-json");
    const first = render(<StockCriteriaSummary analysis={analysis()} />);
    expect(
      screen.getByRole("listitem", { name: /P\/VP: 1,8x, referência 2,5x/ }),
    ).toBeTruthy();
    first.unmount();

    window.localStorage.removeItem(preferencesKey);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<StockCriteriaSummary analysis={analysis()} />);
    expect(
      screen.getByRole("listitem", { name: /P\/VP: 1,8x, referência 2,5x/ }),
    ).toBeTruthy();
  });

  it("handles missing or invalid ROE equity data and dialog dismissal", async () => {
    const user = userEvent.setup();
    const withoutRoeDate = analysis({
      indicators: analysis().indicators.map((indicator) =>
        indicator.key === "roe"
          ? { ...indicator, referenceDate: null }
          : indicator,
      ),
    });
    const view = render(<StockCriteriaSummary analysis={withoutRoeDate} />);
    await user.click(screen.getByRole("button", { name: "Limites" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    const invalidEquity = analysis({
      fundamentals: analysis().fundamentals.map((period) => ({
        ...period,
        equity: "not-a-number",
      })),
    });
    view.rerender(<StockCriteriaSummary analysis={invalidEquity} />);
    expect(
      screen.getByRole("listitem", { name: /ROE: 12,0%, Sem dados/ }),
    ).toBeTruthy();
  });

  it.each([
    [
      "Conservador",
      "P/L máximo",
      "10",
      "P/VP máximo",
      "1.5",
      "ROE mínimo (%)",
      "20",
    ],
    [
      "Equilibrado",
      "P/L máximo",
      "15",
      "P/VP máximo",
      "2.5",
      "ROE mínimo (%)",
      "15",
    ],
  ])(
    "applies the %s preset including its P/VP reference",
    async (preset, peLabel, pe, pbLabel, pb, roeLabel, roe) => {
      const user = userEvent.setup();
      render(<StockCriteriaSummary analysis={analysis()} />);
      await user.click(screen.getByRole("button", { name: "Limites" }));
      await user.click(
        screen.getByRole("button", { name: new RegExp(preset) }),
      );
      expect((screen.getByLabelText(peLabel) as HTMLInputElement).value).toBe(
        pe,
      );
      expect((screen.getByLabelText(pbLabel) as HTMLInputElement).value).toBe(
        pb,
      );
      expect((screen.getByLabelText(roeLabel) as HTMLInputElement).value).toBe(
        roe,
      );
    },
  );

  it("allows disabling optional P/VP, rejects invalid limits, and restores defaults", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Limites" }));
    await user.click(screen.getByLabelText("Ativo"));
    expect(
      (screen.getByLabelText("P/VP máximo") as HTMLInputElement).disabled,
    ).toBe(true);
    const pe = screen.getByLabelText("P/L máximo");
    await user.clear(pe);
    await user.type(pe, "0");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Use limites maiores que zero."),
    ).toBeTruthy();
    await user.clear(pe);
    await user.type(pe, "15");
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    await user.click(screen.getByRole("button", { name: "Limites" }));
    await user.click(screen.getByRole("button", { name: "Restaurar padrões" }));
    expect(await screen.findByText("Padrões restaurados.")).toBeTruthy();
    expect(window.localStorage.getItem(preferencesKey)).toBeNull();
  });

  it("restores defaults locally when browser storage cannot be written or removed", async () => {
    const user = userEvent.setup();
    render(<StockCriteriaSummary analysis={analysis()} />);
    await user.click(screen.getByRole("button", { name: "Limites" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await user.click(screen.getByRole("button", { name: "Salvar limites" }));
    expect(
      await screen.findByText("Limites ativos até fechar esta página."),
    ).toBeTruthy();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await user.click(screen.getByRole("button", { name: "Limites" }));
    await user.click(screen.getByRole("button", { name: "Restaurar padrões" }));
    expect(
      await screen.findByText("Padrões restaurados até fechar esta página."),
    ).toBeTruthy();
  });

  it("recognizes legacy conservative browser preferences and malformed or inaccessible storage", () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ maximumPe: 10, maximumPb: null, minimumRoePercent: 20 }),
    );
    const { unmount } = render(<StockCriteriaSummary analysis={analysis()} />);
    expect(
      screen.getByRole("listitem", {
        name: /P\/VP: 1,8x, referência 1,5x, Fora do limite/,
      }),
    ).toBeTruthy();
    unmount();
    window.localStorage.setItem(preferencesKey, "bad-json");
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() =>
      renderToString(<StockCriteriaSummary analysis={analysis()} />),
    ).not.toThrow();
    getItem.mockRestore();
  });

  it("renders compact indicators consistently during server rendering", () => {
    expect(
      renderToString(<StockCriteriaSummary analysis={analysis()} />),
    ).toContain("Margem Líquida");
  });
});
