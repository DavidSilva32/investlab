// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  supportView: false as boolean | null | "error",
}));

vi.mock("@/components/app-page-skeleton", () => ({
  AppContentSkeleton: () => <p>Carregando dashboard...</p>,
}));

vi.mock("@/app/(private)/_components/dashboard-summary", () => ({
  DashboardSummary: ({
    destinationSummary,
    longTermMissingPositionCount,
    destinationsUnavailable,
    destinationsLoading,
    importOpen,
    objectivesNavigation,
    onOpenReserve,
    onRetryDestinations,
    onObjectivesOpenChange,
    onObjectivesNavigationChange,
    supportReadOnly,
    supportChecking,
    supportCheckError,
    onImportOpenChange,
    configuredObjectivesCount,
    manualPositions,
  }: {
    destinationSummary?: { knownTotal: number };
    longTermMissingPositionCount?: number;
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
    supportReadOnly?: boolean;
    supportChecking?: boolean;
    supportCheckError?: boolean;
    onImportOpenChange?: (open: boolean) => void;
    configuredObjectivesCount?: number;
    manualPositions?: unknown[];
  }) => (
    <>
      <p>Resumo do dashboard</p>
      {supportReadOnly && <p>Dashboard em modo somente leitura</p>}
      {supportChecking && <p>Contexto de suporte pendente</p>}
      {!supportReadOnly && !supportChecking && !supportCheckError && (
        <button type="button">Adicionar posição</button>
      )}
      <p>Objetivos configurados: {configuredObjectivesCount ?? 0}</p>
      <p>Posições visíveis: {manualPositions?.length ?? 0}</p>
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
      {!importOpen ? (
        <button type="button" onClick={() => onImportOpenChange?.(true)}>
          Abrir importação
        </button>
      ) : (
        <button type="button" onClick={() => onImportOpenChange?.(false)}>
          Fechar importação
        </button>
      )}
      {destinationSummary && (
        <p>Total por destinos: {destinationSummary.knownTotal}</p>
      )}
      <p>Posições de longo prazo ausentes: {longTermMissingPositionCount}</p>
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

import { DashboardClient } from "@/app/(private)/_components/dashboard-client";
import { QueryProvider } from "@/components/query-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock("@/components/app-shell", () => ({
  useAdminSupportView: () => mocks.supportView,
}));

function renderDashboard(openImportOnLoad = false) {
  return render(
    <QueryProvider>
      <DashboardClient openImportOnLoad={openImportOnLoad} />
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
    mocks.routerReplace.mockReset();
    mocks.supportView = false;
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

  it("passes support mode to the empty dashboard so onboarding stays read only", async () => {
    mocks.supportView = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
      ),
    );

    renderDashboard();

    expect(
      await screen.findByText("Dashboard em modo somente leitura"),
    ).toBeTruthy();
  });

  it("fails closed while support status is unresolved and only opens deep-linked import for the account owner", async () => {
    mocks.supportView = null;
    const overviewWithPosition = {
      ...overview,
      positions: [
        {
          id: "position-1",
          product: "CDB",
          assetCode: null,
          institution: null,
          indexer: null,
          issuedAt: null,
          maturityAt: null,
          quantity: "1",
          totalValue: "100",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(
          url === "/api/portfolio" ? overviewWithPosition : objectivesOverview,
        ),
      ),
    );

    const dashboard = renderDashboard(true);
    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(screen.getByText("Contexto de suporte pendente")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Verificando o modo de visualização",
    );
    expect(screen.getByText("Posições visíveis: 1")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Adicionar posição" }),
    ).toBeNull();
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();

    mocks.supportView = true;
    dashboard.rerender(
      <QueryProvider>
        <DashboardClient openImportOnLoad />
      </QueryProvider>,
    );
    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(screen.getByText("Dashboard em modo somente leitura")).toBeTruthy();
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();

    mocks.supportView = false;
    dashboard.rerender(
      <QueryProvider>
        <DashboardClient openImportOnLoad />
      </QueryProvider>,
    );
    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(screen.queryByText("Dashboard em modo somente leitura")).toBeNull();
    expect(await screen.findByText("Importação lateral aberta")).toBeTruthy();
  });

  it("keeps dashboard data visible and actions gated after support status fails", async () => {
    mocks.supportView = "error";
    const overviewWithPosition = {
      ...overview,
      positions: [
        {
          id: "position-1",
          product: "CDB",
          assetCode: null,
          institution: null,
          indexer: null,
          issuedAt: null,
          maturityAt: null,
          quantity: "1",
          totalValue: "100",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(
          url === "/api/portfolio" ? overviewWithPosition : objectivesOverview,
        ),
      ),
    );
    renderDashboard(true);

    expect(await screen.findByText("Resumo do dashboard")).toBeTruthy();
    expect(screen.getByText("Posições visíveis: 1")).toBeTruthy();
    expect(
      screen.queryByText("Falha recuperável no contexto de suporte"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adicionar posição" }),
    ).toBeNull();
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente o contexto" }),
    ).toBeNull();
  });

  it("counts only missing long-term objective positions for the dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(
          url === "/api/portfolio"
            ? overview
            : {
                ...objectivesOverview,
                objectives: [
                  {
                    purpose: "LONG_TERM_INVESTMENT",
                    missingPositionCount: 2,
                  },
                  { purpose: "PERSONAL_GOAL", missingPositionCount: 5 },
                  { purpose: "LONG_TERM_INVESTMENT" },
                ],
              },
        ),
      ),
    );

    renderDashboard();

    expect(
      await screen.findByText("Posições de longo prazo ausentes: 2"),
    ).toBeTruthy();
    expect(await screen.findByText("Objetivos configurados: 3")).toBeTruthy();
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
    expect(mocks.routerReplace).not.toHaveBeenCalled();
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
      expect(mocks.routerReplace).toHaveBeenCalledWith("/", { scroll: false }),
    );
  });

  it("keeps a dismissed deep-linked import closed after rerender", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
      ),
    );
    const dashboard = renderDashboard(true);

    expect(await screen.findByText("Importação lateral aberta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar importação" }));
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();

    dashboard.rerender(
      <QueryProvider>
        <DashboardClient openImportOnLoad />
      </QueryProvider>,
    );
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();
  });

  it("opens and closes the import sheet from dashboard quick actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        jsonResponse(url === "/api/portfolio" ? overview : objectivesOverview),
      ),
    );
    renderDashboard();
    await screen.findByText("Resumo do dashboard");

    fireEvent.click(screen.getByRole("button", { name: "Abrir importação" }));
    expect(screen.getByText("Importação lateral aberta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar importação" }));
    expect(screen.queryByText("Importação lateral aberta")).toBeNull();
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
    expect(mocks.routerReplace).toHaveBeenCalledWith("/entrar");

    mocks.routerReplace.mockClear();
    window.history.replaceState(null, "", "/entrar");
    window.dispatchEvent(new Event("auth:unauthorized"));
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
});
