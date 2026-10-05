// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StockAnalysisDashboard } from "@/app/analyses/_components/stock-analysis-dashboard";

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="annual-chart">{children}</div>
  ),
  Line: () => null,
  Legend: () => null,
  LineChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: Array<{ date: string }>;
  }) => (
    <div
      data-points={data.map((point) => point.date).join(",")}
      data-testid="price-chart"
    >
      {children}
    </div>
  ),
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
  price: 30,
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
  it("toasts a selected ticker API failure without duplicating it inline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("/search?")
        ? Promise.resolve(
            jsonResponse({ results: [{ ticker: "VALE3", name: "Vale" }] }),
          )
        : Promise.resolve(
            jsonResponse({ message: "Consulta indisponível para Vale." }, 503),
          ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard />);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Vale" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(251);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("option", { name: /VALE3.*Vale/ }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Consulta indisponível para Vale.",
      { id: "stock-analysis-load" },
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
  });

  it("updates the share URL and ignores an older ticker response", async () => {
    vi.useFakeTimers();
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Vale" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(251);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("option", { name: /VALE3.*Vale/ }));
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
    expect(screen.getByText(/VALE3.*Vale/)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
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
      expect(screen.getByText(/PETR4.*Petrobras/)).toBeTruthy();
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
      screen.getByText("Variação do preço no período · 1 ano"),
    ).toBeTruthy();
    expect(screen.getByText("Sem dividendos")).toBeTruthy();
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
    expect(screen.getByText("8.4x")).toBeTruthy();
    expect(screen.getByText("1.2x")).toBeTruthy();
    expect(screen.getByText("18.4%")).toBeTruthy();
    expect(screen.getByText("Sem demonstrativo compatível")).toBeTruthy();
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: /ver demonstrativos e detalhes técnicos/i,
      }),
    );
    expect(await screen.findByText(/acumulados no exercício/)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "1 mês" }));
    expect(chart.dataset.points).toBe("2026-08-25,2026-09-19");
    expect(
      screen.getByText("Variação do preço no período · 1 mês"),
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
    expect(screen.getByText("Variação do dia: -1.25%")).toBeTruthy();
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
      await screen.findByText("Variação do preço no período · 1 ano"),
    ).toBeTruthy();
    const priceChange = screen.getByText(
      "Variação do preço no período · 1 ano",
    ).parentElement;
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

  it("keeps the analysis focused on its data without offering the study list", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(analysis));
    vi.stubGlobal("fetch", fetcher);
    render(<StockAnalysisDashboard initialTicker="PETR4" />);

    expect(await screen.findByText(/PETR4.*Petrobras/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /lista de estudo/i }),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the analysis available when its CNPJ is unresolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ ...analysis, cnpj: null })),
    );
    render(<StockAnalysisDashboard initialTicker="PETR4" />);

    expect(await screen.findByText("Ativo consultado")).toBeTruthy();
    expect(screen.getByText(/PETR4.*Petrobras/)).toBeTruthy();
  });

  it("shows a loading state before the request resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
  });

  it("shows the no-history state and retries a generic error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...analysis, history: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: "erro" }, 500));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(
      <StockAnalysisDashboard initialTicker={"PETR4"} />,
    );
    expect(
      await screen.findByText(/não há histórico suficiente/i),
    ).toBeTruthy();
    unmount();

    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    const retry = await screen.findByRole("button", {
      name: "Tentar novamente",
    });
    await userEvent.setup().click(retry);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

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

  it("opens indicator help by click and closes it with Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(analysis)));
    render(<StockAnalysisDashboard initialTicker={"PETR4"} />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /ajuda sobre p\/l/i }),
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
  expect(screen.getByText(/Varia.*informada/)).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "1 ano" })).toBeNull();
  const periodChange = screen.getByText(
    /Variação do preço no período/,
  ).parentElement;
  expect(within(periodChange!).getByText("Indisponível")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: /ver demonstrativos e detalhes técnicos/i,
    }),
  );
  expect(screen.getAllByText(/Sem demonstra/)).toHaveLength(2);
  expect(screen.getByText(/Sem informa/)).toBeTruthy();
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
});

it("starts with an empty search and does not fetch a default company", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<StockAnalysisDashboard />);
  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.getByText("Encontre uma empresa para analisar")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
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

  expect(await screen.findByText(/PETR4.*Petrobras/)).toBeTruthy();
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
  expect(await screen.findByText("Ativo consultado")).toBeTruthy();

  const recent = JSON.parse(
    window.localStorage.getItem("investlab:analyses:recent-tickers") ?? "[]",
  ) as Array<{ ticker: string; name: string }>;
  expect(recent).toHaveLength(5);
  expect(recent[0]).toEqual({ ticker: "PETR4", name: "Petrobras" });
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
          },
          {
            ...analysis.fundamentals[0],
            referenceDate: "2025-12-31",
            revenue: "1000000",
            netIncome: "100000",
          },
          analysis.fundamentals[1],
        ],
      }),
    ),
  );
  render(<StockAnalysisDashboard initialTicker="PETR4" />);

  expect(await screen.findByText("Lucro líquido do exercício")).toBeTruthy();
  expect(screen.getByText("Receita anual")).toBeTruthy();
  expect(screen.getByText("Resultado positivo")).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Sobre os dados financeiros" }),
  ).toBeNull();
  expect(
    screen.queryByText(/P\/L e P\/VP usam o valor de mercado da BRAPI/),
  ).toBeNull();
  expect(screen.queryByText(/Informações trimestrais \(ITR\)/)).toBeNull();
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: /ver demonstrativos e detalhes técnicos/i,
    }),
  );
  expect(
    await screen.findByText(/Informações trimestrais \(ITR\)/),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Sobre os dados financeiros" }),
  ).toBeNull();
});

it("ignores a stale request rejection after a newer ticker has loaded", async () => {
  vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(0);
  });

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

  expect(screen.getByText("Indicadores fundamentalistas")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
