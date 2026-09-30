/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MarketDataSettings } from "@/app/settings/_components/market-data-settings";
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

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
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.warning).mockReset();
});

const revealRefreshAction = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  const details = await screen.findByRole("button", {
    name: "Detalhes técnicos",
  });
  if (details?.getAttribute("aria-expanded") === "false")
    await user.click(details);
};

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
    expect(screen.getByText(/hoje/)).toBeTruthy();
    expect(screen.queryByText("AAA3")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Atualizar mercado" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Detalhes técnicos" }));
    expect(screen.getByText("AAA3")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    await revealRefreshAction(user);
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Mercado atualizado: 5 emissores com cotação validada.",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/screener/market/refresh",
      { method: "POST", cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/settings/market-data", {
      cache: "no-store",
    });
  });

  it("discloses the seven-day quote rule while keeping quote status visible", async () => {
    const user = userEvent.setup();
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
    expect(screen.getByText(/nenhuma cotação registrada/)).toBeTruthy();
    const criteria = screen.getByRole("button", {
      name: "Detalhes técnicos",
      expanded: false,
    });
    await user.click(criteria);
    expect(
      screen.getByRole("button", {
        name: "Detalhes técnicos",
        expanded: true,
      }),
    ).toBeTruthy();
    expect(await screen.findByText(/sete dias/)).toBeTruthy();
  });

  it.each(["RUNNING", "PARTIAL"] as const)(
    "keeps the initial refresh action visible without a quote when the latest run is %s",
    async (runStatus) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response({
            latestQuote: null,
            latestRun: { ...status.latestRun, status: runStatus },
          }),
        ),
      );
      render(<MarketDataSettings />);

      const refreshButton = await screen.findByRole("button", {
        name: "Atualizar mercado",
      });
      expect(refreshButton).toHaveProperty("disabled", runStatus === "RUNNING");
      expect(
        screen.getByRole("button", {
          name: "Detalhes técnicos",
          expanded: false,
        }),
      ).toBeTruthy();
    },
  );

  it("reports failed fetch and refresh with safe feedback", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ message: "Falha da BRAPI" }, false))
      .mockResolvedValueOnce(response({ latestQuote: null, latestRun: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);
    expect(
      await screen.findByText(
        "Não foi possível consultar os dados de mercado.",
      ),
    ).toBeTruthy();
    await revealRefreshAction(user);
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha da BRAPI"),
    );
    expect(screen.queryByText("Falha da BRAPI")).toBeNull();
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
    await revealRefreshAction(user);
    await user.click(screen.getByRole("button", { name: "Atualizar mercado" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A atualização de mercado não foi concluída.",
      ),
    );
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
    await revealRefreshAction(user);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    expect(
      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "A atualização não avançou. Tente novamente mais tarde.",
        ),
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
      await revealRefreshAction(user);
      await user.click(
        await screen.findByRole("button", { name: "Atualizar mercado" }),
      );
      const expected =
        unavailableIssuers === 1
          ? "; 1 emissor indisponível"
          : "; 2 emissores indisponíveis";
      await vi.waitFor(() =>
        expect(toast.warning).toHaveBeenCalledWith(
          expect.stringContaining(expected),
        ),
      );
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
    await revealRefreshAction(user);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Mercado atualizado: 0 emissores"),
      ),
    );
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
    await revealRefreshAction(user);
    await user.click(
      await screen.findByRole("button", { name: "Atualizar mercado" }),
    );
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível atualizar os dados de mercado.",
      ),
    );
  });

  it.each(["API status rejection", "network status rejection"])(
    "keeps a reload failure visible after refresh succeeds (%s)",
    async (failureKind) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(status))
        .mockResolvedValueOnce(
          response({
            attemptedIssuers: 1,
            updatedIssuers: 1,
            unavailableIssuers: 0,
            totalStaleIssuers: 1,
            remainingIssuers: 0,
          }),
        );
      if (failureKind === "API status rejection")
        fetchMock.mockResolvedValueOnce(
          response({ message: "Status atualizado indisponível." }, false),
        );
      else fetchMock.mockRejectedValueOnce(new Error("private status detail"));
      vi.stubGlobal("fetch", fetchMock);
      render(<MarketDataSettings />);

      await revealRefreshAction(user);
      await user.click(
        screen.getByRole("button", { name: "Atualizar mercado" }),
      );

      expect((await screen.findByRole("alert")).textContent).toContain(
        failureKind === "API status rejection"
          ? "Status atualizado indisponível."
          : "Não foi possível consultar os dados de mercado.",
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Mercado atualizado: 1 emissores com cotação validada.",
      );
      expect(screen.queryByText("private status detail")).toBeNull();
    },
  );
});
