// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyComparison } from "@/app/(private)/analyses/_components/company-comparison";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";
import type { ReactNode } from "react";
import { stockCriteriaPreferencesStorageKey } from "@/lib/stock-criteria-preferences";

function render(ui: ReactNode) {
  return renderBase(<QueryClientWrapper>{ui}</QueryClientWrapper>);
}

vi.mock("@/app/(private)/analyses/_components/analysis-stock-search", () => ({
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
  vi.useRealTimers();
  window.localStorage.clear();
});

beforeEach(() => window.localStorage.clear());

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
    valuationSource: null,
    valuationMethod: null,
    accountProvenance: "CVM consolidado",
    unavailableReason,
    comparisonStatus: "comparable" as const,
    comparisonReason: null,
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
  it("polls refresh status and recalculates once every selected company is complete", async () => {
    vi.useFakeTimers();
    const makeCompany = (ticker: string, status: "running" | "completed") => ({
      ...company(
        ticker,
        ticker === "PETR3" ? "33000167000101" : "33000167000102",
      ),
      fundamentalsRefresh: {
        status,
        retryAfter: null,
        errorCode: null,
      },
    });
    const pending = {
      sector: "Petróleo e Gás",
      sectorMetadataAsOf: null,
      companies: [
        makeCompany("PETR3", "running"),
        makeCompany("VALE3", "running"),
      ],
    };
    const completed = {
      ...pending,
      companies: [
        makeCompany("PETR3", "completed"),
        makeCompany("VALE3", "completed"),
      ],
    };
    const pendingStatus = {
      companies: [
        {
          ticker: pending.companies[0]!.ticker,
          fundamentalsRefresh: pending.companies[0]!.fundamentalsRefresh,
        },
      ],
    };
    const completedStatus = {
      companies: completed.companies.map(({ ticker, fundamentalsRefresh }) => ({
        ticker,
        fundamentalsRefresh,
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pending))
      .mockResolvedValueOnce(jsonResponse(pendingStatus))
      .mockResolvedValueOnce(jsonResponse(completedStatus))
      .mockResolvedValueOnce(jsonResponse(completed));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanyComparison initialTicker="PETR3" />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        /Atualizando dados financeiros da CVM para PETR3, VALE3/,
      ),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/analyses/companies/compare?tickers=PETR3%2CVALE3",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/analyses/companies/compare?tickers=PETR3%2CVALE3",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/analyses/companies/compare?tickers=PETR3%2CVALE3",
    );
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "POST" });
  });

  it("keeps failed refreshes visible and allows an explicit retry", async () => {
    const failed = {
      ...company("PETR3", "33000167000101"),
      fundamentalsRefresh: {
        status: "failed" as const,
        retryAfter: null,
        errorCode: "provider_error",
      },
    };
    const response = {
      sector: "Petróleo e Gás",
      sectorMetadataAsOf: null,
      companies: [failed, company("VALE3", "33000167000102")],
    };
    const pending = {
      ...response,
      companies: [
        {
          ...company("PETR3", "33000167000101"),
          fundamentalsRefresh: {
            status: "running" as const,
            retryAfter: null,
            errorCode: null,
          },
        },
        company("VALE3", "33000167000102"),
      ],
    };
    const responseStatus = {
      companies: [
        {
          ticker: "PETR3",
          fundamentalsRefresh: {
            status: "failed" as const,
            retryAfter: null,
            errorCode: "provider_error",
          },
        },
        {
          ticker: "VALE3",
          fundamentalsRefresh: {
            status: "idle" as const,
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pending))
      .mockResolvedValueOnce(jsonResponse(responseStatus))
      .mockResolvedValueOnce(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanyComparison initialTicker="PETR3" />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect(
      await screen.findByText(
        /Não foi possível atualizar os fundamentos de PETR3/,
        {},
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/analyses/companies/compare?tickers=PETR3%2CVALE3",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads status after a completed comparison is invalidated", async () => {
    const response = {
      sector: "Petróleo e Gás",
      sectorMetadataAsOf: null,
      companies: [
        company("PETR3", "33000167000101"),
        company("VALE3", "33000167000102"),
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(
        jsonResponse({
          companies: response.companies.map(({ ticker }) => ({
            ticker,
            fundamentalsRefresh: {
              status: "completed",
              retryAfter: null,
              errorCode: null,
            },
          })),
        }),
      )
      .mockResolvedValueOnce(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderBase(
      <QueryClientProvider client={queryClient}>
        <CompanyComparison initialTicker="PETR3" />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    queryClient.setQueryData(
      ["analyses", "comparison", "PETR3", "VALE3"],
      null as never,
    );
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["analyses", "comparison", "PETR3", "VALE3"],
      });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/analyses/companies/compare?tickers=PETR3%2CVALE3",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toBeUndefined();
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
    queryClient.clear();
  });

  it("honors a server retry-after deadline before enabling comparison retry", async () => {
    vi.useFakeTimers();
    const response = {
      sector: "Petróleo e Gás",
      sectorMetadataAsOf: null,
      companies: [
        {
          ...company("PETR3", "33000167000101"),
          fundamentalsRefresh: {
            status: "failed" as const,
            retryAfter: "2099-01-01T00:00:00.000Z",
            errorCode: "provider_error",
          },
        },
        company("VALE3", "33000167000102"),
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanyComparison initialTicker="PETR3" />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    const retry = screen.getByRole("button", {
      name: /Tente novamente em \d+s/,
    });
    expect(retry).toHaveProperty("disabled", true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(
      screen.getByRole("button", { name: /Tente novamente em \d+s/ }),
    ).toHaveProperty("disabled", true);
  });

  it("seeds a consulted ticker and compares in selection order with individual links", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sector: "Petróleo e Gás",
        sectorMetadataAsOf: "2026-10-01T00:00:00.000Z",
        companies: [
          {
            ...company("PETR4", "33000167000101"),
            logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
          },
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
    ).toBe("/analises?ticker=PETR4");
    expect(
      screen.getAllByRole("img", { name: "Identidade de Companhia PETR4" })
        .length,
    ).toBeGreaterThan(0);
    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]?.textContent).toContain("PETR4");
    expect(headers[2]?.textContent).toContain("VALE3");
    expect(screen.getAllByText("Indisponível").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Abaixo do mínimo · 15%").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/DFP 2025 \+ ITR acumulado 2026/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("33000167000101")).toBeNull();
  });

  it("shows valid issuer data and marks the metric non-comparable when a peer is missing", async () => {
    const first = company("PETR3", "33000167000101");
    const second = company("VALE3", "33000167000102");
    first.fundamentals.roe = metric(12, null, {
      comparisonStatus: "not_comparable",
      comparisonReason:
        "Um ou mais emissores não têm esta métrica validada: demonstração indisponível.",
    });
    second.fundamentals.roe = metric(null, "Demonstração indisponível.", {
      comparisonStatus: "not_comparable",
      comparisonReason:
        "Um ou mais emissores não têm esta métrica validada: demonstração indisponível.",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sector: "Mineração",
        sectorMetadataAsOf: "2026-10-01T00:00:00.000Z",
        companies: [first, second],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findByText("12%")).toBeTruthy();
    expect(
      screen.getAllByText(/DFP 2025 \+ ITR acumulado 2026/).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("note")
        .some((note) =>
          note.textContent?.includes("Sem comparação direta entre empresas"),
        ),
    ).toBe(true);
    expect(
      screen.getAllByText("Demonstração indisponível.").length,
    ).toBeGreaterThan(0);
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
        {
          ...company("ITUB4", "33000167000101"),
          sector: "Bancos",
          fundamentals: {
            ...company("ITUB4", "33000167000101").fundamentals,
            roe: metric(12, null, { periodBasis: "trailing_twelve_months" }),
          },
        },
        {
          ...company("SANB11", "33000167000102"),
          sector: "Bancos",
          fundamentals: {
            ...company("SANB11", "33000167000102").fundamentals,
            roe: metric(18, null, { periodBasis: "annual" }),
          },
        },
      ],
    };
    const noSectorResult = {
      sector: null,
      sectorMetadataAsOf: null,
      companies: [
        { ...company("PETR3", "33000167000103"), sector: null },
        { ...company("VALE3", "33000167000104"), sector: null },
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
    expect(screen.getByText("Abaixo do mínimo · 15%")).toBeTruthy();
    expect(screen.getByText("ROE sem base confiável")).toBeTruthy();

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
    expect(screen.getByText("ROE sem base confiável")).toBeTruthy();
    expect(screen.queryByText(/até Invalid Date/)).toBeNull();
  });

  it.each(["2025-02-31", "2025-02-28Tnot-a-time"])(
    "rejects an invalid ROE reference date: %s",
    async (referenceDate) => {
      const petr = company("PETR3", "33000167000101");
      petr.fundamentals.roe = metric(12, null, {
        referenceDate,
        periodBasis: "annual",
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
      await user.click(
        screen.getByRole("button", { name: "Selecionar VALE3" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Comparar selecionadas" }),
      );

      expect(await screen.findByText("ROE sem base confiável")).toBeTruthy();
      expect(screen.queryByText(/até Invalid Date/)).toBeNull();
    },
  );

  it.each(["quarterly", "year_to_date", "point_in_time", "unknown", null])(
    "keeps non-annual and non-LTM ROE %s neutral",
    async (periodBasis) => {
      const petr = company("PETR3", "33000167000101");
      petr.fundamentals.roe = metric(12, null, {
        referenceDate: "2024-02-29",
        periodBasis,
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
      await user.click(
        screen.getByRole("button", { name: "Selecionar VALE3" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Comparar selecionadas" }),
      );

      expect(await screen.findByText("ROE sem base confiável")).toBeTruthy();
      expect(
        screen.getAllByText("Abaixo do mínimo · 15%").length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("Acima do mínimo · 15%")).toBeNull();
    },
  );

  it("accepts annual ROE for a non-financial issuer on a real leap-day date", async () => {
    const petr = company("PETR3", "33000167000101");
    petr.fundamentals.roe = metric(12, null, {
      referenceDate: "2024-02-29",
      periodBasis: "annual",
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

    expect(await screen.findAllByText("Abaixo do mínimo · 15%")).toHaveLength(
      2,
    );
  });

  it("uses the shared ROE preference and leaves unverified comparisons neutral", async () => {
    window.localStorage.setItem(
      stockCriteriaPreferencesStorageKey,
      JSON.stringify({ maximumPe: 15, minimumRoePercent: 10 }),
    );
    const unverified = company("VALE3", "33000167000102");
    unverified.identityVerified = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [company("PETR3", "33000167000101"), unverified],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findByText("Acima do mínimo · 10%")).toBeTruthy();
    expect(screen.getByText("ROE sem base confiável")).toBeTruthy();
  });

  it("shows compact visual states for verified P/L, P/VP and ROE", async () => {
    window.localStorage.setItem(
      "investlab:analyses:stock-criteria:v1",
      JSON.stringify({ maximumPe: 15, maximumPb: 2.5, minimumRoePercent: 15 }),
    );
    const belowLimits = company("PETR3", "33000167000101");
    belowLimits.fundamentals.roe = metric(18);
    belowLimits.valuation.pe = metric(12);
    belowLimits.valuation.pb = metric(2);
    const aboveLimits = company("VALE3", "33000167000102");
    aboveLimits.fundamentals.roe = metric(-2);
    aboveLimits.valuation.pe = metric(18);
    aboveLimits.valuation.pb = metric(3);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [belowLimits, aboveLimits],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findByText("Até 15x")).toBeTruthy();
    expect(screen.getByText("Acima de 15x")).toBeTruthy();
    expect(screen.getByText("Até 2,5x")).toBeTruthy();
    expect(screen.getByText("Acima de 2,5x")).toBeTruthy();
    expect(screen.getByText("Acima do mínimo · 15%")).toBeTruthy();
    expect(screen.getByText("Abaixo do mínimo · 15%")).toBeTruthy();
  });

  it("shows P/VP comparison signals using the balanced preset", async () => {
    const first = company("PETR3", "33000167000101");
    const second = company("VALE3", "33000167000102");
    first.valuation.pb = metric(1.8);
    second.valuation.pb = metric(2.2);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [first, second],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findAllByText("Até 2,5x")).toHaveLength(2);
  });

  it("evaluates bank P/L when both companies have compatible periods", async () => {
    const first = company("ITUB4", "33000167000101");
    const second = company("BBAS3", "00000000000191");
    first.sector = "Bancos";
    second.sector = "Bancos";
    first.valuation.pe = metric(12, null, { periodBasis: "annual" });
    second.valuation.pe = metric(20, null, {
      periodBasis: "trailing_twelve_months",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Bancos",
          sectorMetadataAsOf: null,
          companies: [first, second],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="ITUB4" />);
    await user.click(screen.getByRole("button", { name: "Selecionar BBAS3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findAllByText("Até 15x")).toHaveLength(1);
    expect(screen.getByText("Acima de 15x")).toBeTruthy();
  });

  it("does not apply industrial P/L or bank ROE rules to insurers", async () => {
    window.localStorage.setItem(
      "investlab:analyses:stock-criteria:v1",
      JSON.stringify({ maximumPe: 15, maximumPb: 2.5, minimumRoePercent: 15 }),
    );
    const first = company("ABCD3", "33000167000101");
    const second = company("VALE3", "33000167000102");
    first.sector = "Seguradoras e Corretoras";
    second.sector = "Seguradoras e Corretoras";
    first.fundamentals.roe = metric(18);
    second.fundamentals.roe = metric(20);
    first.valuation.pe = metric(12);
    second.valuation.pe = metric(14);
    first.valuation.pb = metric(1.2);
    second.valuation.pb = metric(3);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Seguradoras e Corretoras",
          sectorMetadataAsOf: null,
          companies: [first, second],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="ABCD3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );

    expect(await screen.findAllByText("ROE não se aplica")).toHaveLength(2);
    expect(screen.getAllByText("P/L não se aplica")).toHaveLength(2);
    expect(screen.getByText("Até 2,5x")).toBeTruthy();
    expect(screen.getByText("Acima de 2,5x")).toBeTruthy();
  });

  it("keeps P/VP neutral when its optional custom limit is disabled", async () => {
    window.localStorage.setItem(
      stockCriteriaPreferencesStorageKey,
      JSON.stringify({
        preset: "custom",
        maximumPe: 15,
        maximumPb: null,
        minimumRoePercent: 15,
      }),
    );
    const first = company("PETR3", "33000167000101");
    const second = company("VALE3", "33000167000102");
    first.valuation.pb = metric(1.8);
    second.valuation.pb = metric(2.2);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sector: "Petróleo e Gás",
          sectorMetadataAsOf: null,
          companies: [first, second],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyComparison initialTicker="PETR3" />);
    await user.click(screen.getByRole("button", { name: "Selecionar VALE3" }));
    await user.click(
      screen.getByRole("button", { name: "Comparar selecionadas" }),
    );
    expect(await screen.findAllByText(/P\/VP .* · sem limite/)).toHaveLength(2);
  });
});
