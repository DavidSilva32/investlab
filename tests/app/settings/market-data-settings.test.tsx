/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketDataSettings } from "@/app/settings/_components/market-data-settings";

const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const status = {
  latestQuote: {
    quoteObservedAt: new Date().toISOString(),
    sourceTicker: "AAA3",
  },
  latestRun: {
    status: "COMPLETED" as const,
    startedAt: "2026-09-24T12:00:00.000Z",
    completedAt: "2026-09-24T12:01:00.000Z",
    attemptedIssuers: 4,
    updatedIssuers: 3,
    unavailableIssuers: 1,
    skippedFreshIssuers: 0,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketDataSettings", () => {
  it("shows quote age separately from refresh execution and runs a manual refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(
        response({
          attemptedIssuers: 3,
          updatedIssuers: 3,
          unavailableIssuers: 0,
          totalStaleIssuers: 5,
          remainingIssuers: 2,
        }),
      )
      .mockResolvedValueOnce(
        response({
          attemptedIssuers: 2,
          updatedIssuers: 2,
          unavailableIssuers: 0,
          totalStaleIssuers: 2,
          remainingIssuers: 0,
        }),
      )
      .mockResolvedValueOnce(response(status));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    expect(
      await screen.findByText("Status da última execução: Concluída"),
    ).toBeTruthy();
    expect(screen.getByText("AAA3")).toBeTruthy();
    expect(screen.getByText(/hoje/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    expect(
      await screen.findByText(
        "Mercado atualizado: 5 emissores com cotação validada.",
      ),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/screener/market/refresh",
      { method: "POST", cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/settings/market-data", {
      cache: "no-store",
    });
  });

  it("renders empty history and the recommendation for seven-day quote age", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ latestQuote: null, latestRun: null })),
    );
    render(<MarketDataSettings />);
    expect(
      await screen.findByText("Status da última execução: Ainda não executada"),
    ).toBeTruthy();
    expect(screen.getByText("Sem cotação registrada")).toBeTruthy();
    expect(screen.getByText(/até sete dias/)).toBeTruthy();
  });

  it("reports failed fetch and refresh with safe feedback", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ message: "Falha da BRAPI" }, false))
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    expect(await screen.findByText("offline")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    expect(await screen.findByText("Falha da BRAPI")).toBeTruthy();
  });

  it("describes a quote from one day ago and refreshes still running or partial", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const agedStatus = {
      latestQuote: { quoteObservedAt: yesterday, sourceTicker: "BBB3" },
      latestRun: { ...status.latestRun, status: "PARTIAL" as const },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(agedStatus)));
    render(<MarketDataSettings />);
    expect(await screen.findByText(/há 1 dia/)).toBeTruthy();
    expect(screen.getByText("Status da última execução: Parcial")).toBeTruthy();

    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          latestQuote: null,
          latestRun: {
            ...status.latestRun,
            status: "RUNNING",
            completedAt: null,
          },
        }),
      ),
    );
    render(<MarketDataSettings />);
    expect(
      await screen.findByText("Status da última execução: Em andamento"),
    ).toBeTruthy();
  });
  it("uses a plural age for older quotes", async () => {
    const older = new Date(Date.now() - 3 * 86_400_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          latestQuote: { quoteObservedAt: older, sourceTicker: "CCC3" },
          latestRun: null,
        }),
      ),
    );
    render(<MarketDataSettings />);
    expect(await screen.findByText(/3 dias/)).toBeTruthy();
  });

  it("uses safe fallback messages for malformed failures and status reload errors", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    expect(
      await screen.findByText(/possível consultar os dados de mercado/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    expect(await screen.findByText(/não foi concluída/)).toBeTruthy();
  });
  it("guards against a batch that leaves issuers without progress", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ remainingIssuers: 1 }))
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    expect(
      await screen.findByText(
        "A atualização não avançou. Tente novamente mais tarde.",
      ),
    ).toBeTruthy();
  });

  it.each([1, 2])(
    "summarizes %i unavailable issuers",
    async (unavailableIssuers) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(status))
        .mockResolvedValueOnce(
          response({
            attemptedIssuers: unavailableIssuers,
            updatedIssuers: 1,
            unavailableIssuers,
            totalStaleIssuers: 1,
            remainingIssuers: 0,
          }),
        )
        .mockResolvedValueOnce(response(status));
      vi.stubGlobal("fetch", fetchMock);
      render(<MarketDataSettings />);
      await user.click(
        await screen.findByRole("button", { name: "Atualizar mercado" }),
      );
      const expected =
        unavailableIssuers === 1
          ? "; 1 emissor indisponível"
          : "; 2 emissores indisponíveis";
      expect(await screen.findByText(new RegExp(expected))).toBeTruthy();
    },
  );
  it("defaults missing batch counters to an empty completed batch", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    expect(
      await screen.findByText(/Mercado atualizado: 0 emissores/),
    ).toBeTruthy();
  });
  it.each([true, false])(
    "ignores status responses after unmount",
    async (succeeds) => {
      let resolveResponse!: (value: {
        ok: boolean;
        json: () => Promise<unknown>;
      }) => void;
      let rejectResponse!: (reason?: unknown) => void;
      const pending = new Promise<{
        ok: boolean;
        json: () => Promise<unknown>;
      }>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });
      const fetchMock = vi.fn(() => pending);
      vi.stubGlobal("fetch", fetchMock);
      const { unmount } = render(<MarketDataSettings />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      unmount();
      if (succeeds)
        resolveResponse({ ok: true, json: () => Promise.resolve(status) });
      else rejectResponse(new Error("late failure"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.body.textContent).toBe("");
    },
  );
  it("uses a generic message when the refresh request rejects a non-Error value", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    expect(
      await screen.findByText(/Não foi possível atualizar os dados de mercado/),
    ).toBeTruthy();
  });
});
