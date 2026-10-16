/** @vitest-environment jsdom */
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketDataSettings } from "@/app/(private)/settings/_components/market-data-settings";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: QueryClientWrapper });
const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const status = {
  latestQuote: {
    quoteObservedAt: "2026-09-24T10:02:30.000Z",
    sourceTicker: "AAA3",
  },
  latestRun: {
    status: "COMPLETED" as const,
    startedAt: "2026-09-24T10:00:00.000Z",
    completedAt: "2026-09-24T10:02:30.000Z",
    attemptedIssuers: 12,
    updatedIssuers: 5,
    unavailableIssuers: 1,
    skippedFreshIssuers: 6,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketDataSettings", () => {
  it("shows loading feedback without a manual market refresh action", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);

    expect(
      screen
        .getByRole("status", { name: "Carregando status do mercado" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: /atualizar mercado/i }),
    ).toBeNull();
  });

  it("shows market status and technical details from the read-only endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(status));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketDataSettings />);

    expect(
      await screen.findByText("Status da última execução: Concluída"),
    ).toBeTruthy();
    expect(screen.getByText(/Cotação mais recente registrada/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /atualizar mercado/i }),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/market-data", {
      cache: "no-store",
      headers: {},
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/refresh") ||
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Detalhes técnicos",
        expanded: false,
      }),
    );
    expect(screen.getByText("AAA3")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/sete dias/)).toBeTruthy();
  });

  it.each([
    [0, "hoje"],
    [1, "há 1 dia"],
  ] as const)(
    "labels a market quote from %s days ago as %s",
    async (daysAgo, label) => {
      const quoteObservedAt = new Date(
        Date.now() - daysAgo * 86_400_000,
      ).toISOString();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response({
            ...status,
            latestQuote: { ...status.latestQuote, quoteObservedAt },
          }),
        ),
      );
      render(<MarketDataSettings />);

      expect(
        await screen.findByText(new RegExp(`\\(${label}\\)`)),
      ).toBeTruthy();
    },
  );

  it("shows an empty market status when there is no quote or run", async () => {
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
    expect(
      screen.queryByRole("button", { name: /atualizar mercado/i }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Detalhes técnicos" }));
    expect(screen.getByText("—")).toBeTruthy();
  });

  it.each([
    ["RUNNING", "Em andamento"],
    ["PARTIAL", "Parcial"],
  ] as const)(
    "shows the %s status without exposing a manual action",
    async (runStatus, label) => {
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

      expect(
        await screen.findByText(`Status da última execução: ${label}`),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: /atualizar mercado/i }),
      ).toBeNull();
    },
  );

  it("shows a safe status error without exposing network details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private detail")),
    );
    render(<MarketDataSettings />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível consultar os dados de mercado."),
    ).toBeTruthy();
    expect(screen.queryByText("private detail")).toBeNull();
  });
});
