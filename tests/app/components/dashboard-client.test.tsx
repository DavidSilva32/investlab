// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const routerReplace = vi.hoisted(() => vi.fn());
vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando dashboard...</p>,
}));
vi.mock("@/app/_components/dashboard-summary", () => ({
  DashboardSummary: ({
    unassignedSummary,
    onRetryUnassigned,
  }: {
    unassignedSummary: { status: string } | null;
    onRetryUnassigned: () => void;
  }) => (
    <>
      <p>Resumo do dashboard</p>
      {unassignedSummary?.status === "loaded" && (
        <p>Resumo sem destino disponível</p>
      )}
      {unassignedSummary?.status === "unavailable" && (
        <>
          <p>Patrimônio sem destino indisponível</p>
          <button type="button" onClick={onRetryUnassigned}>
            Tentar novamente
          </button>
        </>
      )}
    </>
  ),
}));

import { DashboardClient } from "@/app/_components/dashboard-client";
import { QueryProvider } from "@/components/query-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

function renderDashboard() {
  return render(
    <QueryProvider>
      <DashboardClient />
    </QueryProvider>,
  );
}

const overview = {
  positions: [],
  referenceRates: { selic: null, cdi: null },
};
const objectivesOverview = {
  unassignedKnownValue: 1250,
  unassignedPositionCount: 2,
  unassignedUnvaluedPositionCount: 1,
};

describe("DashboardClient", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    routerReplace.mockReset();
  });

  it("loads known unassigned wealth from the objectives API", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url === "/api/portfolio" ? overview : objectivesOverview,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(
      screen.queryByText("Visão geral do patrimônio e próximos passos"),
    ).toBeNull();
    expect(
      await screen.findByText("Resumo sem destino disponível"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio");
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio/objectives");
  });

  it("announces an initial API failure and allows a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Dashboard indisponível pela API." }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => objectivesOverview,
      });
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Dashboard indisponível pela API.",
    );
    await screen
      .findByRole("button", { name: "Tentar novamente" })
      .then((button) => button.click());

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
  });

  it("uses the fixed inline fallback when an API payload has no message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => objectivesOverview,
      });
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
    await screen
      .findByRole("button", { name: "Tentar novamente" })
      .then((button) => button.click());
    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
  });

  it("keeps the loaded dashboard visible when a later refresh fails", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/portfolio"
        ? Promise.resolve({ ok: true, json: async () => overview })
        : Promise.resolve({ ok: true, json: async () => objectivesOverview }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();
    await screen.findByText("Resumo do dashboard");

    fetchMock.mockRejectedValueOnce(new Error("private transport detail"));
    window.dispatchEvent(new Event("portfolio:updated"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
    expect(screen.queryByText("private transport detail")).toBeNull();
    expect(screen.getByText("Resumo do dashboard")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
    screen.getByRole("button", { name: "Tentar novamente" }).click();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shows a safe API message when a later dashboard refresh fails", async () => {
    const fetchMock = vi.fn(
      (url: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> =>
        url === "/api/portfolio"
          ? Promise.resolve({ ok: true, json: async () => overview })
          : Promise.resolve({ ok: true, json: async () => objectivesOverview }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();
    await screen.findByText("Resumo do dashboard");
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ message: "Atualização recusada pela API." }),
      }),
    );
    window.dispatchEvent(new Event("portfolio:updated"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Atualização recusada pela API.",
    );
    expect(screen.getByText("Resumo do dashboard")).toBeTruthy();
  });

  it("hides unassigned wealth when the objectives endpoint is unavailable", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "/api/portfolio"
          ? { ok: true, json: async () => overview }
          : { ok: false, json: async () => ({}) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(
      await screen.findByText("Patrimônio sem destino indisponível"),
    ).toBeTruthy();
    expect(screen.queryByText("Resumo sem destino disponível")).toBeNull();
  });

  it("retries only the destination summary on request", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/portfolio"
        ? Promise.resolve({ ok: true, json: async () => overview })
        : Promise.resolve({ ok: false, json: async () => ({}) }),
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => overview }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();
    expect(
      await screen.findByText("Patrimônio sem destino indisponível"),
    ).toBeTruthy();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => objectivesOverview }),
    );
    await screen
      .findByRole("button", { name: "Tentar novamente" })
      .then((button) => button.click());

    expect(
      await screen.findByText("Resumo sem destino disponível"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/portfolio/objectives");
  });

  it("redirects an unauthorized session to login but avoids a login loop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => overview }),
    );
    renderDashboard();
    await screen.findByText("Resumo do dashboard");

    window.dispatchEvent(new Event("auth:unauthorized"));
    expect(routerReplace).toHaveBeenCalledWith("/login");

    routerReplace.mockClear();
    window.history.replaceState(null, "", "/login");
    window.dispatchEvent(new Event("auth:unauthorized"));
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it.each([
    { ...objectivesOverview, unassignedKnownValue: Number.NaN },
    { ...objectivesOverview, unassignedPositionCount: 2.5 },
    { ...objectivesOverview, unassignedUnvaluedPositionCount: 1.5 },
  ])(
    "does not treat an invalid objectives summary as a zero value",
    async (summary) => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          Promise.resolve({
            ok: true,
            json: async () => (url === "/api/portfolio" ? overview : summary),
          }),
        ),
      );

      renderDashboard();

      expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
      expect(
        await screen.findByText("Patrimônio sem destino indisponível"),
      ).toBeTruthy();
    },
  );
});
