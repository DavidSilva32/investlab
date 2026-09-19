// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StockAnalysisProof } from "@/app/analyses/_components/stock-analysis-proof";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StockAnalysisProof", () => {
  it("renders chronological chart data, interval controls, units, and fundamentals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(analysis)));
    render(<StockAnalysisProof />);

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
    render(<StockAnalysisProof />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
  });

  it("shows the no-history state and retries a generic error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...analysis, history: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: "erro" }, 500));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<StockAnalysisProof />);
    expect(
      await screen.findByText(/não há histórico suficiente/i),
    ).toBeTruthy();
    unmount();

    render(<StockAnalysisProof />);
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
    render(<StockAnalysisProof />);
    await act(async () => {
      await Promise.resolve();
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
    render(<StockAnalysisProof />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /ajuda sobre p\/l/i }),
    );
    expect(
      await screen.findByText(/valor de mercado ao lucro líquido/i),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/valor de mercado ao lucro líquido/i)).toBeNull();
  });
});
