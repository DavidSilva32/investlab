// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PortfolioOpportunities } from "@/app/(private)/analyses/_components/portfolio-opportunities";
import * as apiClient from "@/lib/api-client";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";
import type { ReactNode } from "react";

function render(ui: ReactNode) {
  return renderBase(<QueryClientWrapper>{ui}</QueryClientWrapper>);
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const opportunity = {
  ticker: "PETR4",
  logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
  name: "Petrobras PN",
  quantity: 12,
  positionDate: "2026-09-30",
  price: 30,
  priceAsOf: "2026-10-01T00:00:00.000Z",
  fundamentalsAsOf: "2025-12-31",
  financialPeriods: [
    { referenceDate: "2025-12-31", sourceDocument: "DFP" as const },
  ],
  automaticDividend: {
    value: 5,
    windowStart: "2025-10-02",
    windowEnd: "2026-10-02",
    observedPayments: 3,
    source: "BRAPI" as const,
    unavailableReason:
      "A BRAPI não confirmou a completude da janela de 12 meses.",
  },
  inputs: [
    {
      inputKey: "graham_eps" as const,
      value: 4,
      source: "Annual report",
      asOf: "2025-12-31",
    },
    {
      inputKey: "graham_book_value_per_share" as const,
      value: 20,
      source: "Annual report",
      asOf: "2025-12-31",
    },
    {
      inputKey: "bazin_dividend_per_share" as const,
      value: 2,
      source: "Investor relations",
      asOf: "2025-12-31",
    },
  ],
  methods: {
    graham: {
      value: 42.42,
      differencePercent: 41.4,
      asOf: "2025-12-31",
      source: "Annual report",
      unavailableReason: null,
    },
    bazin: {
      value: 33.33,
      differencePercent: 11.1,
      asOf: "2025-12-31",
      source: "Investor relations; taxa global 6% a.a.",
      unavailableReason: null,
    },
  },
};

const confirmedStockPosition = {
  id: "stock-petr4",
  assetCode: "PETR4",
  product: "Petrobras PN",
  institution: "Corretora",
  totalValue: "360.00",
  classification: {
    assetClass: "Renda variável",
    subClass: "Ação",
    geography: "Brasil",
  },
  classificationSource: "manual" as const,
};

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function stubFetch(
  requestMock: (input: RequestInfo | URL, init?: RequestInit) => unknown,
  allocationResponder: () => unknown = () =>
    response({ positions: [confirmedStockPosition] }),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/portfolio/allocation")
        return allocationResponder();
      return requestMock(input, init);
    }),
  );
}

