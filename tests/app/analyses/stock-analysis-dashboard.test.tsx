// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StockAnalysisDashboard } from "@/app/analyses/_components/stock-analysis-dashboard";
import { QueryClientWrapper } from "../../utils/query-client-wrapper";
import type { ReactNode } from "react";

function render(ui: ReactNode) {
  return renderBase(<QueryClientWrapper>{ui}</QueryClientWrapper>);
}

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ data }: { data: Array<{ date: string }> }) => (
    <div
      data-points={data.map((point) => point.date).join(",")}
      data-testid="price-chart"
    />
  ),
  CartesianGrid: () => null,
  Bar: () => null,
  Cell: () => null,
  BarChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: Array<{
      periodLabel?: string;
      equity?: number | null;
      sourceDocument?: string | null;
      referenceDate?: string | null;
    }>;
  }) => (
    <div
      data-periods={data.map((point) => point.periodLabel ?? "").join(",")}
      data-equity={data.map((point) => point.equity ?? "").join(",")}
      data-sources={data.map((point) => point.sourceDocument ?? "").join(",")}
      data-references={data.map((point) => point.referenceDate ?? "").join(",")}
      data-testid="annual-chart"
    >
      {children}
    </div>
  ),
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const analysis = {
  ticker: "PETR4",
  cnpj: "33000167000101",
  companyName: "Petrobras",
  logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
  price: 30,
  priceUpdatedAt: "2026-09-19T15:30:00-03:00",
  changePercent: -1.25,
  history: [
    { date: "2026-09-19", close: 31 },
    { date: "2025-09-20", close: 25 },
    { date: "2026-08-25", close: 30 },
  ],
  fundamentals: [
    {
      referenceDate: "2025-12-31",
      sourceDocument: "DFP",
      revenue: "1000000",
      netIncome: "100000",
      equity: "500000",
    },
    {
      referenceDate: "2026-06-30",
      sourceDocument: "ITR",
      revenue: "600000",
      netIncome: "60000",
      equity: "550000",
    },
  ],
  indicators: [
    {
      key: "pe",
      value: 8.4,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP",
    },
    {
      key: "pb",
      value: 1.2,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP",
    },
    {
      key: "roe",
      value: 18.4,
      unavailableReason: null,
      referenceDate: "2025-12-31",
      sourceDocument: "DFP",
    },
    {
      key: "netMargin",
      value: null,
      unavailableReason: "Sem demonstrativo compatível",
      referenceDate: null,
      sourceDocument: null,
    },
  ],
};

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StockAnalysisDashboard", () => {
  it("labels the last observed quote and retrieval time of stale financial data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          priceIsStale: true,
          fundamentalsIsStale: true,
          fundamentalsFetchedAt: "2026-10-01T14:30:00.000Z",
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);

    const learningLink = await screen.findByRole("link", {
      name: "Aprender sobre Ações e BDRs",
    });
    expect(
      screen
        .getByRole("img", { name: "Identidade de Petrobras" })
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe(analysis.logoUrl);
    expect(learningLink.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Identidade de Petrobras" }).style.width,
    ).toBe("64px");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Data da cotação" }));
    await screen.findByRole("dialog", { name: "Data da cotação" });
    expect(learningLink.getAttribute("href")).toBe(
      "/learn?class=brazilian_equities#class-content",
    );

    expect(
      await screen.findByText(
        /Valores financeiros desatualizados.*conferidos em/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Data da cotação" }).textContent,
    ).toContain("Última cotação observada; não representa cotação atual");
    expect(screen.getByText("Cotação desatualizada")).toBeTruthy();
  });

  it("toasts a selected ticker API failure without duplicating it inline", async () => {
    let analysisRequests = 0;
    const user = userEvent.setup();
    const fetcher = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("/search?")
        ? Promise.resolve(
            jsonResponse({ results: [{ ticker: "VALE3", name: "Vale" }] }),
          )
        : Promise.resolve(
            analysisRequests++ === 0
              ? jsonResponse(
                  { message: "Consulta indisponível para Vale." },
                  503,
                )
              : jsonResponse({
                  ...analysis,
                  ticker: "VALE3",
                  companyName: "Vale",
                }),
          ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard />);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Vale" },
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 251));
    });
    fireEvent.click(await screen.findByRole("option", { name: /VALE3.*Vale/ }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Consulta indisponível para Vale.",
        { id: "stock-analysis-load" },
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("button", { name: "Data da cotação" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Aprender sobre Ações e BDRs" }),
    ).toBeTruthy();
  });

  it("updates the share URL and ignores an older ticker response", async () => {
    let resolveInitial!: (response: Response) => void;
    const initialResponse = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    let initialResponseUsed = false;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search?"))
        return Promise.resolve(
          jsonResponse({ results: [{ ticker: "VALE3", name: "Vale" }] }),
        );
      if (url.endsWith("/VALE3"))
        return Promise.resolve(
          jsonResponse({ ...analysis, ticker: "VALE3", companyName: "Vale" }),
        );
      if (url.endsWith("/PETR4") && initialResponseUsed)
        return Promise.resolve(jsonResponse(analysis));
      if (url.endsWith("/PETR4")) initialResponseUsed = true;
      return initialResponse;
    });
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Vale" } });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 251));
    });
    fireEvent.click(await screen.findByRole("option", { name: /VALE3.*Vale/ }));
    expect(window.location.search).toBe("?ticker=VALE3");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    resolveInitial(jsonResponse(analysis));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByRole("heading", { name: "VALE3" })).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "VALE3",
    );
    vi.clearAllMocks();
    vi.useRealTimers();
    await act(async () => {
      window.history.pushState({}, "", "/analyses?ticker=PETR4");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "PETR4" })).toBeTruthy();
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
        "PETR4",
      );
    });
    expect(fetcher).toHaveBeenCalledWith("/api/analyses/stocks/PETR4");
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    window.history.pushState({}, "", "/analyses?ticker=bad");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(""),
    );
    expect(screen.getByText("Encontre uma empresa para analisar")).toBeTruthy();

    const requestsBeforeLeaving = fetcher.mock.calls.length;
    window.history.pushState({}, "", "/?ticker=VALE3");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(requestsBeforeLeaving);
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
  });

  it("renders chronological chart data, interval controls, units, and fundamentals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(analysis)));
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);

    const chart = await screen.findByTestId("price-chart");
    expect(chart.dataset.points).toBe("2025-09-20,2026-08-25,2026-09-19");
    expect(screen.getByRole("button", { name: "1 ano" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Variação do preço no período · 1 ano",
      }),
    ).toBeTruthy();
    const assetSummary = screen.getByRole("img", {
      name: "Identidade de Petrobras",
    }).parentElement;
    expect(assetSummary?.textContent).toContain("PETR4");
    expect(assetSummary?.textContent).toMatch(/R\$\s*30,00/);
    expect(assetSummary?.textContent).not.toContain(
      "Variação do preço no período",
    );
    expect(screen.queryByText("Ativo consultado")).toBeNull();
    expect(screen.getByText(/\+24(?:,00)?%/).className).toContain(
      "text-status-success",
    );
    expect(
      screen
        .getByRole("button", { name: "1 ano" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "6 meses" })).toBeTruthy();
    expect(screen.getByText(/30,00/)).toBeTruthy();
    expect(screen.getByText("8,4x")).toBeTruthy();
    expect(screen.getByText("1,2x")).toBeTruthy();
    expect(screen.getByText("18,4%")).toBeTruthy();
    expect(
      screen.getByText("Faltam dados compatíveis de receita e lucro."),
    ).toBeTruthy();
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: /ver dados detalhados/i,
      }),
    );
    expect(
      await screen.findByText(/Mostra o total desde o começo do ano/),
    ).toBeTruthy();
    expect(await screen.findByText(/De onde vêm estes dados/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(DFP|ITR|LTM)\b/);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "1 mês" }));
    expect(chart.dataset.points).toBe("2026-08-25,2026-09-19");
    expect(
      screen.getByRole("button", {
        name: "Variação do preço no período · 1 mês",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/\+3,33%/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "1 mês" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "1 ano" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByLabelText("Variação do dia: -1.25%")).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Data da cotação" }));
    expect(
      (await screen.findByRole("dialog", { name: "Data da cotação" }))
        .textContent,
    ).toContain("Cotação observada em");
    expect(
      screen.getByRole("group", { name: "Intervalo do histórico" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "5 anos" })).toBeNull();
  });

  it("shows a one-year interval when the trading history is within a week of the calendar window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [
            { date: "2025-10-01", close: 25 },
            { date: "2026-09-24", close: 31 },
          ],
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);

    expect(await screen.findByRole("button", { name: "1 ano" })).toBeTruthy();
  });

  it("shows a negative change in the selected period in red", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [
            { date: "2025-09-19", close: 31 },
            { date: "2026-09-19", close: 25 },
          ],
        }),
      ),
    );
    const { container } = render(
      <StockAnalysisDashboard initialTicker="PETR4" />,
    );

    expect(await screen.findByText("-19,35%")).toBeTruthy();
    expect(container.querySelector(".text-status-danger")).toBeTruthy();
  });

  it("shows zero change neutrally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [
            { date: "2025-09-19", close: 30 },
            { date: "2026-09-19", close: 30 },
          ],
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    expect(
      (await screen.findByText("0%", { exact: true })).className,
    ).toContain("text-muted-foreground");
  });

  it("marks a zero starting price as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          ticker: "ITUB4",
          history: [
            { date: "2025-09-19", close: 0 },
            { date: "2026-09-19", close: 30 },
          ],
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker="ITUB4" />);
    expect(
      await screen.findByRole("button", {
        name: "Variação do preço no período · 1 ano",
      }),
    ).toBeTruthy();
    const priceChange = screen.getByRole("button", {
      name: "Variação do preço no período · 1 ano",
    }).parentElement;
    expect(within(priceChange!).getByText("Indisponível")).toBeTruthy();
  });

  it("offers five years only when the history covers that period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [
            { date: "2019-02-28", close: 25 },
            { date: "2024-02-29", close: 31 },
          ],
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);

    const fiveYears = await screen.findByRole("button", { name: "5 anos" });
    await userEvent.setup().click(fiveYears);
    const chart = await screen.findByTestId("price-chart");
    expect(chart.dataset.points).toBe("2019-02-28,2024-02-29");
  });

  it("keeps the analysis available when its CNPJ is unresolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ ...analysis, cnpj: null })),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);

    expect(
      await screen.findByRole("button", { name: "Data da cotação" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PETR4" })).toBeTruthy();
  });

  it("shows a loading state before the request resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Aprender sobre Ações e BDRs" }),
    ).toBeNull();
  });

  it("retries only history after the initial analysis preserved a rate limit", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason: "rate_limited" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ticker: "PETR4",
          history: [
            { date: "2025-09-19", close: 25 },
            { date: "2026-09-19", close: 31 },
          ],
          historyStatus: "available",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    expect(
      await screen.findByText("Histórico temporariamente indisponível"),
    ).toBeTruthy();
    const retry = await screen.findByRole("button", {
      name: "Tentar novamente",
    });
    await userEvent.setup().click(retry);
    await waitFor(() =>
      expect(screen.getByTestId("price-chart").dataset.points).toBe(
        "2025-09-19,2026-09-19",
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "/api/analyses/stocks/PETR4/history",
    );
  });

  it("automatically retries one transient history failure once", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason: "provider_error" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ticker: "PETR4",
          history: [
            { date: "2025-09-19", close: 25 },
            { date: "2026-09-19", close: 31 },
          ],
          historyStatus: "available",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText("Histórico temporariamente indisponível"),
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const chart = screen.getByTestId("price-chart");
    expect(chart.dataset.points).toBe("2025-09-19,2026-09-19");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "/api/analyses/stocks/PETR4/history",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("waits for a short Retry-After before one automatic history retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason: "rate_limited", retryAfterSeconds: 0.5 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ticker: "PETR4",
          history: [
            { date: "2025-09-19", close: 25 },
            { date: "2026-09-19", close: 31 },
          ],
          historyStatus: "available",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("price-chart").dataset.points).toBe(
      "2025-09-19,2026-09-19",
    );
  });

  it("does not automatically retry when Retry-After exceeds its safe window", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ...analysis,
        history: [],
        historyStatus: "unavailable",
        historyFailure: { reason: "rate_limited", retryAfterSeconds: 301 },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lets a manual history retry cancel the scheduled automatic retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason: "provider_error" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ticker: "PETR4",
          history: [
            { date: "2025-09-19", close: 25 },
            { date: "2026-09-19", close: 31 },
          ],
          historyStatus: "available",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await screen.findByText("Histórico temporariamente indisponível");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    const chart = await screen.findByTestId("price-chart");
    expect(chart.dataset.points).toBe("2025-09-19,2026-09-19");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cancels the pending automatic history retry when the analysis unmounts", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ...analysis,
        history: [],
        historyStatus: "unavailable",
        historyFailure: { reason: "timeout" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const view = render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["authentication", "http_error", "invalid_response"] as const)(
    "does not automatically retry definitive history failures (%s)",
    async (reason) => {
      vi.useFakeTimers();
      const fetcher = vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason },
        }),
      );
      vi.stubGlobal("fetch", fetcher);
      render(<StockAnalysisDashboard initialTicker="PETR4" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("honors Retry-After, counts down, then enables retry", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ message: "temporarily unavailable" }, 429, {
          "retry-after": "1",
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    const retry = screen.getByRole("button", {
      name: /tente novamente em 1s/i,
    });
    expect(retry.getAttribute("disabled")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen
        .getByRole("button", { name: "Tentar novamente" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("honors the history provider Retry-After independently of the analysis request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...analysis,
          history: [],
          historyStatus: "unavailable",
          historyFailure: { reason: "rate_limited", retryAfterSeconds: 1 },
        }),
      ),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen
        .getByRole("button", { name: "Aguarde 1s" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      screen
        .getByRole("button", { name: "Tentar novamente" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it.each([
    ["seconds", "1", "Aguarde 1s"],
    ["HTTP date", "Sat, 10 Oct 2026 12:00:01 GMT", "Aguarde 1s"],
    ["missing header", null, "Tentar novamente"],
    ["invalid header", "invalid", "Tentar novamente"],
  ])(
    "honors Retry-After from a direct history HTTP 429 (%s)",
    async (_label, retryAfter, expectedButton) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ...analysis,
            history: [],
            historyStatus: "unavailable",
            historyFailure: { reason: "provider_error" },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ message: "temporarily unavailable" }, 429, {
            ...(retryAfter ? { "retry-after": retryAfter } : {}),
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      render(<StockAnalysisDashboard initialTicker="PETR4" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: expectedButton })).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("opens indicator help by click and closes it with Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(analysis)));
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: /ajuda sobre p\/l/i,
      }),
    );
    expect(
      await screen.findByText(/Compara o valor de mercado da empresa/i),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByText(/Compara o valor de mercado da empresa/i),
    ).toBeNull();
  });
});
it("handles missing company and price data with no available history interval", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({
        ...analysis,
        companyName: null,
        price: null,
        changePercent: null,
        history: [{ date: "2026-09-19", close: 31 }],
        fundamentals: [],
      }),
    ),
  );
  render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByText(/Empresa/)).toBeTruthy();
  expect(screen.getByLabelText("Variação do dia não informada")).toBeTruthy();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "1 ano" })).toBeNull();
  const periodChange = screen.getByRole("button", {
    name: /Variação do preço no período/,
  }).parentElement;
  expect(within(periodChange!).getByText("Indisponível")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: /ver dados detalhados/i,
    }),
  );
  expect(
    screen.getByText("Não há resultados anuais disponíveis."),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Não há atualizações financeiras disponíveis durante o ano.",
    ),
  ).toBeTruthy();
});

