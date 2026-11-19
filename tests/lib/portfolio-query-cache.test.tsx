// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "@/components/query-provider";
import {
  useMonthlyPortfolioReview,
  usePortfolioAllocation,
  usePortfolioObjectives,
  usePortfolioOverview,
  usePortfolioProventos,
} from "@/lib/queries/portfolio";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function CachedPage({ label }: { label: string }) {
  const query = usePortfolioOverview<{ title: string }>();
  if (query.isPending) return <p>Carregando…</p>;
  return <p>{`${label}: ${query.data?.title}`}</p>;
}

function NavigationHarness() {
  const [page, setPage] = useState("Dashboard");
  return (
    <QueryProvider>
      <button
        type="button"
        onClick={() => setPage(page === "Dashboard" ? "Carteira" : "Dashboard")}
      >
        Alternar página
      </button>
      <CachedPage key={page} label={page} />
    </QueryProvider>
  );
}

function MonthlyReviewHarness() {
  const [period, setPeriod] = useState<string | null>(null);
  const query = useMonthlyPortfolioReview(period);
  return (
    <div>
      <button type="button" onClick={() => setPeriod("2026-08")}>
        Escolher agosto
      </button>
      <p>{query.data?.selectedPeriod ?? "Carregando fechamento…"}</p>
    </div>
  );
}

function ProventosHarness() {
  const query = usePortfolioProventos<{ totalReceived: string }>();
  return <p>{query.data?.totalReceived ?? "Carregando proventos…"}</p>;
}

function ObjectivesAndAllocationHarness() {
  const objectives = usePortfolioObjectives<{ name: string }[]>();
  const allocation = usePortfolioAllocation<{ total: string }>();
  return (
    <p>
      {objectives.data?.[0]?.name ?? "Carregando objetivos…"} ·{" "}
      {allocation.data?.total ?? "Carregando alocação…"}
    </p>
  );
}

describe("portfolio query cache", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses loaded data immediately when navigating between pages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Patrimônio carregado" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NavigationHarness />);

    expect(
      await screen.findByText("Dashboard: Patrimônio carregado"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Alternar página" }));

    expect(screen.getByText("Carteira: Patrimônio carregado")).toBeTruthy();
    expect(screen.queryByText("Carregando…")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("refreshes cached portfolio data after a portfolio mutation event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Valor anterior" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Valor atualizado" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<NavigationHarness />);

    expect(await screen.findByText("Dashboard: Valor anterior")).toBeTruthy();
    window.dispatchEvent(new Event("portfolio:updated"));

    expect(await screen.findByText("Dashboard: Valor atualizado")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keys monthly closes by month and fetches the selected period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ selectedPeriod: "2026-08" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryProvider>
        <MonthlyReviewHarness />
      </QueryProvider>,
    );

    expect(await screen.findByText("2026-08")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/portfolio/monthly-review",
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher agosto" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/portfolio/monthly-review?period=2026-08",
    );
  });

  it("loads the portfolio proventos through its dedicated cached query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalReceived: "234" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryProvider>
        <ProventosHarness />
      </QueryProvider>,
    );

    expect(await screen.findByText("234")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/proventos");
  });

  it("loads objectives and allocation through their dedicated cached queries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "Reserva" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total: "10000" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryProvider>
        <ObjectivesAndAllocationHarness />
      </QueryProvider>,
    );

    expect(await screen.findByText("Reserva · 10000")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/portfolio/objectives");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/portfolio/allocation");
  });
});
