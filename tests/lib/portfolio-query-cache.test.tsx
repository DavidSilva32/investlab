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
import { usePortfolioOverview } from "@/lib/queries/portfolio";

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
});