it("returns to search when a successful response has no analysis body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null)));
  render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Ativo consultado")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Aprender sobre Ações e BDRs" }),
  ).toBeNull();
});

it("starts with an empty search and does not fetch a default company", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<StockAnalysisDashboard />);
  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.getByText("Encontre uma empresa para analisar")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});

it("renders the server snapshot without reading browser storage", () => {
  const queryClient = new QueryClient();
  const markup = renderToString(
    <QueryClientProvider client={queryClient}>
      <StockAnalysisDashboard />
    </QueryClientProvider>,
  );

  expect(markup).toContain("Encontre uma empresa para analisar");
  queryClient.clear();
});

it("offers recent tickers stored locally and lets the user resume one", async () => {
  window.localStorage.setItem(
    "investlab:analyses:recent-tickers",
    JSON.stringify([
      { ticker: "PETR4", name: "Petrobras" },
      { ticker: "VALE3", name: "Vale" },
    ]),
  );
  const fetcher = vi.fn().mockResolvedValue(jsonResponse(analysis));
  vi.stubGlobal("fetch", fetcher);

  render(<StockAnalysisDashboard />);
  expect(await screen.findByText("Consultadas recentemente")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retomar análise de PETR4" }));

  expect(await screen.findByRole("heading", { name: "PETR4" })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith("/api/analyses/stocks/PETR4");
});

it("ignores malformed recent ticker storage and keeps the search available", async () => {
  window.localStorage.setItem("investlab:analyses:recent-tickers", "{");
  render(<StockAnalysisDashboard />);

  expect(await screen.findByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Consultadas recentemente")).toBeNull();
});

it("ignores recent ticker storage that is not an array", async () => {
  window.localStorage.setItem("investlab:analyses:recent-tickers", "null");
  render(<StockAnalysisDashboard />);

  expect(await screen.findByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Consultadas recentemente")).toBeNull();
});

it("treats inaccessible recent ticker storage as empty", () => {
  const storageRead = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("Storage access denied");
    });

  render(<StockAnalysisDashboard />);

  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Consultadas recentemente")).toBeNull();
  storageRead.mockRestore();
});

it("keeps the stock search available when browser storage is blocked", () => {
  const storageRead = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("Storage is unavailable");
    });

  render(<StockAnalysisDashboard />);

  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Consultadas recentemente")).toBeNull();
  storageRead.mockRestore();
});

