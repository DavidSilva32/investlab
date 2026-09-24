/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenerDataSettings } from "@/app/settings/_components/screener-data-settings";
const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const cleanStatus = {
  hasSuccessfulSync: true,
  latestRun: {
    status: "COMPLETED" as const,
    startedAt: "2026-09-24T10:00:00.000Z",
    completedAt: "2026-09-24T10:02:30.000Z",
    durationMs: 150000,
    issuerCount: 400,
    securityCount: 520,
    factCount: 8000,
    errorMessage: null,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScreenerDataSettings", () => {
  it("loads run metadata and triggers a manual sync through the session route", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(cleanStatus))
      .mockResolvedValueOnce(response({ issuers: 400 }))
      .mockResolvedValueOnce(response(cleanStatus));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);
    expect(await screen.findByText("Status: Concluída")).toBeTruthy();
    expect(screen.getByText("520")).toBeTruthy();
    expect(screen.getByText("8.000")).toBeTruthy();
    expect(screen.getByText("2 min 30 s")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/screener/sync",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/settings/screener", {
      cache: "no-store",
    });
  });

  it("announces elapsed time accessibly while the sync request is pending", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(cleanStatus))
      .mockImplementationOnce(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);
    await user.click(
      await screen.findByRole("button", { name: "Sincronizar agora" }),
    );
    expect(
      (
        await screen.findByText("Sincronização em andamento há 0 s.")
      ).getAttribute("aria-live"),
    ).toBe("polite");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(screen.getByText("Sincronização em andamento há 1 s.")).toBeTruthy();
  });
  it("shows running status, short duration, and missing counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          hasSuccessfulSync: false,
          latestRun: {
            ...cleanStatus.latestRun,
            status: "RUNNING",
            durationMs: 12000,
            completedAt: null,
            issuerCount: null,
            securityCount: null,
            factCount: null,
          },
        }),
      ),
    );
    render(<ScreenerDataSettings />);
    expect(await screen.findByText("Status: Em andamento")).toBeTruthy();
    expect(screen.getByText("12 s")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("uses a generic message for an initial network failure and an empty sync error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce("offline")
      .mockRejectedValueOnce(new Error(""))
      .mockResolvedValueOnce(
        response({ hasSuccessfulSync: false, latestRun: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);
    expect(
      await screen.findByText(
        "Não foi possível consultar o status da sincronização.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    expect(
      await screen.findByText(
        "A sincronização não foi concluída. Consulte o status abaixo.",
      ),
    ).toBeTruthy();
  });
  it.each([
    [{ message: "Status refresh failed." }, "Status refresh failed."],
    [{}, "Não foi possível consultar o status da sincronização."],
  ])(
    "preserves sync success and reports a status refresh failure",
    async (body, message) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(cleanStatus))
        .mockResolvedValueOnce(response({ issuers: 400 }))
        .mockResolvedValueOnce(response(body, false));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<ScreenerDataSettings />);
      await user.click(
        await screen.findByRole("button", { name: "Sincronizar agora" }),
      );
      expect(await screen.findByText(message)).toBeTruthy();
    },
  );

  it.each([true, false])(
    "ignores status responses after unmount",
    async (succeeds) => {
      let resolveResponse!: (value: {
        ok: boolean;
        json: () => Promise<unknown>;
      }) => void;
      const pending = new Promise<{
        ok: boolean;
        json: () => Promise<unknown>;
      }>((resolve) => {
        resolveResponse = resolve;
      });
      const fetchMock = vi.fn(() => pending);
      vi.stubGlobal("fetch", fetchMock);
      const { unmount } = render(<ScreenerDataSettings />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      unmount();
      resolveResponse(
        succeeds
          ? { ok: true, json: () => Promise.resolve(cleanStatus) }
          : { ok: false, json: () => Promise.resolve({}) },
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.body.textContent).toBe("");
    },
  );
  it("renders failed runs with a client-safe error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          hasSuccessfulSync: false,
          latestRun: {
            ...cleanStatus.latestRun,
            status: "FAILED",
            errorMessage: "A fonte de dados não respondeu.",
          },
        }),
      ),
    );
    render(<ScreenerDataSettings />);
    expect(await screen.findByText("Status: Falhou")).toBeTruthy();
    expect(screen.getByText("A fonte de dados não respondeu.")).toBeTruthy();
  });

  it("reports loading failures and keeps the retry action available", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "Falha temporária." }, false))
      .mockResolvedValueOnce(response({ issuers: 0 }))
      .mockResolvedValueOnce(
        response({ hasSuccessfulSync: false, latestRun: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      screen.getByText(/Os dados ainda não foram sincronizados/),
    ).toBeTruthy();
  });

  it("shows the empty history state and a generic error when sync fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ hasSuccessfulSync: false, latestRun: null }),
      )
      .mockResolvedValueOnce(
        response({ message: "A sincronização não foi concluída." }, false),
      )
      .mockResolvedValueOnce(
        response({ hasSuccessfulSync: false, latestRun: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);
    expect(
      await screen.findByText(/Os dados ainda não foram sincronizados/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    expect(
      await screen.findByText("A sincronização não foi concluída."),
    ).toBeTruthy();
  });
});
