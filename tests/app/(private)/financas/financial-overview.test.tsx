// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const state = vi.hoisted(() => ({ supportView: false, searchParams: "" }));
vi.mock("@/lib/api-client", () => ({
  apiRequest: (url: string, ...args: unknown[]) =>
    url.startsWith("/api/financial-card-settlements")
      ? Promise.resolve({ settlements: [], cardEntries: [] })
      : api.request(url, ...args),
}));
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
    if (url.startsWith("/api/financial-card-settlements"))
      return Promise.resolve({ settlements: [], cardEntries: [] });
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
  it("shows the latest observed coverage period per imported source", async () => {
    const statementCoverage = [
      {
        source: "CARD" as const,
        coverageStart: null,
        coverageEnd: null,
        importedAt: "2026-11-17T12:00:00.000Z",
      },
      {
        source: "CARD" as const,
        coverageStart: "2026-11-10",
        coverageEnd: "2026-11-10",
        importedAt: "2026-11-15T12:00:00.000Z",
      },
      {
        source: "CARD" as const,
        coverageStart: "2026-11-12",
        coverageEnd: "2026-11-12",
        importedAt: "2026-11-14T12:00:00.000Z",
      },
      {
        source: "ACCOUNT" as const,
        coverageStart: "2026-11-01",
        coverageEnd: "2026-11-30",
        importedAt: "2026-11-16T12:00:00.000Z",
      },
    ];
    const overviewWithCoverage = {
      ...overview,
      summary: { ...overview.summary, accountCashBalance: "-25.00" },
      statementCoverage,
    };
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview"))
        return Promise.resolve(overviewWithCoverage);
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();

    expect(
      (await screen.findByText(/Datas observadas nos arquivos mais recentes:/))
        .textContent,
    ).toContain("Cartão: 10/11/2026 · Conta: 01/11/2026 a 30/11/2026");
    const accountFlow = screen.getByText("Fluxo líquido das contas");
    expect(accountFlow.parentElement?.parentElement?.className).toContain(
      "border-l-status-danger",
    );
  });

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
    expect(
      api.request.mock.calls.some(
        ([url]) => url === "/api/portfolio/strategy/contribution",
      ),
    ).toBe(false);
  });

  it("refreshes finance data after a recurrence is removed", async () => {
    const user = userEvent.setup();
    let overviewReads = 0;
    api.request.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith("/api/finance-overview")) {
        overviewReads += 1;
        return Promise.resolve(overview);
      }
      if (
        url === "/api/financial-recurrences?id=recurrence-delete" &&
        options?.method === "DELETE"
      ) {
        return Promise.resolve({ action: "ended" });
      }
      if (url.startsWith("/api/financial-recurrences")) {
        return Promise.resolve({
          recurrences: [
            {
              id: "recurrence-delete",
              kind: "EXPENSE",
              description: "Internet",
              categoryId,
              amount: "120.00",
              frequency: "MONTHLY",
              firstDueDate: "2026-10-11",
              essential: false,
              active: true,
            },
          ],
          recurrenceOccurrences: [],
        });
      }
      return Promise.resolve({});
    });
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);
    await user.click(screen.getByRole("button", { name: "Recorrências" }));
    await user.click(
      await screen.findByRole("button", { name: "Excluir Internet" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir recorrência" }),
    );

    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-recurrences?id=recurrence-delete",
      expect.objectContaining({ method: "DELETE" }),
      "Não foi possível remover a recorrência.",
    );
  });

  it("keeps a positive monthly forecast focused on finance without loading strategy data", async () => {
    const positiveForecast = {
      ...overview,
      summary: {
        ...overview.summary,
        expectedIncome: "8000.00",
        realizedIncome: "8000.00",
        expectedExpenses: "6000.00",
        realizedExpenses: "6000.00",
        expectedBalance: "2000.00",
        recordedBalance: "2000.00",
        completeness: "recorded_only" as const,
      },
    };
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(positiveForecast)
        : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
    );
    renderFinance();

    expect(
      (await screen.findByText("Saldo previsto")).parentElement?.parentElement
        ?.textContent,
    ).toContain("2.000,00");
    expect(
      screen.queryByRole("heading", {
        name: "Distribuição pela estratégia",
      }),
    ).toBeNull();
    expect(
      api.request.mock.calls.some(([url]) =>
        [
          "/api/portfolio/strategy",
          "/api/portfolio/strategy/contribution",
        ].includes(String(url)),
      ),
    ).toBe(false);
  });

  it("opens a central new-entry dialog in realized mode and offers optional planning", async () => {
    const user = userEvent.setup();
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);

    await user.click(screen.getByRole("button", { name: "Lançamento" }));

    expect(
      await screen.findByRole("dialog", { name: "Novo lançamento" }),
    ).toBeTruthy();
    expect(screen.getByText("Categoria")).toBeTruthy();
    expect(screen.getByLabelText("Situação do lançamento")).toBeTruthy();
    expect(screen.queryByLabelText("Data prevista")).toBeNull();
    expect(screen.getByLabelText("Data realizada")).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", { name: "Situação do lançamento" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Registrar previsto e realizado" }),
    );
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
        return Promise.resolve({
          recurrences: [
            {
              id: "recurrence-1",
              kind: "EXPENSE",
              description: "Internet",
              categoryId,
              amount: "120.00",
              frequency: "MONTHLY",
              firstDueDate: "2026-10-11",
              essential: false,
              active: true,
            },
          ],
          recurrenceOccurrences: [],
        });
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

  it("imports a reviewed statement and refreshes the monthly finance data", async () => {
    const user = userEvent.setup();
    let overviewReads = 0;
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview")) {
        overviewReads += 1;
        return Promise.resolve(overview);
      }
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({ importedCount: 1 });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            hash: "f".repeat(64),
            headers: ["Data", "Descrição", "Valor"],
            mapping: {
              dateColumn: 0,
              descriptionColumn: 1,
              amountColumn: 2,
              dateFormat: "DMY",
              decimalSeparator: "COMMA",
            },
            rows: [
              {
                sourceRow: 2,
                kind: "EXPENSE",
                description: "Mercado",
                actualDate: "2026-11-14",
                amount: 10,
                errors: [],
                categoryId,
                categorySource: "suggested",
                possibleDuplicate: false,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);

    await user.click(screen.getByRole("button", { name: "Importar extrato" }));
    fireEvent.change(
      screen.getByLabelText("Selecionar extrato CSV, XLS ou XLSX"),
      {
        target: {
          files: [new File(["statement"], "extrato.csv", { type: "text/csv" })],
        },
      },
    );
    await screen.findAllByLabelText("Descrição da linha 2");
    await user.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );

    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-statement-import/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Importar extrato" }),
    ).toBeNull();
  });

  it("refreshes finance data after closing a past month", async () => {
    const user = userEvent.setup();
    let overviewReads = 0;
    api.request.mockImplementation((url: string) => {
      if (url.startsWith("/api/finance-overview")) {
        overviewReads += 1;
        return Promise.resolve(overview);
      }
      if (url.startsWith("/api/financial-recurrences"))
        return Promise.resolve({ recurrences: [], recurrenceOccurrences: [] });
      return Promise.resolve({});
    });
    renderFinance();
    await screen.findByText(/Ainda não há registros neste mês/);
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: "Fechar mês" }));
    await user.click(
      screen.getByRole("button", { name: "Confirmar fechamento" }),
    );

    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(3));
    expect(api.request).toHaveBeenCalledWith(
      "/api/finance-close",
      expect.objectContaining({ method: "POST" }),
      "Não foi possível fechar o mês.",
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
    await user.click(
      screen.getByRole("combobox", { name: "Situação do lançamento" }),
    );
    await user.click(screen.getByRole("option", { name: "Quero planejar" }));
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
    expect(screen.queryByRole("button", { name: "Categorias" })).toBeNull();
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

  it("opens and closes recurrence editing from the recurrence manager", async () => {
    const user = userEvent.setup();
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve(overview)
        : Promise.resolve({
            recurrences: [
              {
                id: "recurrence-1",
                kind: "EXPENSE",
                description: "Aluguel",
                categoryId,
                amount: "550.00",
                frequency: "MONTHLY",
                firstDueDate: "2026-10-10",
                essential: true,
                active: true,
              },
            ],
            recurrenceOccurrences: [],
          }),
    );
    renderFinance();

    await user.click(
      await screen.findByRole("button", { name: "Recorrências" }),
    );
    await screen.findByRole("dialog", { name: "Gerenciar recorrências" });
    await user.click(screen.getByRole("button", { name: "Editar Aluguel" }));
    expect(
      await screen.findByRole("dialog", { name: "Editar recorrência" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Editar recorrência" }),
      ).toBeNull(),
    );
  });

  it("shows realized totals and edits a saved entry", async () => {
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
        undatedRecurringRealizations: 0,
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
        return Promise.resolve({
          recurrences: [
            {
              id: "recurrence-1",
              kind: "EXPENSE",
              description: "Internet",
              categoryId,
              amount: "120.00",
              frequency: "MONTHLY",
              firstDueDate: "2026-10-11",
              essential: false,
              active: true,
            },
          ],
          recurrenceOccurrences: [],
        });
      return Promise.resolve({ categories: overview.categories });
    });
    renderFinance();

    expect(await screen.findByText("Conta de luz")).toBeTruthy();
    expect(
      screen.getByText("Resultado líquido do mês").parentElement?.textContent,
    ).toContain("não é o saldo da conta bancária");
    expect(
      screen.getByText("Entradas realizadas").parentElement?.parentElement
        ?.textContent,
    ).toContain("4.800,00");
    expect(
      screen.getByLabelText(
        "Gráfico de entradas e saídas realizadas nos últimos 12 meses",
      ),
    ).toBeTruthy();

    expect(screen.queryByRole("button", { name: "Categorias" })).toBeNull();

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
      screen.getByText("Resultado líquido do mês").parentElement?.parentElement
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