it("stores recent ticker metadata when the analysis has no logo", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ ...analysis, logoUrl: null })),
  );
  render(<StockAnalysisDashboard initialTicker="PETR4" />);
  await screen.findByRole("heading", { name: "PETR4" });
  expect(
    JSON.parse(
      window.localStorage.getItem("investlab:analyses:recent-tickers") ?? "[]",
    )[0],
  ).toEqual({ ticker: "PETR4", name: "Petrobras" });
});

it("moves a newly consulted ticker to the front and keeps only five unique entries", async () => {
  window.localStorage.setItem(
    "investlab:analyses:recent-tickers",
    JSON.stringify([
      { ticker: "PETR4", name: "Old name" },
      { ticker: "VALE3", name: "Vale" },
      { ticker: "ITUB4", name: "Itaú" },
      { ticker: "BBDC4", name: "Bradesco" },
      { ticker: "ABEV3", name: "Ambev" },
    ]),
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(analysis)));

  render(<StockAnalysisDashboard initialTicker="PETR4" />);
  expect(
    await screen.findByRole("button", { name: "Data da cotação" }),
  ).toBeTruthy();

  const recent = JSON.parse(
    window.localStorage.getItem("investlab:analyses:recent-tickers") ?? "[]",
  ) as Array<{ ticker: string; name: string }>;
  expect(recent).toHaveLength(5);
  expect(recent[0]).toEqual({
    ticker: "PETR4",
    name: "Petrobras",
    logoUrl: analysis.logoUrl,
  });
  expect(new Set(recent.map(({ ticker }) => ticker)).size).toBe(5);
});

