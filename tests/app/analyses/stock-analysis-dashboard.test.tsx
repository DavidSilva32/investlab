// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
  it("updates the share URL and ignores an older ticker response", async () => {
    vi.useFakeTimers();
    let resolveInitial!: (response: Response) => void;
    const initialResponse = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
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
    expect(screen.getByText(/VALE3/)).toBeTruthy();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/analyses?ticker=PETR4");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "PETR4",
    );
    expect(fetcher).toHaveBeenCalledWith("/api/analyses/stocks/PETR4");
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    window.history.pushState({}, "", "/analyses?ticker=bad");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "PETR4",
    );

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
    render(<StockAnalysisDashboard />);

    const chart = await screen.findByTestId("price-chart");
    expect(chart.dataset.points).toBe("2025-09-20,2026-08-25,2026-09-19");
    expect(screen.getByRole("button", { name: "1 ano" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "6 meses" })).toBeTruthy();
    expect(screen.getByText("8.4x")).toBeTruthy();
    expect(screen.getByText("18.4%")).toBeTruthy();
    expect(screen.getByText("Sem demonstrativo compatível")).toBeTruthy();
    expect(screen.getByText(/acumulado até/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "1 mês" }));
    expect(chart.dataset.points).toBe("2026-08-25,2026-09-19");
  });

  it("shows a loading state before the request resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<StockAnalysisDashboard />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
  });

  it("shows the no-history state and retries a generic error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...analysis, history: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: "erro" }, 500));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<StockAnalysisDashboard />);
    expect(
      await screen.findByText(/não há histórico suficiente/i),
    ).toBeTruthy();
    unmount();

    render(<StockAnalysisDashboard />);
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
    render(<StockAnalysisDashboard />);
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
    render(<StockAnalysisDashboard />);
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
  render(<StockAnalysisDashboard />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByText(/Empresa/)).toBeTruthy();
  expect(screen.getByText(/Varia.*informada/)).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "1 ano" })).toBeNull();
  expect(screen.getAllByText(/Sem demonstra/)).toHaveLength(2);
  expect(screen.getByText(/Sem informa/)).toBeTruthy();
});

it("returns to search when a successful response has no analysis body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null)));
  render(<StockAnalysisDashboard />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByLabelText("Pesquisar ação")).toBeTruthy();
  expect(screen.queryByText("Ativo consultado")).toBeNull();
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
  render(<StockAnalysisDashboard />);
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
