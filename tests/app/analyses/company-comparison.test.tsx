// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyComparison } from "@/app/analyses/_components/company-comparison";

vi.mock("@/app/analyses/_components/analysis-stock-search", () => ({
  AnalysisStockSearch: ({
    ticker,
    onSelect,
  }: {
    ticker: string;
    onSelect: (option: { ticker: string; name: string }) => void;
  }) => (
    <section aria-label="Pesquisar empresas">
      <p>Busca atual: {ticker || "vazia"}</p>
      {["PETR3", "PETR4", "VALE3", "ITUB4", "SANB11", "BBDC4", "BBAS3"].map(
        (symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() =>
              onSelect({ ticker: symbol, name: `Empresa ${symbol}` })
            }
          >
            Selecionar {symbol}
          </button>
        ),
      )}
    </section>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function metric(
  value: number | null,
  unavailableReason: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    value,
    referenceDate: "2026-06-30",
    periodStart: "2025-07-01",
    periodBasis: "trailing_twelve_months",
    sourceDocument: "ITR" as const,
    sourceSummary: "DFP 2025 + ITR acumulado 2026 − comparativo 2025",
    marketDataDate: "2026-10-06T15:00:00Z",
    accountProvenance: "CVM consolidado",
    unavailableReason,
    ...overrides,
  };
}

function company(ticker: string, cnpj: string, selectedTickers = [ticker]) {
  return {
    ticker,
    selectedTickers,
    name: `Companhia ${ticker}`,
    cnpj,
    cvmCode: "001234",
    sector: "Petróleo e Gás",
    metadataUpdatedAt: "2026-10-01T00:00:00.000Z",
    identityVerified: true,
    fundamentals: {
      roe: metric(12),
      netMargin: metric(null, "Período incompatível."),
    },
    valuation: {
      pe: metric(null, "Cotações sem conciliação de classe."),
      pb: metric(null, "Cotações sem conciliação de classe."),
    },
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("CompanyComparison", () => {
  it("seeds a consulted ticker and compares in selection order with individual links", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sector: "Petróleo e Gás",
        sectorMetadataAsOf: "2026-10-01T00:00:00.000Z",
        companies: [
          company("PETR4", "33000167000101"),
          company("VALE3", "33000167000102"),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="petr4" />);

    expect(screen.getByText("Busca atual: PETR4")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    expect(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    ).toHaveProperty("disabled", false);
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyses/companies/compare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tickers: ["PETR4", "VALE3"] }),
      }),
    );
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(
      screen.getByText("Cadastro CVM atualizado em 01/10/2026"),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Abrir análise individual" })[0]
        ?.getAttribute("href"),
    ).toBe("/analyses?ticker=PETR4");
    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]?.textContent).toContain("PETR4");
    expect(headers[2]?.textContent).toContain("VALE3");
    expect(screen.getAllByText("Indisponível").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/DFP 2025 \+ ITR acumulado 2026/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("33000167000101")).toBeNull();
  });

  it("prevents more than five selected tickers and lets the user remove a selection", async () => {
    render(<CompanyComparison />);
    const user = userEvent.setup();
    for (const ticker of ["PETR3", "PETR4", "VALE3", "ITUB4", "BBDC4"])
      await user.click(
        screen.getByRole("button", { name: `Selecionar ${ticker}` }),
      );

    await user.click(screen.getByRole("button", { name: "Selecionar BBAS3" }));
    expect(screen.getByRole("alert").textContent).toContain("até cinco");
    expect(screen.getByText("5 de 5 empresas selecionadas")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remover PETR3" }));
    expect(screen.getByText("4 de 5 empresas selecionadas")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover PETR3" })).toBeNull();
  });

  it("shows loading feedback and reports API errors inline", async () => {
    let finishRequest: ((response: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => (finishRequest = resolve)),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyComparison />);
    await user.click(screen.getByRole("button", { name: "Selecionar PETR3" }));
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect(screen.getByRole("status").textContent).toContain("Consultando");
    finishRequest?.(
      jsonResponse(
        { message: "Não foi possível confirmar o vínculo CVM." },
        false,
      ),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível confirmar o vínculo CVM.",
    );
  });

  it("reports transport failure safely and groups share classes under one issuer", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("private network details"))
      .mockResolvedValueOnce(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [
            company("PETR3", "33000167000101", ["PETR3", "PETR4"]),
            company("VALE3", "33000167000102"),
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyComparison />);
    await user.click(screen.getByRole("button", { name: "Selecionar PETR3" }));
    await user.click(screen.getByRole("button", { name: "Selecionar PETR4" }));
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível comparar as empresas agora.",
    );

    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Classes do mesmo CNPJ foram agrupadas",
    );
    expect(screen.getByText("2 de 5 empresas selecionadas")).toBeTruthy();
    expect(screen.queryByText("private network details")).toBeNull();
  });

  it("shows the bank ROE label and handles missing sector metadata", async () => {
    const bankResult = {
      sector: "Bancos",
      sectorMetadataAsOf: null,
      companies: [
        company("ITUB4", "33000167000101"),
        company("SANB11", "33000167000102"),
      ],
    };
    const noSectorResult = {
      sector: null,
      sectorMetadataAsOf: null,
      companies: [
        company("PETR3", "33000167000103"),
        company("VALE3", "33000167000104"),
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bankResult))
      .mockResolvedValueOnce(jsonResponse(noSectorResult));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="ITUB4" />);
    await user.click(screen.getByRole("button", { name: "Selecionar ITUB4" }));
    expect(screen.getByText("1 de 5 empresas selecionadas")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Selecionar SANB11" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect(
      await screen.findByText("ROE contábil simplificado LTM"),
    ).toBeTruthy();

    cleanup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect(await screen.findByText("não informado")).toBeTruthy();
  });

  it("renders valid source metadata when a reference date is invalid or absent", async () => {
    const petr = company("PETR3", "33000167000101");
    petr.fundamentals.roe = metric(12, null, {
      referenceDate: "invalid-date",
      periodStart: null,
      periodBasis: "annual",
      sourceDocument: "DFP",
      sourceSummary: null,
      marketDataDate: null,
    });
    petr.valuation.pe = metric(null, "Cotação indisponível.", {
      referenceDate: null,
      periodStart: null,
      periodBasis: null,
      sourceDocument: null,
      sourceSummary: null,
      marketDataDate: null,
    });
    petr.valuation.pb = metric(1.5, null, {
      referenceDate: null,
      periodStart: null,
      periodBasis: null,
      sourceDocument: null,
      sourceSummary: null,
      marketDataDate: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [petr, company("VALE3", "33000167000102")],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findByText(/CVM DFP/)).toBeTruthy();
    expect(screen.getByText("1,5x")).toBeTruthy();
    expect(screen.queryByText(/até Invalid Date/)).toBeNull();
  });
});