it("shows the annual fact reading and keeps statement detail collapsed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({
        ...analysis,
        fundamentals: [
          {
            ...analysis.fundamentals[0],
            referenceDate: "2024-12-31",
            revenue: "900000",
            netIncome: "80000",
            equity: null,
          },
          {
            ...analysis.fundamentals[0],
            referenceDate: "2025-12-31",
            revenue: "1000000",
            netIncome: "100000",
            equity: null,
          },
          analysis.fundamentals[1],
        ],
      }),
    ),
  );
  render(<StockAnalysisDashboard initialTicker="PETR4" />);

  expect(await screen.findByText("Lucro líquido do ano")).toBeTruthy();
  expect(screen.getByText("Receita anual")).toBeTruthy();
  expect(screen.getByText("Resultado positivo")).toBeTruthy();
  expect(
    screen.getByText(
      "Receita, lucro e patrimônio da empresa em cada ano disponível.",
    ),
  ).toBeTruthy();
  const charts = screen.getAllByTestId("annual-chart");
  expect(charts.map((chart) => chart.getAttribute("data-periods"))).toEqual([
    "2022,2023,2024,2025,2026",
    "2022,2023,2024,2025,2026",
    "2022,2023,2024,2025,2026",
  ]);
  expect(charts[2].getAttribute("data-equity")).toBe(",,,,550000");
  expect(charts[2].getAttribute("data-references")).toBe(",,,,2026-06-30");
  expect(
    screen.queryByRole("heading", { name: "Sobre os dados financeiros" }),
  ).toBeNull();
  expect(
    screen.queryByText(/P\/L e P\/VP usam o valor de mercado da BRAPI/),
  ).toBeNull();
  expect(screen.queryByText("Atualizações durante o ano")).toBeNull();
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: /ver dados detalhados/i,
    }),
  );
  expect(document.body.textContent).not.toMatch(/\b(DFP|ITR|LTM)\b/);
  expect(await screen.findByText("Atualizações durante o ano")).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Sobre os dados financeiros" }),
  ).toBeNull();
});

