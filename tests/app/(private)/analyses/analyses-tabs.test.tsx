// @vitest-environment jsdom
import {
  cleanup,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysesTabs } from "@/app/(private)/analyses/_components/analyses-tabs";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

vi.mock(
  "@/app/(private)/analyses/_components/stock-analysis-dashboard",
  () => ({
    StockAnalysisDashboard: ({ initialTicker }: { initialTicker?: string }) => (
      <section>Análise individual {initialTicker || "sem ticker"}</section>
    ),
  }),
);
vi.mock("@/app/(private)/analyses/_components/company-comparison", () => ({
  CompanyComparison: ({ initialTicker }: { initialTicker?: string }) => (
    <section>Comparação {initialTicker || "sem ticker"}</section>
  ),
}));

afterEach(cleanup);

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: QueryClientWrapper });

const opportunity = {
  ticker: "PETR4",
  name: "Petrobras PN",
  quantity: 12,
  positionDate: "2026-09-30",
  price: 30,
  priceAsOf: "2026-10-01T00:00:00.000Z",
  fundamentalsAsOf: "2025-12-31",
  financialPeriods: [{ referenceDate: "2025-12-31", sourceDocument: "DFP" }],
  automaticDividend: null,
  inputs: [
    {
      inputKey: "graham_eps",
      value: null,
      source: null,
      asOf: null,
    },
    {
      inputKey: "graham_book_value_per_share",
      value: null,
      source: null,
      asOf: null,
    },
    {
      inputKey: "bazin_dividend_per_share",
      value: null,
      source: null,
      asOf: null,
    },
  ],
  methods: {
    graham: {
      value: null,
      differencePercent: null,
      asOf: null,
      source: null,
      unavailableReason: "Informe LPA e VPA.",
    },
    bazin: {
      value: null,
      differencePercent: null,
      asOf: null,
      source: null,
      unavailableReason: "Informe dividendos por ação.",
    },
  },
};

const stockPosition = {
  id: "stock-petr4",
  product: "Petrobras PN",
  assetCode: "PETR4",
  institution: "Corretora",
  totalValue: "360.00",
  classification: {
    assetClass: "Renda variável",
    subClass: "Ação",
    geography: "Brasil",
  },
  classificationSource: "manual" as const,
};

function response(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

function mockPortfolioFetch(
  opportunities: unknown = {
    opportunities: [opportunity],
    settings: { bazinTargetYield: 6 },
  },
  positions: (typeof stockPosition)[] = [stockPosition],
) {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      response(
        String(input) === "/api/portfolio/allocation"
          ? { positions }
          : opportunities,
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AnalysesTabs", () => {
  it("starts on the portfolio tab and keeps the individual analysis available", async () => {
    mockPortfolioFetch();
    render(<AnalysesTabs />);
    expect(
      screen
        .getByRole("tab", { name: "Minha carteira" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(await screen.findByText(/PETR4/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("tab", { name: "Análise individual" }),
    );
    expect(
      screen
        .getByRole("tab", { name: "Análise individual" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Análise individual sem ticker")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));
    expect(screen.getByText(/PETR4/)).toBeTruthy();
  });

  it("keeps the three analysis tabs and seeds comparison with the consulted ticker", async () => {
    render(<AnalysesTabs initialTicker="PETR4" />);
    expect(screen.getByRole("tab", { name: "Minha carteira" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Análise individual" }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("tab", { name: "Comparar empresas" }),
    );
    expect(screen.getByText("Comparação PETR4")).toBeTruthy();
  });

  it("keeps the imported-portfolio empty state hidden on individual analysis", async () => {
    mockPortfolioFetch({ opportunities: [] }, []);
    render(<AnalysesTabs />);

    const emptyState = await screen.findByText("Sua carteira está vazia");
    const portfolioPanel = emptyState.closest('[role="tabpanel"]');
    expect(portfolioPanel?.getAttribute("data-state")).toBe("active");

    await userEvent.click(
      screen.getByRole("tab", { name: "Análise individual" }),
    );

    expect(portfolioPanel?.getAttribute("data-state")).toBe("inactive");
    expect(portfolioPanel?.className).toContain("data-[state=inactive]:hidden");
  });

  it("defers the portfolio request until its tab is first opened", async () => {
    const fetchMock = mockPortfolioFetch();
    render(<AnalysesTabs initialTicker="PETR4" />);
    expect(
      screen
        .getByRole("tab", { name: "Análise individual" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Análise individual PETR4")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));
    expect(await screen.findByText(/PETR4/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves unsaved value and Bazin yield drafts when switching tabs", async () => {
    mockPortfolioFetch();
    render(<AnalysesTabs />);
    const bazinYield = await screen.findByLabelText("Percentual anual");
    await userEvent.clear(bazinYield);
    await userEvent.type(bazinYield, "7.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Ver análise da ação" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Inserir dados para calcular Graham e Bazin",
      }),
    );
    const eps = document.getElementById("PETR4-graham_eps-value")!;
    await userEvent.type(eps, "8");

    await userEvent.click(
      screen.getByRole("tab", { name: "Análise individual" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Análise individual sem ticker")).toBeTruthy(),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Minha carteira" }));

    expect(screen.getByLabelText("Percentual anual")).toHaveProperty(
      "value",
      "7.5",
    );
    expect(document.getElementById("PETR4-graham_eps-value")).toHaveProperty(
      "value",
      "8",
    );
  });
});