beforeEach(() => {
  stubFetch(
    vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    ),
    () => response({ positions: [confirmedStockPosition] }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PortfolioOpportunities", () => {
  it("keeps portfolio values visible when the opportunities request fails", async () => {
    const position = {
      id: "cash",
      product: "CDB liquidez diária",
      institution: "Banco",
      totalValue: "1250.00",
      classification: {
        assetClass: "Renda fixa",
        subClass: "CDB",
        geography: "Brasil",
      },
      classificationSource: "manual",
    };
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(response({ message: "Falha na análise." }, false)),
      () => response({ positions: [position] }),
    );

    render(<PortfolioOpportunities />);

    expect(await screen.findByText("CDB liquidez diária")).toBeTruthy();
    expect(screen.getAllByText("R$ 1.250,00")).toHaveLength(3);
    expect(screen.getByRole("alert").textContent).toContain(
      "Falha na análise.",
    );
  });

  it("suspends methods when the allocation request fails", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
      () => response({ message: "Falha nos valores." }, false),
    );

    render(<PortfolioOpportunities />);

    expect(await screen.findByText("PETR4 · Petrobras PN")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Falha nos valores.",
    );
    expect(screen.getByText("Referências suspensas")).toBeTruthy();
    expect(
      screen.getByText(/não foi possível confirmar a classe/i),
    ).toBeTruthy();
    expect(screen.queryByText("Número de Graham")).toBeNull();
    expect(screen.queryByText("Preço-teto de Bazin")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    ).toBeNull();
  });

  it("does not show methods for ETF, FII, or BDR tickers in allocation fallback", async () => {
    const unsupportedOpportunities = [
      { ...opportunity, ticker: "IVVB11", name: "ETF internacional" },
      { ...opportunity, ticker: "HGLG11", name: "FII de exemplo" },
      { ...opportunity, ticker: "AAPL34", name: "BDR de exemplo" },
    ];
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: unsupportedOpportunities,
          settings: { bazinTargetYield: 6 },
        }),
      ),
      () => response({ message: "Falha nos valores." }, false),
    );

    render(<PortfolioOpportunities />);

    expect(await screen.findByText(/ETF internacional/)).toBeTruthy();
    expect(screen.getByText(/FII de exemplo/)).toBeTruthy();
    expect(screen.getByText(/BDR de exemplo/)).toBeTruthy();
    expect(screen.getAllByText("Referências suspensas")).toHaveLength(1);
    expect(screen.queryByText("Número de Graham")).toBeNull();
    expect(screen.queryByText("Preço-teto de Bazin")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    ).toBeNull();
  });

  it("suspends references when allocation succeeds without a matching position", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
      () =>
        response({
          positions: [
            { ...confirmedStockPosition, id: "unkeyed", assetCode: null },
          ],
        }),
    );

    render(<PortfolioOpportunities />);

    expect(await screen.findByText("Referências suspensas")).toBeTruthy();
    expect(screen.getByText(/PETR4 · Petrobras PN/)).toBeTruthy();
    expect(screen.queryByText("Número de Graham")).toBeNull();
    expect(screen.queryByText("Preço-teto de Bazin")).toBeNull();
    expect(screen.queryByLabelText("Percentual anual")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    ).toBeNull();
  });

  it("links tickers after trimming incidental spaces", async () => {
    const spacedPosition = {
      ...confirmedStockPosition,
      assetCode: " PETR4 ",
    };
    const spacedOpportunity = { ...opportunity, ticker: " PETR4 " };
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [spacedOpportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
      () => response({ positions: [spacedPosition] }),
    );

    render(<PortfolioOpportunities />);

    const positionRow = (
      await screen.findByText(/PETR4 · Petrobras PN/)
    ).closest("li");
    expect(positionRow).toBeTruthy();
    await userEvent.click(
      within(positionRow!).getByRole("button", { name: "Ver análise da ação" }),
    );
    expect(within(positionRow!).getByText("Número de Graham")).toBeTruthy();
  });

  it("shows a stock analysis inside its matching position and none for other asset classes", async () => {
    const stock = {
      id: "stock-petr4",
      assetCode: "PETR4",
      product: "Petrobras PN",
      institution: "Corretora",
      totalValue: "360.00",
      classification: {
        assetClass: "Renda variável",
        subClass: "Ação",
        geography: "Brasil",
      },
      classificationSource: "manual" as const,
    };
    const cash = {
      id: "fixed-income",
      assetCode: null,
      product: "CDB liquidez diária",
      institution: "Banco",
      totalValue: "1250.00",
      classification: {
        assetClass: "Renda fixa",
        subClass: "CDB",
        geography: "Brasil",
      },
      classificationSource: "manual" as const,
    };
    const sameTickerPositions = [
      {
        id: "etf-same-code",
        assetCode: "PETR4",
        product: "ETF internacional",
        institution: "Corretora",
        totalValue: "50.00",
        classification: {
          assetClass: "Renda variável",
          subClass: "ETF",
          geography: "Global",
        },
        classificationSource: "manual" as const,
      },
      {
        id: "fii-same-code",
        assetCode: "PETR4",
        product: "FII de exemplo",
        institution: "Corretora",
        totalValue: "60.00",
        classification: {
          assetClass: "Fundos",
          subClass: "FII",
          geography: "Brasil",
        },
        classificationSource: "manual" as const,
      },
      {
        id: "bdr-same-code",
        assetCode: "PETR4",
        product: "BDR de exemplo",
        institution: "Corretora",
        totalValue: "70.00",
        classification: {
          assetClass: "Renda variável",
          subClass: "BDR",
          geography: "Brasil",
        },
        classificationSource: "manual" as const,
      },
    ];
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
      () => response({ positions: [stock, cash, ...sameTickerPositions] }),
    );

    render(<PortfolioOpportunities />);

    const stockRow = (await screen.findByText("PETR4 · Petrobras PN")).closest(
      "li",
    );
    expect(stockRow).toBeTruthy();
    expect(
      within(stockRow!).getByRole("button", { name: "Ver análise da ação" }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByText("CDB liquidez diária").closest("li")!,
      ).queryByRole("button", { name: "Ver análise da ação" }),
    ).toBeNull();
    expect(screen.queryByText("Análises disponíveis")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Ver análise da ação" }),
    ).toHaveLength(1);
    for (const product of [
      "ETF internacional",
      "FII de exemplo",
      "BDR de exemplo",
    ]) {
      const productRow = screen
        .getAllByRole("listitem")
        .find((item) => item.textContent?.includes(product));
      expect(productRow).toBeTruthy();
      expect(
        within(productRow!).queryByRole("button", {
          name: "Ver análise da ação",
        }),
      ).toBeNull();
    }

    await userEvent.click(
      within(stockRow!).getByRole("button", { name: "Ver análise da ação" }),
    );

    expect(within(stockRow!).getByText("Número de Graham")).toBeTruthy();
    expect(within(stockRow!).getByText("Preço-teto de Bazin")).toBeTruthy();
  });

  it("rejects an invalid allocation payload and retries only that request", async () => {
    let allocationAttempts = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    stubFetch(fetchMock, () => {
      allocationAttempts += 1;
      return allocationAttempts === 1
        ? response({})
        : response({ positions: [] });
    });

    render(<PortfolioOpportunities />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os valores da carteira.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
    expect(allocationAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows a positions loading state when only allocation is pending", async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
        ),
      () => new Promise(() => undefined),
    );

    render(<PortfolioOpportunities />);

    expect(
      await screen.findByText("Carregando posições da carteira"),
    ).toBeTruthy();
  });

  it("explains when no listed position qualifies for the equity references", async () => {
    const position = {
      id: "cash",
      product: "CDB liquidez diária",
      institution: "Banco",
      totalValue: "1250.00",
      classification: {
        assetClass: "Renda fixa",
        subClass: "CDB",
        geography: "Brasil",
      },
      classificationSource: "manual",
    };
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
        ),
      () => response({ positions: [position] }),
    );

    render(<PortfolioOpportunities />);

    expect(
      await screen.findByText(
        "Nenhuma ação brasileira elegível para essas referências foi confirmada.",
      ),
    ).toBeTruthy();
  });

  it("reloads portfolio opportunities after a financial portfolio update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    stubFetch(fetchMock, () => response({ positions: [] }));
    render(<PortfolioOpportunities />);

    expect(await screen.findByText("PETR4 · Petrobras PN")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new Event("portfolio:updated"));
    });

    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows skeleton while the carteira is loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<PortfolioOpportunities />);
    expect(screen.getByLabelText(/Carregando/).getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("shows a retryable inline error and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ message: "Não foi possível consultar agora." }, false),
      )
      .mockResolvedValueOnce(response({ settings: { bazinTargetYield: 6 } }));
    stubFetch(fetchMock, () => response({ positions: [] }));
    render(<PortfolioOpportunities />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível consultar agora.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
  });

  it("explains empty holdings", async () => {
    stubFetch(
      vi
        .fn()
        .mockResolvedValue(
          response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
        ),
      () => response({ positions: [] }),
    );
    render(<PortfolioOpportunities />);
    expect(await screen.findByText(/Sua carteira está vazia/i)).toBeTruthy();
  });

  it("distinguishes failed classification lookups from an empty imported portfolio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [],
          classificationStatus: "unavailable",
          classificationLookupFailures: 2,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    stubFetch(fetchMock, () => response({ positions: [] }));
    render(<PortfolioOpportunities />);
    expect(
      await screen.findByText(/Não foi possível analisar as ações agora/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/os demais ativos continuam listados/i),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a distinct empty message when classification is partial but no ticker was confirmed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [],
          classificationStatus: "partial",
          classificationLookupFailures: 1,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({ opportunities: [], settings: { bazinTargetYield: 6 } }),
      );
    stubFetch(fetchMock, () => response({ positions: [] }));
    render(<PortfolioOpportunities />);
    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
    expect(screen.getByText(/ativos continuam listados/i)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /tentar novamente/i }),
    );
    expect(await screen.findByText("Sua carteira está vazia")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a partial classification limitation alongside verified stocks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          classificationStatus: "partial",
          classificationLookupFailures: 1,
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      );
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Não foi possível confirmar a classe de 1 ativo(s) para a análise de ações.",
    );
    await userEvent.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: /tentar novamente/i,
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders quotes and references without the detailed CVM and BRAPI dump", async () => {
    render(<PortfolioOpportunities />);
    const card = await screen.findByRole("img", {
      name: "Identidade de Petrobras PN",
    });
    expect(card).toBeTruthy();
    expect(card.querySelector("img")?.getAttribute("src")).toBe(
      "https://icons.brapi.dev/icons/PETR4.svg",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    expect(screen.getByText("Número de Graham")).toBeTruthy();
    expect(screen.getByText("Preço-teto de Bazin")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver critérios" }).getAttribute("href"),
    ).toBe("/analises?ticker=PETR4");
    expect(
      screen.getAllByText("abaixo da referência", { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Fundamentos:/i)).toBeNull();
    expect(screen.queryByText(/CVM|BRAPI/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ver fontes e limitações" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sobre a taxa inicial do Bazin" }),
    ).toBeTruthy();
    await userEvent.hover(
      screen.getByRole("button", { name: "Sobre Número de Graham" }),
    );
    expect(await screen.findByText(/raiz quadrada de 22,5/i)).toBeTruthy();
    await userEvent.hover(
      screen.getByRole("button", { name: "Sobre Preço-teto de Bazin" }),
    );
    expect(
      await screen.findByText(
        /não confirma que os proventos sejam recorrentes/i,
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByText("Taxa-alvo global do Bazin").parentElement!,
      ).getByRole("button", { name: "Sobre a taxa inicial do Bazin" }),
    ).toBeTruthy();
  });

  it("keeps the current market quote date visible", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [
            {
              ...opportunity,
              financialPeriods: [
                { referenceDate: "2025-12-31", sourceDocument: "DFP" },
                { referenceDate: "2025-06-30", sourceDocument: "ITR" },
              ],
            },
          ],
          settings: { bazinTargetYield: 6 },
        }),
      ),
    );
    render(<PortfolioOpportunities />);

    await screen.findByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    expect(screen.getByText(/cotação R\$ 30,00/)).toBeTruthy();
    expect(screen.getByText(/2026-10-01/)).toBeTruthy();
    expect(screen.queryByText(/DFP|ITR|BRAPI|CVM/)).toBeNull();
  });

  it("renders missing and invalid dates, unavailable methods and divergent references", async () => {
    const incompleteOpportunity = {
      ...opportunity,
      positionDate: "not-a-date",
      price: null,
      priceAsOf: null,
      fundamentalsAsOf: "2025-06-30",
      financialPeriods: [],
      automaticDividend: null,
      inputs: opportunity.inputs.map((input) => ({
        ...input,
        value: null,
        source: null,
        asOf: null,
      })),
      methods: {
        graham: {
          value: 10,
          differencePercent: 0,
          asOf: null,
          source: null,
          unavailableReason: "Graham sem comparação.",
        },
        bazin: {
          value: null,
          differencePercent: -5,
          asOf: "invalid-date",
          source: null,
          unavailableReason: "Bazin indisponível.",
        },
      },
    };
    const noComparisonOpportunity = {
      ...incompleteOpportunity,
      ticker: "VALE3",
      fundamentalsAsOf: null,
      inputs: [],
      methods: {
        graham: {
          value: null,
          differencePercent: null,
          asOf: null,
          source: null,
          unavailableReason: "Graham sem dados suficientes.",
        },
        bazin: {
          value: null,
          differencePercent: null,
          asOf: null,
          source: null,
          unavailableReason: "Bazin sem dados suficientes.",
        },
      },
    };
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [incompleteOpportunity, noComparisonOpportunity],
        }),
      ),
      () =>
        response({
          positions: [
            confirmedStockPosition,
            {
              ...confirmedStockPosition,
              id: "stock-vale3",
              assetCode: "VALE3",
              product: "Vale ON",
            },
          ],
        }),
    );
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    for (const trigger of screen.getAllByRole("button", {
      name: "Ver análise da ação",
    })) {
      await userEvent.click(trigger);
    }
    expect(screen.getByText("Na referência calculada")).toBeTruthy();
    expect(screen.getByText(/acima da referência/i)).toBeTruthy();
    expect(screen.getByText(/ficam em lados diferentes/i)).toBeTruthy();
    expect(
      screen.getAllByText(/posição importada em Data não informada/i),
    ).toHaveLength(2);
    expect(screen.getAllByText("Indisponível")).toHaveLength(3);
    expect(screen.queryAllByText("Comparação indisponível")).toHaveLength(0);
    expect(screen.getByText("Bazin indisponível.")).toBeTruthy();
    expect(screen.getByText("Bazin sem dados suficientes.")).toBeTruthy();
    expect(screen.queryByText(/Proventos em 12 meses:/i)).toBeNull();
    expect(screen.queryByText(/Fundamentos:/i)).toBeNull();
    expect(screen.queryByText(/DFP|ITR|BRAPI|CVM/)).toBeNull();

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      })[0]!,
    );
    expect(
      (document.getElementById("PETR4-graham_eps-as-of") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.getAllByPlaceholderText("Origem do dado")).toHaveLength(3);
    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      })[1]!,
    );
    fireEvent.change(document.getElementById("VALE3-graham_eps-value")!, {
      target: { value: "9" },
    });
    expect(
      (document.getElementById("VALE3-graham_eps-value") as HTMLInputElement)
        .value,
    ).toBe("9");
  });

  it("saves the configured global Bazin yield", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ bazinTargetYield: 7.5 }))
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 7.5 },
        }),
      );
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, "7.5");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ bazinTargetYield: 7.5 }),
    });
    expect(toast.success).toHaveBeenCalledWith("Taxa-alvo global atualizada.");
  });

  it("shows the API message when saving the global Bazin yield fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ message: "Taxa rejeitada." }, false));
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, "7");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Taxa rejeitada."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates and reloads if the opportunities cache was evicted during save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    stubFetch(fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderBase(
      <QueryClientProvider client={queryClient}>
        <PortfolioOpportunities />
      </QueryClientProvider>,
    );
    const rate = await screen.findByLabelText("Percentual anual");
    const updateCache = vi
      .spyOn(queryClient, "setQueryData")
      .mockImplementation((_, updater) => {
        if (typeof updater === "function")
          (updater as (current: undefined) => unknown)(undefined);
        return undefined;
      });

    await userEvent.clear(rate);
    await userEvent.type(rate, "7");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));

    expect(updateCache).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Taxa-alvo global atualizada.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    queryClient.clear();
  });

  it.each([
    ["0", "Informe uma taxa anual maior que 0% e de até 100%."],
    ["101", "Informe uma taxa anual maior que 0% e de até 100%."],
    ["abc", "Informe uma taxa anual maior que 0% e de até 100%."],
  ])("rejects an invalid global Bazin yield (%s)", async (value, message) => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    const rate = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(rate);
    await userEvent.type(rate, value);
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a safe fallback when saving manual evidence fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockRejectedValueOnce(new Error("private transport detail"));
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    expect(
      screen.getByText(
        "Informe valor por ação, origem e data: LPA e VPA para Graham; proventos em 12 meses para Bazin.",
      ),
    ).toBeTruthy();
    expect(
      document
        .getElementById("PETR4-graham_eps-value")
        ?.getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    expect(
      within(form)
        .getByPlaceholderText("Origem do dado")
        .getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    expect(
      within(form)
        .getByLabelText("Lucro por ação (LPA), data de referência")
        .getAttribute("aria-describedby"),
    ).toBe("PETR4-graham_eps-guidance");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o dado manual.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates missing manual value, origin and date before posting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        opportunities: [opportunity],
        settings: { bazinTargetYield: 6 },
      }),
    );
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    const source = within(form).getByPlaceholderText("Origem do dado");
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    await userEvent.clear(value);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    await userEvent.type(value, "5");
    await userEvent.clear(source);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    await userEvent.type(source, "Relatório anual");
    await userEvent.clear(date);
    fireEvent.submit(form);
    expect(toast.error).toHaveBeenLastCalledWith(
      "Informe o valor, a origem e a data para salvar.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the API message when saving manual evidence fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ message: "Valor rejeitado." }, false));
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    await userEvent.clear(value);
    await userEvent.type(value, "5");
    await userEvent.clear(within(form).getByPlaceholderText("Origem do dado"));
    await userEvent.type(
      within(form).getByPlaceholderText("Origem do dado"),
      "Relatório anual",
    );
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    await userEvent.clear(date);
    await userEvent.type(date, "30/06/2025");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Valor rejeitado."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses safe fallbacks when mutation rejections are not Error instances", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      ),
    );
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    const request = vi.spyOn(apiClient, "apiRequest");
    request.mockRejectedValueOnce("private manual rejection");

    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o dado manual.",
      ),
    );

    vi.mocked(toast.error).mockClear();
    request.mockRejectedValueOnce("private settings rejection");
    await userEvent.click(screen.getByRole("button", { name: /salvar taxa/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível atualizar a taxa configurada.",
      ),
    );
  });

  it("saves per-share evidence with source and date, separate from the automatic observation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      )
      .mockResolvedValueOnce(response({ inputKey: "graham_eps" }))
      .mockResolvedValueOnce(
        response({
          opportunities: [opportunity],
          settings: { bazinTargetYield: 6 },
        }),
      );
    stubFetch(fetchMock);
    render(<PortfolioOpportunities />);
    await screen.findAllByRole("img", { name: "Identidade de Petrobras PN" });
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const value = document.getElementById("PETR4-graham_eps-value")!;
    const form = value.closest("form")!;
    const date = within(form).getByLabelText(
      "Lucro por ação (LPA), data de referência",
    );
    fireEvent.change(date, { target: { value: "30/06/2025" } });
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining('"source":"Annual report"'),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: expect.stringContaining('"asOf":"2025-06-30"'),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Dado manual salvo com origem e data.",
    );
  });
});