it("separates accumulated and isolated ITR periods and handles missing quote time", async () => {
  const currentInterim = {
    ...analysis.fundamentals[1],
    referenceDate: "2026-06-30",
    periodBasis: "year_to_date",
    exerciseOrder: "last",
  };
  const response = {
    ...analysis,
    priceUpdatedAt: "invalid timestamp",
    fundamentals: [
      ...analysis.fundamentals.slice(0, 1),
      currentInterim,
      {
        ...currentInterim,
        referenceDate: "2025-06-30",
        exerciseOrder: "previous",
      },
      {
        ...currentInterim,
        referenceDate: "2026-03-31",
        periodBasis: "quarterly",
        exerciseOrder: "last",
      },
      {
        ...currentInterim,
        referenceDate: "2025-03-31",
        periodBasis: "quarterly",
        exerciseOrder: "previous",
      },
      { ...currentInterim, isDerived: true },
    ],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));
  render(<StockAnalysisDashboard initialTicker="PETR4" />);

  await screen.findByRole("button", { name: "Data da cotação" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Data da cotação" }));
  expect(
    (await screen.findByRole("dialog", { name: "Data da cotação" }))
      .textContent,
  ).toContain("Data da cotação não informada");
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: /ver dados detalhados/i,
    }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Resultados de cada trimestre",
    }),
  ).toBeTruthy();
  expect(screen.getByText("Receita acumulada no ano")).toBeTruthy();
  expect(screen.getByText("Receita do trimestre")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Resultados de cada trimestre" }),
  ).toBeTruthy();
  expect(screen.getAllByText(/Mesmo período do ano anterior até/)).toHaveLength(
    1,
  );
  expect(document.body.textContent).not.toMatch(/\b(DFP|ITR|LTM)\b/);
});

