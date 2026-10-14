// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando dashboard...</p>,
}));

vi.mock("@/app/_components/dashboard-summary", () => ({
  DashboardSummary: ({
    destinationSummary,
    destinationsUnavailable,
    destinationsLoading,
    importOpen,
    objectivesNavigation,
    onOpenReserve,
    onRetryDestinations,
    onObjectivesOpenChange,
    onObjectivesNavigationChange,
  }: {
    destinationSummary?: { knownTotal: number };
    destinationsUnavailable?: boolean;
    destinationsLoading?: boolean;
    importOpen?: boolean;
    objectivesNavigation?: { objectiveId: string | null };
    onOpenReserve?: () => void;
    onRetryDestinations?: () => void;
    onObjectivesOpenChange?: (open: boolean) => void;
    onObjectivesNavigationChange?: (
      objectiveId: string | null,
      screen?: string | null,
    ) => void;
  }) => (
    <>
      <p>Resumo do dashboard</p>
      <button type="button" onClick={onOpenReserve}>
        Ver reserva
      </button>
      <button type="button" onClick={() => onObjectivesOpenChange?.(false)}>
        Fechar objetivos
      </button>
      <button
        type="button"
        onClick={() => onObjectivesNavigationChange?.("objective-trip")}
      >
        Abrir planejamento da viagem
      </button>
      {objectivesNavigation?.objectiveId && (
        <p>Objetivo aberto no painel: {objectivesNavigation.objectiveId}</p>
      )}
      {importOpen && <p>Importação lateral aberta</p>}
      {destinationSummary && (
        <p>Total por destinos: {destinationSummary.knownTotal}</p>
      )}
      {destinationsLoading && <p>Carregando destinos</p>}
      {destinationsUnavailable && (
        <>
          <p>Destinos indisponíveis</p>
          <button type="button" onClick={onRetryDestinations}>
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

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

const overview = {
  positions: [],
  referenceRates: { selic: null, cdi: null, ipca: null },
};

const destinationSummary = {
  categories: [{ key: "reserve", value: 1250, percentage: 100 }],
  knownTotal: 1250,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
};

const objectivesOverview = { destinationSummary };

describe("DashboardClient", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    routerReplace.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("loads the portfolio overview and destination summary independently", async () => {
    const fetchMock = vi.fn((url: string) =>
      jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(await screen.findByText("Total por destinos: 1250")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio");
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio/objectives");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens the reserve in the dashboard panel without changing routes", async () => {
    const fetchMock = vi.fn((url: string) =>
      jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();
    await screen.findByText("Resumo do dashboard");
    screen.getByRole("button", { name: "Ver reserva" }).click();

    expect(
      await screen.findByText("Objetivo aberto no painel: reserve"),
    ).toBeTruthy();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("keeps dashboard panel navigation synchronized when a child changes views", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
      ),
    );

    renderDashboard();
    await screen.findByText("Resumo do dashboard");
    screen
      .getByRole("button", { name: "Abrir planejamento da viagem" })
      .click();
    expect(
      await screen.findByText("Objetivo aberto no painel: objective-trip"),
    ).toBeTruthy();

    screen.getByRole("button", { name: "Fechar objetivos" }).click();
    await waitFor(() =>
      expect(
        screen.queryByText("Objetivo aberto no painel: objective-trip"),
      ).toBeNull(),
    );
  });

  it("opens the import sheet from the dashboard deep link and clears the query", async () => {
    const fetchMock = vi.fn((url: string) =>
      jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryProvider>
        <DashboardClient openImportOnLoad />
      </QueryProvider>,
    );

    expect(await screen.findByText("Importação lateral aberta")).toBeTruthy();
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/", { scroll: false }),
    );
  });

  it("keeps the portfolio available and retries only unavailable destinations", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(overview))
      .mockImplementationOnce(() => jsonResponse({}, false))
      .mockImplementationOnce(() => jsonResponse(objectivesOverview));
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(await screen.findByText("Destinos indisponíveis")).toBeTruthy();
    screen.getByRole("button", { name: "Tentar novamente" }).click();

    expect(await screen.findByText("Total por destinos: 1250")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/portfolio/objectives");
  });

  it("announces an overview API failure and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse({ message: "Dashboard indisponível pela API." }, false),
      )
      .mockImplementationOnce(() => jsonResponse(overview))
      .mockImplementationOnce(() => jsonResponse(objectivesOverview));
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Dashboard indisponível pela API.",
    );
    screen.getByRole("button", { name: "Tentar novamente" }).click();
    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
  });

  it("uses the fixed fallback when an API payload has no safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({}, false))
        .mockImplementationOnce(() => jsonResponse(overview))
        .mockImplementationOnce(() => jsonResponse(objectivesOverview)),
    );

    renderDashboard();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar o dashboard.",
    );
  });

  it("keeps cached portfolio data visible after a later refresh fails", async () => {
    const fetchMock = vi.fn((url: string) =>
      jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
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
    screen.getByRole("button", { name: "Tentar novamente" }).click();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("redirects unauthorized sessions without looping on the login page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(overview)),
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
});
