// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const state = vi.hoisted(() => ({ supportView: false, searchParams: "" }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("@/components/app-shell", () => ({
  useAdminSupportView: () => state.supportView,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.searchParams),
}));

import { FinancialOverview } from "@/app/(private)/financas/_components/financial-overview";

const categoryId = "24e0fa40-0563-4e4e-a52e-64fab0e6f79f";
const overview = {
  summary: {
    expectedIncome: null,
    realizedIncome: null,
    expectedExpenses: null,
    realizedExpenses: null,
    expectedBalance: null,
    recordedBalance: null,
    undatedRecurringRealizations: 0,
    completeness: "no_data" as const,
  },
  entries: [],
  recurringOccurrences: [],
  history: {
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, "0")}`,
      expectedIncome: null,
      realizedIncome: null,
      expectedExpenses: null,
      realizedExpenses: null,
      recordedBalance: null,
      completeness: "recorded_only" as const,
    })),
    completeness: "recorded_only" as const,
    explanation: "Histórico de registros salvos.",
  },
  categories: [
    { id: categoryId, kind: "EXPENSE" as const, name: "Moradia", active: true },
  ],
};
const positiveForecast = {
  ...overview,
  summary: {
    ...overview.summary,
    expectedIncome: "8000.00",
    expectedExpenses: "6000.00",
    expectedBalance: "2000.00",
    completeness: "recorded_only" as const,
  },
};
const activeStrategy = {
  allocationActive: true,
  savedAllocationPercentages: {
    fixed_income: 60,
    brazilian_equities: 20,
    international_etfs: 10,
    fiis: 10,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderFinance() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinancialOverview />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.request.mockImplementation((url: string) => {
    if (url.startsWith("/api/finance-overview"))
      return Promise.resolve(overview);
    if (url.startsWith("/api/financial-recurrences"))
      return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
    return Promise.resolve({});
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.supportView = false;
  state.searchParams = "";
});

describe("FinancialOverview", () => {
  it("shows missing recorded values as unavailable instead of zero", async () => {
    renderFinance();

    expect(
      await screen.findByText(/Ainda não há registros neste mês/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Distribuição pela estratégia",
      }),
    ).toBeNull();
    expect(screen.getAllByText("Sem registro").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
    expect(
      api.request.mock.calls.some(([url]) => url === "/api/portfolio/strategy"),
    ).toBe(false);
  });

  it("automatically simulates a positive forecast with the active saved strategy without saving an aporte", async () => {
    const forecast = {
      ...overview,
      summary: {
        ...overview.summary,
        expectedIncome: "8000.00",
        expectedExpenses: "6000.00",
        expectedBalance: "2000.00",
        completeness: "recorded_only" as const,
      },
    };
    const strategy = {
      allocationActive: true,
      savedAllocationPercentages: {
        fixed_income: 60,
        brazilian_equities: 20,
        international_etfs: 10,
        fiis: 10,
      },
    };
    const simulation = {
      reserveContributionCents: "0",
      strategyContributionCents: "200000",
      reserveStatus: "not_needed",
      simulation: {
        allocations: [
          {
            label: "Renda fixa",
            contributionValueCents: "200000",
          },
          {
            label: "Ações e BDRs",
            contributionValueCents: "0",
          },
        ],
        unallocatedContributionCents: "0",
        completeness: { complete: true },
      },
    };
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(forecast);
      if (url === "/api/portfolio/strategy") return Promise.resolve(strategy);
      if (
        url === "/api/portfolio/strategy/contribution" &&
        options?.method === "POST"
      )
        return Promise.resolve(simulation);
      return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
    });

    renderFinance();

    expect(
      await screen.findByText("Simulação pela sua estratégia"),
    ).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith(
      "/api/portfolio/strategy/contribution",
      {
        method: "POST",
        body: JSON.stringify({
          contributionAmount: 2000,
          allocationPercentages: strategy.savedAllocationPercentages,
        }),
      },
      "Não foi possível calcular a simulação.",
    );
    expect(
      api.request.mock.calls.some(
        ([url]) =>
          url === "/api/financial-entries" ||
          url === "/api/portfolio/positions/manual",
      ),
    ).toBe(false);
  });

  it("does not request a current-portfolio simulation for a past month", async () => {
    const user = userEvent.setup();
    const pastSimulation = {
      reserveContributionCents: "0",
      strategyContributionCents: "200000",
      reserveStatus: "not_needed",
      simulation: {
        allocations: [
          { label: "Renda fixa", contributionValueCents: "200000" },
        ],
        unallocatedContributionCents: "0",
        completeness: { complete: true },
      },
    };
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy")
        return Promise.resolve(activeStrategy);
      if (
        url === "/api/portfolio/strategy/contribution" &&
        options?.method === "POST"
      )
        return Promise.resolve(pastSimulation);
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();
    expect(
      await screen.findByText("Simulação pela sua estratégia"),
    ).toBeTruthy();

    const simulationsBeforePastMonth = api.request.mock.calls.filter(
      ([url]) => url === "/api/portfolio/strategy/contribution",
    ).length;
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(
      await screen.findByText(/Meses passados não recebem simulação/u),
    ).toBeTruthy();
    expect(
      api.request.mock.calls.filter(
        ([url]) => url === "/api/portfolio/strategy/contribution",
      ),
    ).toHaveLength(simulationsBeforePastMonth);
  });

  it("shows a loading state while the active strategy is being fetched", async () => {
    const strategyRequest = deferred<{
      allocationActive: boolean;
      savedAllocationPercentages:
        typeof activeStrategy.savedAllocationPercentages | null;
    }>();
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy") return strategyRequest.promise;
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect((await screen.findByRole("status")).textContent).toContain(
      "Calculando uma simulação pela sua estratégia",
    );

    strategyRequest.resolve({
      allocationActive: false,
      savedAllocationPercentages: null,
    });
    expect(
      await screen.findByText(/Ative sua estratégia de longo prazo/u),
    ).toBeTruthy();
  });

  it("shows a safe message when loading the strategy fails", async () => {
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy")
        return Promise.reject(new Error("internal strategy detail"));
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect(
      await screen.findByText("Não foi possível calcular a simulação agora."),
    ).toBeTruthy();
    expect(screen.queryByText("internal strategy detail")).toBeNull();
  });

  it("shows a loading state while the contribution simulation is running", async () => {
    const simulationRequest = deferred<unknown>();
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy")
        return Promise.resolve(activeStrategy);
      if (
        url === "/api/portfolio/strategy/contribution" &&
        options?.method === "POST"
      )
        return simulationRequest.promise;
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect((await screen.findByRole("status")).textContent).toContain(
      "Calculando uma simulação pela sua estratégia",
    );

    simulationRequest.resolve({
      reserveContributionCents: "200000",
      strategyContributionCents: "0",
      reserveStatus: "applied",
      simulation: null,
    });
    expect(
      await screen.findByText(/Simulação pela prioridade da Reserva/u),
    ).toBeTruthy();
  });

  it("shows a safe message when the contribution simulation fails", async () => {
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy")
        return Promise.resolve(activeStrategy);
      if (
        url === "/api/portfolio/strategy/contribution" &&
        options?.method === "POST"
      )
        return Promise.reject(new Error("internal simulation detail"));
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect(
      await screen.findByText("Não foi possível calcular a simulação agora."),
    ).toBeTruthy();
    expect(screen.queryByText("internal simulation detail")).toBeNull();
  });

  it("keeps the strategy panel safe when the simulation response has no payload", async () => {
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(positiveForecast);
      if (url === "/api/portfolio/strategy")
        return Promise.resolve(activeStrategy);
      if (
        url === "/api/portfolio/strategy/contribution" &&
        options?.method === "POST"
      )
        return Promise.resolve(null);
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect(
      await screen.findByText("Não foi possível calcular a simulação agora."),
    ).toBeTruthy();
  });

  it.each([
    {
      name: "incomplete reserve inputs",
      response: {
        reserveContributionCents: null,
        strategyContributionCents: null,
        reserveStatus: "incomplete",
        simulation: null,
      },
      expected: /faltam dados para aplicar a prioridade atual da Reserva/u,
    },
    {
      name: "incomplete long-term positions",
      response: {
        reserveContributionCents: "0",
        strategyContributionCents: "200000",
        reserveStatus: "not_needed",
        simulation: {
          allocations: [],
          unallocatedContributionCents: "200000",
          completeness: { complete: false },
        },
      },
      expected: /posições de Longo Prazo com valor e classificação completos/u,
    },
    {
      name: "a reserve-only allocation",
      response: {
        reserveContributionCents: "200000",
        strategyContributionCents: "0",
        reserveStatus: "applied",
        simulation: null,
      },
      expected: /Simulação pela prioridade da Reserva/u,
    },
    {
      name: "an amount left unallocated by the strategy",
      response: {
        reserveContributionCents: "0",
        strategyContributionCents: "200000",
        reserveStatus: "not_needed",
        simulation: {
          allocations: [{ label: "Renda fixa", contributionValueCents: "0" }],
          unallocatedContributionCents: "200000",
          completeness: { complete: true },
        },
      },
      expected: /deixa R\$\s*2\.000,00 sem alocação/u,
    },
  ])(
    "explains $name from the existing simulation response",
    async ({ response, expected }) => {
      api.request.mockImplementation((url: string, options?: RequestInit) => {
        if (url.startsWith("/api/finance-overview"))
          return Promise.resolve(positiveForecast);
        if (url === "/api/portfolio/strategy")
          return Promise.resolve(activeStrategy);
        if (
          url === "/api/portfolio/strategy/contribution" &&
          options?.method === "POST"
        )
          return Promise.resolve(response);
        if (url.startsWith("/api/financial-recurrences"))
          return Promise.resolve({
            recurrences: [],
            recurrenceOccurrences: [],
          });
        return Promise.resolve({});
      });
      renderFinance();

      expect(await screen.findByText(expected)).toBeTruthy();
    },
  );

  it("does not simulate negative forecasts", async () => {
    const forecast = {
      ...overview,
      summary: {
        ...overview.summary,
        expectedIncome: "1000.00",
        expectedExpenses: "1200.00",
        expectedBalance: "-200.00",
        completeness: "recorded_only" as const,
      },
    };
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(forecast)
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(
      await screen.findByText(/não há saldo para simular uma distribuição/u),
    ).toBeTruthy();
    expect(
      api.request.mock.calls.some(([url]) => url === "/api/portfolio/strategy"),
    ).toBe(false);
  });

  it("does not simulate a monthly balance when a side of the forecast is missing", async () => {
    const partialForecast = {
      ...overview,
      summary: {
        ...overview.summary,
        expectedIncome: null,
        expectedExpenses: "1200.00",
        expectedBalance: null,
        completeness: "recorded_only" as const,
      },
    };
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(partialForecast)
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(await screen.findByText(/não são tratados como zero/u)).toBeTruthy();
    expect(
      api.request.mock.calls.some(([url]) => url === "/api/portfolio/strategy"),
    ).toBe(false);
  });

  it("opens a central new-entry dialog with category and paired expected/actual dates", async () => {
    const user = userEvent.setup();
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);

    await user.click(screen.getByRole("button", { name: "Lançamento" }));

    expect(
      await screen.findByRole("dialog", { name: "Novo lançamento" }),
    ).toBeTruthy();
    expect(screen.getByText("Categoria")).toBeTruthy();
    expect(screen.getByText("Previsto")).toBeTruthy();
    expect(screen.getByText("Realizado")).toBeTruthy();
    expect(screen.getByLabelText("Data prevista")).toBeTruthy();
    expect(screen.getByLabelText("Data realizada")).toBeTruthy();
  });

  it("saves an entry and invalidates the monthly overview", async () => {
    const user = userEvent.setup();
    let overviewReads = 0;
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview")) {
        overviewReads += 1;
        return Promise.resolve(overview);
      }
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      if (url === "/api/financial-entries" && options?.method === "POST")
        return Promise.resolve({});
      return Promise.resolve({});
    });
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);

    await user.click(screen.getByRole("button", { name: "Lançamento" }));
    await user.type(screen.getByLabelText("Descrição"), "Conta de luz");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    const actualAmount = screen.getByLabelText("Valor (R$)", {
      selector: "#actual-amount",
    }) as HTMLInputElement;
    await user.type(actualAmount, "20000");
    expect(actualAmount.value).toBe("R$ 200,00");
    await user.type(screen.getByLabelText("Data realizada"), "10/10/2026");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-entries",
      expect.objectContaining({ method: "POST" }),
      "Não foi possível salvar o lançamento.",
    );
    const postCall = api.request.mock.calls.find(
      ([url, options]) =>
        url === "/api/financial-entries" && options?.method === "POST",
    );
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      description: "Conta de luz",
      categoryId,
      actualAmount: 200,
      actualDate: "2026-10-10",
    });
  });

  it("shows the API error and retries the overview request", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview")) {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("Falha ao carregar o fluxo."))
          : Promise.resolve(overview);
      }
      return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
    });
    renderFinance();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao carregar o fluxo.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByText(/Ainda não há registros neste mês/),
    ).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("uses a client-safe fallback when the overview rejects without an Error", async () => {
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.reject("offline")
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(
      await screen.findByText("Não foi possível carregar o fluxo financeiro."),
    ).toBeTruthy();
  });

  it("tolerates optional entry and history collections missing from a response", async () => {
    const incomplete = {
      ...overview,
      entries: undefined,
      recurringOccurrences: undefined,
      history: {
        ...overview.history,
        months: undefined,
        explanation: undefined,
      },
    };
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(incomplete)
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(
      await screen.findByText("Nenhum lançamento ou vencimento neste mês."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
  });

  it("loads the selected month and opens recurring management on demand", async () => {
    const user = userEvent.setup();
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);

    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/finance-overview\?month=\d{4}-\d{2}$/),
        undefined,
        "Não foi possível carregar o fluxo financeiro.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));

    await user.click(screen.getByRole("button", { name: "Recorrências" }));
    expect(
      await screen.findByRole("dialog", { name: "Gerenciar recorrências" }),
    ).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/financial-recurrences\?month=\d{4}-\d{2}$/,
      ),
      undefined,
      "Não foi possível carregar as recorrências.",
    );
  });

  it("retries recurring data and creates a model from a launch", async () => {
    const user = userEvent.setup();
    state.searchParams = "gerenciar=recorrencias";
    let recurrenceAttempts = 0;
    let overviewReads = 0;
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview")) {
        overviewReads += 1;
        return Promise.resolve(overview);
      }
      if (url.startsWith("/api/financial-recurrences?")) {
        recurrenceAttempts += 1;
        return recurrenceAttempts === 1
          ? Promise.reject(new Error("Falha ao carregar recorrências."))
          : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      }
      return Promise.resolve({});
    });
    renderFinance();
    expect(
      (await screen.findAllByRole("alert")).some((alert) =>
        alert.textContent?.includes("Falha ao carregar recorrências."),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText(
        "Nenhuma recorrência cadastrada. Ative a opção de recorrência ao criar um lançamento.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Lançamento" }));
    await user.type(screen.getByLabelText("Descrição"), "Aluguel");
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    await user.click(await screen.findByRole("option", { name: "Moradia" }));
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#expected-amount" }),
      "500000",
    );
    await user.type(screen.getByLabelText("Data prevista"), "10/10/2026");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Criar recorrência para este lançamento",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    await waitFor(() => expect(recurrenceAttempts).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-entries",
      expect.objectContaining({ method: "POST" }),
      "Não foi possível salvar o lançamento.",
    );
    const postCall = api.request.mock.calls.find(
      ([url, options]) =>
        url === "/api/financial-entries" && options?.method === "POST",
    );
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      description: "Aluguel",
      categoryId,
      recurrence: {
        frequency: "MONTHLY",
        firstDueDate: "2026-11-10",
        essential: false,
      },
    });
  });

  it("opens recurring management from its route query and keeps support view read-only", async () => {
    state.supportView = true;
    state.searchParams = "gerenciar=recorrencias";
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(overview)
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(
      await screen.findByRole("dialog", { name: "Gerenciar recorrências" }),
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen
        .getByRole("button", { name: "Categorias" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Recorrências" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Lançamento" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
  });

  it("shows recorded totals, undated occurrence guidance, categories, and edits a saved entry", async () => {
    const user = userEvent.setup();
    const populated = {
      ...overview,
      summary: {
        expectedIncome: "5000.00",
        realizedIncome: "4800.00",
        expectedExpenses: "1800.00",
        realizedExpenses: "1700.00",
        expectedBalance: "3200.00",
        recordedBalance: "3100.00",
        undatedRecurringRealizations: 1,
        completeness: "recorded_only" as const,
      },
      entries: [
        {
          id: "entry-1",
          kind: "EXPENSE" as const,
          description: "Conta de luz",
          categoryId,
          categoryName: "Moradia",
          expectedAmount: "180.00",
          expectedDate: "2026-10-10",
          actualAmount: null,
          actualDate: null,
        },
      ],
      recurringOccurrences: [
        {
          id: "recurrence-1:2026-10-11",
          recurrenceId: "recurrence-1",
          kind: "EXPENSE" as const,
          description: "Internet",
          category: "Serviços",
          essential: false,
          dueDate: "2026-10-11",
          expectedAmount: "120.00",
          actualAmount: "120.00",
          actualDate: null,
          status: "realized" as const,
        },
      ],
      history: {
        ...overview.history,
        months: overview.history.months.map((item, index) =>
          index === 9
            ? {
                ...item,
                realizedIncome: "4800.00",
                realizedExpenses: "1700.00",
                recordedBalance: "3100.00",
              }
            : item,
        ),
      },
    };
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(populated);
      if (url === "/api/financial-entries" && options?.method === "PATCH")
        return Promise.resolve({});
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({ categories: overview.categories });
    });
    renderFinance();

    expect(await screen.findByText("Conta de luz")).toBeTruthy();
    expect(
      screen.getByText(/1 ocorrência\(s\) realizada\(s\) sem data/),
    ).toBeTruthy();
    expect(
      screen.getByText("Entradas realizadas").parentElement?.parentElement
        ?.textContent,
    ).toContain("4.800,00");
    expect(
      screen.getByLabelText(
        "Gráfico de entradas e saídas realizadas nos últimos 12 meses",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Categorias" }));
    expect(
      await screen.findByRole("dialog", { name: "Gerenciar categorias" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    await user.click(
      screen.getByRole("button", { name: "Ações para Conta de luz" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Editar/ }));
    expect(
      await screen.findByRole("dialog", { name: "Editar lançamento" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("dialog", { name: "Editar lançamento" }),
    ).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Lançamento" })[0]);
    expect(
      await screen.findByRole("dialog", { name: "Novo lançamento" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(
      screen.getByRole("button", { name: "Ações para Conta de luz" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Editar/ }));
    expect(
      await screen.findByRole("dialog", { name: "Editar lançamento" }),
    ).toBeTruthy();
    const description = screen.getByLabelText("Descrição") as HTMLInputElement;
    await user.clear(description);
    await user.type(description, "Energia elétrica");
    await user.click(screen.getByRole("button", { name: "Salvar lançamento" }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-entries",
        expect.objectContaining({ method: "PATCH" }),
        "Não foi possível salvar o lançamento.",
      ),
    );
  }, 10_000);

  it("marks negative balances and refreshes the overview after deleting an entry", async () => {
    const user = userEvent.setup();
    const populated = {
      ...overview,
      summary: {
        ...overview.summary,
        expectedBalance: "-200.00",
        recordedBalance: "-100.00",
      },
      entries: [
        {
          id: "entry-delete",
          kind: "EXPENSE" as const,
          description: "Conta de teste",
          categoryId,
          categoryName: "Moradia",
          expectedAmount: "100.00",
          expectedDate: "2026-10-10",
          actualAmount: null,
          actualDate: null,
        },
      ],
    };
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(populated);
      if (
        url === "/api/financial-entries?id=entry-delete" &&
        options?.method === "DELETE"
      )
        return Promise.resolve({});
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({ categories: overview.categories });
    });
    renderFinance();

    await screen.findByText("Conta de teste");
    expect(
      screen.getByText("Saldo previsto").parentElement?.parentElement
        ?.className,
    ).toContain("text-status-danger");
    expect(
      screen.getByText("Saldo realizado").parentElement?.parentElement
        ?.className,
    ).toContain("text-status-danger");

    await user.click(
      screen.getByRole("button", { name: "Ações para Conta de teste" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() =>
      expect(
        api.request.mock.calls.filter(([url]) =>
          String(url).startsWith("/api/finance-overview"),
        ).length,
      ).toBeGreaterThan(1),
    );
  });
});
