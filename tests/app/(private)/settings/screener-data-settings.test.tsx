/** @vitest-environment jsdom */
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenerDataSettings } from "@/app/(private)/settings/_components/screener-data-settings";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: QueryClientWrapper });
const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });
const cleanStatus = {
  hasSuccessfulSync: true,
  lastSuccessfulCompletedAt: "2026-09-24T10:02:30.000Z",
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
  it("shows a loading state without offering a manual synchronization", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);

    expect(
      screen
        .getByRole("status", {
          name: "Carregando status da base de empresas",
        })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: /sincronizar agora/i }),
    ).toBeNull();
  });

  it("shows status and technical run details from the read-only endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(cleanStatus));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScreenerDataSettings />);

    expect(await screen.findByText("Status: Concluída")).toBeTruthy();
    expect(screen.getByText(/Última atualização concluída/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /sincronizar agora/i }),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/screener", {
      cache: "no-store",
      headers: {},
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/sync") ||
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Detalhes técnicos",
        expanded: false,
      }),
    );
    expect(screen.getByText("520")).toBeTruthy();
    expect(screen.getByText("8.000")).toBeTruthy();
    expect(screen.getByText("2 min 30 s")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Calendário de entrega da CVM/ }),
    ).toBeTruthy();
  });

  it.each([
    [0, "hoje"],
    [1, "há 1 dia"],
  ] as const)(
    "labels a successful synchronization from %s days ago as %s",
    async (daysAgo, label) => {
      const completedAt = new Date(
        Date.now() - daysAgo * 86_400_000,
      ).toISOString();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response({
            ...cleanStatus,
            lastSuccessfulCompletedAt: completedAt,
            latestRun: { ...cleanStatus.latestRun, completedAt },
          }),
        ),
      );
      render(<ScreenerDataSettings />);

      expect(
        await screen.findByText(new RegExp(`\\(${label}\\)`)),
      ).toBeTruthy();
    },
  );

  it("shows the running state and missing counters", async () => {
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
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Detalhes técnicos" }));
    expect(screen.getByText("12 s")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("shows failed run details and an empty history state", async () => {
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
    const user = userEvent.setup();
    render(<ScreenerDataSettings />);
    expect(await screen.findByText("Status: Falhou")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Detalhes técnicos" }));
    expect(screen.getByText("A fonte de dados não respondeu.")).toBeTruthy();
  });

  it("shows an empty history state when no run exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ hasSuccessfulSync: false, latestRun: null }),
        ),
    );
    render(<ScreenerDataSettings />);
    expect(
      await screen.findByText(
        /A primeira carga será feita pela execução semanal agendada/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /sincronizar agora/i }),
    ).toBeNull();
  });

  it("shows a safe status error when the read-only endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private detail")),
    );
    render(<ScreenerDataSettings />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível consultar o status da sincronização."),
    ).toBeTruthy();
    expect(screen.queryByText("private detail")).toBeNull();
  });
});