it("ignores a stale request rejection after a newer ticker has loaded", async () => {
  let rejectInitial!: (reason?: unknown) => void;
  const staleResponse = new Promise<Response>((_resolve, reject) => {
    rejectInitial = reject;
  });
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => staleResponse)
    .mockResolvedValueOnce(jsonResponse(analysis));
  vi.stubGlobal("fetch", fetcher);
  render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
  await act(async () => {
    window.history.pushState({}, "", "/analyses?ticker=VALE3");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    rejectInitial(new Error("stale request failed"));
    await Promise.resolve();
  });

  expect(await screen.findByText("Indicadores financeiros")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
  [2, "+2%", "text-status-success", "lucide-arrow-up-right"],
  [-2, "-2%", "text-status-danger", "lucide-arrow-down-right"],
  [0, "0%", "text-muted-foreground", "lucide-minus"],
])(
  "highlights daily change %s without expanding the asset header",
  async (changePercent, value, tone, icon) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...analysis, changePercent })),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);
    const change = await screen.findByLabelText(
      `Variação do dia: ${changePercent.toFixed(2)}%`,
    );
    expect(change.textContent).toContain(value);
    expect(change.className).toContain(tone);
    expect(change.querySelector(`.${icon}`)).toBeTruthy();
    expect(screen.queryByText("Ativo consultado")).toBeNull();
  },
);
