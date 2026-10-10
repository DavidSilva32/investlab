// @vitest-environment jsdom
import {
  act,
  cleanup,
  render as renderBase,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextContributionStockOpportunities } from "@/app/strategy/_components/next-contribution-stock-opportunities";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

function render(ui: ReactNode) {
  return renderBase(<QueryClientWrapper>{ui}</QueryClientWrapper>);
}

function response(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response);
}

const opportunities = {
  classificationStatus: "resolved" as const,
  classificationLookupFailures: 0,
  opportunities: [
    {
      ticker: "ABEV3",
      name: "Ambev S.A.",
      quantity: 12,
      price: 14.3,
      priceAsOf: "2026-10-08T18:30:00.000Z",
      methods: {
        graham: { value: 20, differencePercent: 28.5, asOf: "2025-12-31" },
        bazin: { value: null, differencePercent: null, asOf: null },
      },
    },
  ],
};

const stockAnalysis = {
  ticker: "ABEV3",
  issuerSector: "Alimentos",
  issuerMetadataUpdatedAt: "2026-10-01",
  instrumentType: "stock" as const,
  cnpj: null,
  companyName: "Ambev S.A.",
  price: 14.3,
  changePercent: 0,
  priceUpdatedAt: "2026-10-08T18:30:00.000Z",
  priceIsStale: false,
  fundamentalsIsStale: false,
  fundamentalsFetchedAt: "2026-10-08T18:30:00.000Z",
  history: [],
  historyStatus: "empty" as const,
  fundamentals: [
    {
      referenceDate: "2025-12-31",
      sourceDocument: "DFP" as const,
      revenue: "1000",
      netIncome: "100",
      equity: "500",
    },
  ],
  indicators: [
    {
      key: "pe" as const,
      value: 12.5,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
      marketDataDate: "2026-10-08",
    },
    {
      key: "pb" as const,
      value: 1.4,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP" as const,
      periodBasis: "point_in_time" as const,
      marketDataDate: "2026-10-08",
    },
    {
      key: "roe" as const,
      value: 12,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
    },
    {
      key: "netMargin" as const,
      value: 10,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
    },
  ],
};

function fetchForSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/analyses/portfolio-opportunities"))
        return response(opportunities);
      if (url.endsWith("/api/analyses/stocks/ABEV3"))
        return response(stockAnalysis);
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NextContributionStockOpportunities", () => {
  it("shows verified portfolio stocks with canonical criterion statuses and an analysis link", async () => {
    fetchForSuccess();
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByRole("link", { name: "Abrir análise de ABEV3" }),
    ).toBeTruthy();
    expect(screen.getByText("Ambev S.A.")).toBeTruthy();
    expect(screen.getByText(/R\$\s*14,30/)).toBeTruthy();
    expect(
      screen.getByText("Qualidade · 0/1 indicadores avaliáveis atendidos"),
    ).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/L: Atende, 12,5x")).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/VP: Atende, 1,4x")).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 ROE: Não atende, 12%")).toBeTruthy();
    expect(
      screen.getByLabelText("ABEV3 Dív. Líq./EBITDA: Sem dado confiável"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("ABEV3 DY: sem série recorrente completa"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Graham: 28,5% abaixo da referência"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Bazin indisponível: série de dividendos recorrentes não comprovada",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Abrir análise de ABEV3" })
        .getAttribute("href"),
    ).toBe("/analyses?ticker=ABEV3");
    expect(screen.getByText(/não são ordem de compra/)).toBeTruthy();
  });

  it("shows the raw P/VP while its optional personal limit is disabled", async () => {
    window.localStorage.setItem(
      "investlab:analyses:stock-criteria:v1",
      JSON.stringify({
        preset: "custom",
        maximumPe: 15,
        maximumPb: null,
        minimumRoePercent: 15,
      }),
    );
    fetchForSuccess();
    render(<NextContributionStockOpportunities />);
    expect(
      await screen.findByLabelText("ABEV3 P/VP: Sem limite configurado, 1,4x"),
    ).toBeTruthy();
  });

  it("keeps confirmed tickers visible when classification is partial and analysis data fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response({
            ...opportunities,
            classificationStatus: "partial",
            classificationLookupFailures: 2,
          });
        return response({ message: "Unavailable" }, false);
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(await screen.findByText("ABEV3")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível confirmar 2 ativo(s)."),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "Indicadores indisponíveis. Consulte a análise completa.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Abrir análise de ABEV3" }),
    ).toBeTruthy();
  });

  it("shows a compact loading state while the opportunity list is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<NextContributionStockOpportunities />);
    expect(screen.getByLabelText("Carregando ações da carteira")).toBeTruthy();
  });

  it("loads stock analyses in batches instead of flooding the provider", async () => {
    const tickers = ["ABEV3", "BBDC4", "ITUB4", "VALE3", "PETR4"];
    const pendingResponses: Array<() => void> = [];
    const analysisCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response({
            ...opportunities,
            opportunities: tickers.map((ticker) => ({
              ...opportunities.opportunities[0],
              ticker,
              name: ticker,
            })),
          });
        analysisCalls.push(url);
        return new Promise<Response>((resolve) => {
          pendingResponses.push(() => void resolve(response(stockAnalysis)));
        });
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByRole("link", { name: "Abrir análise de ABEV3" }),
    ).toBeTruthy();
    await waitFor(() => expect(analysisCalls).toHaveLength(4));
    expect(pendingResponses).toHaveLength(4);

    await act(async () => {
      pendingResponses.splice(0).forEach((resolve) => resolve());
    });
    await waitFor(() => expect(analysisCalls).toHaveLength(5));
    await act(async () => {
      pendingResponses.splice(0).forEach((resolve) => resolve());
    });
  });

  it("allows retrying when the opportunity list request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() =>
          response({ message: "Unavailable" }, false),
        )
        .mockImplementationOnce(() =>
          response({
            classificationStatus: "unavailable",
            classificationLookupFailures: 1,
            opportunities: [],
          }),
        ),
    );
    render(<NextContributionStockOpportunities />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await screen.findByText(
        "Não foi possível confirmar as ações nesta consulta.",
      ),
    ).toBeTruthy();
  });

  it("distinguishes an empty but partially classified portfolio from no confirmed shares", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        response({
          classificationStatus: "partial",
          classificationLookupFailures: 1,
          opportunities: [],
        }),
      ),
    );
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByText(
        "Algumas posições não puderam ser confirmadas como ações.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Análises" })).toBeTruthy();
  });

  it("explains an empty portfolio without implying a failed classification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        response({
          classificationStatus: "resolved",
          classificationLookupFailures: 0,
          opportunities: [],
        }),
      ),
    );
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByText("Nenhuma ação B3 foi confirmada na carteira."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Análises" })).toBeTruthy();
  });

  it("shows unavailable quotes and avoids applying industrial criteria to financial companies", async () => {
    const financialCompany = {
      ...stockAnalysis,
      issuerSector: "Bancos",
      indicators: stockAnalysis.indicators.map((indicator) =>
        indicator.key === "roe"
          ? { ...indicator, periodBasis: "annual" as const }
          : indicator,
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response({
            ...opportunities,
            opportunities: [
              {
                ...opportunities.opportunities[0]!,
                price: null,
                priceAsOf: null,
                methods: {
                  graham: { value: null, differencePercent: null, asOf: null },
                  bazin: { value: null, differencePercent: null, asOf: null },
                },
              },
            ],
          });
        return response(financialCompany);
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(await screen.findByText("Cotação indisponível")).toBeTruthy();
    expect(screen.getByText(/demonstrações consultadas/)).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/L: Atende, 12,5x")).toBeTruthy();
    expect(
      screen.getByLabelText("ABEV3 Dív. Líq./EBITDA: Não aplicável"),
    ).toBeTruthy();
    expect(screen.getByText("Qualidade sem base confiável")).toBeTruthy();
    expect(
      screen.getByLabelText("Graham: referência de preço indisponível"),
    ).toBeTruthy();
  });

  it("marks stale market prices unavailable while keeping fresh fundamentals usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response(opportunities);
        if (url.endsWith("/api/analyses/stocks/ABEV3"))
          return response({
            ...stockAnalysis,
            priceIsStale: true,
            priceUpdatedAt: null,
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(await screen.findByText("ABEV3")).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/L: Sem dado confiável")).toBeTruthy();
    expect(
      screen.getByLabelText("ABEV3 P/VP: Sem dado confiável"),
    ).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 ROE: Não atende, 12%")).toBeTruthy();
  });

  it("marks stale fundamentals and malformed quote dates as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response({
            ...opportunities,
            opportunities: [
              { ...opportunities.opportunities[0], priceAsOf: "invalid-date" },
            ],
          });
        if (url.endsWith("/api/analyses/stocks/ABEV3"))
          return response({
            ...stockAnalysis,
            fundamentalsIsStale: true,
            priceIsStale: true,
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(await screen.findByText("Cotação data indisponível")).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/L: Sem dado confiável")).toBeTruthy();
    expect(screen.getByText("Qualidade sem base confiável")).toBeTruthy();
  });

  it("does not infer instrument or equity data when the source omits them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response(opportunities);
        if (url.endsWith("/api/analyses/stocks/ABEV3"))
          return response({
            ...stockAnalysis,
            instrumentType: null,
            fundamentals: [],
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByLabelText("ABEV3 ROE: Sem dado confiável"),
    ).toBeTruthy();
  });

  it("keeps price references separate and does not present Bazin without recurring dividends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response({
            ...opportunities,
            opportunities: [
              {
                ...opportunities.opportunities[0]!,
                methods: {
                  graham: {
                    value: 14.3,
                    differencePercent: 0,
                    asOf: "2025-12-31",
                  },
                  bazin: {
                    value: 12,
                    differencePercent: -10,
                    asOf: "2025-12-31",
                  },
                },
              },
              {
                ...opportunities.opportunities[0]!,
                ticker: "BBDC4",
                name: "Banco Bradesco S.A.",
                methods: {
                  graham: {
                    value: 15.9,
                    differencePercent: -10,
                    asOf: "2025-12-31",
                  },
                  bazin: {
                    value: 12,
                    differencePercent: -10,
                    asOf: "2025-12-31",
                  },
                },
              },
            ],
          });
        return response(stockAnalysis);
      }),
    );
    render(<NextContributionStockOpportunities />);

    const grahamReferences = await screen.findAllByText("Graham");
    expect(grahamReferences).toHaveLength(2);
    const bazinReferences = screen.getAllByText("Bazin sem série recorrente");
    expect(bazinReferences).toHaveLength(2);
    expect(
      grahamReferences.map((reference) =>
        reference.parentElement?.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Graham: 0% igual à referência",
      "Graham: 10% acima da referência",
    ]);
    expect(
      bazinReferences.map((reference) => reference.getAttribute("aria-label")),
    ).toEqual([
      "Bazin indisponível: série de dividendos recorrentes não comprovada",
      "Bazin indisponível: série de dividendos recorrentes não comprovada",
    ]);
  });

  it("shows a loading state for an individual stock analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response(opportunities);
        return new Promise<Response>(() => {});
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(
      await screen.findByLabelText("Carregando indicadores de ABEV3"),
    ).toBeTruthy();
  });

  it("reports known quality criteria as unavailable instead of inventing values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/analyses/portfolio-opportunities"))
          return response(opportunities);
        return response({
          ...stockAnalysis,
          instrumentType: "stock",
          issuerSector: null,
          fundamentalsIsStale: true,
          priceIsStale: true,
          fundamentalsFetchedAt: null,
          fundamentals: [],
          indicators: [],
        });
      }),
    );
    render(<NextContributionStockOpportunities />);

    expect(await screen.findByText("ABEV3")).toBeTruthy();
    expect(screen.getByLabelText("ABEV3 P/L: Sem dado confiável")).toBeTruthy();
    expect(
      screen.getByLabelText("ABEV3 P/VP: Sem dado confiável"),
    ).toBeTruthy();
    expect(screen.getByText("Qualidade sem base confiável")).toBeTruthy();
  });
});
