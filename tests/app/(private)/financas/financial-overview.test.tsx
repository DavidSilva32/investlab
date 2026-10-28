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
    expect(screen.getAllByText("Sem registro").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Ainda não há dados realizados para comparar no histórico.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
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
      await screen.findByRole("dialog", { name: "Compromissos recorrentes" }),
    ).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/financial-recurrences\?month=\d{4}-\d{2}$/,
      ),
      undefined,
      "Não foi possível carregar as recorrências.",
    );
  });

  it("retries recurring data and invalidates the overview after saving a model", async () => {
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
      if (url === "/api/financial-recurrences" && options?.method === "POST")
        return Promise.resolve({});
      return Promise.resolve({});
    });
    renderFinance();
    expect(
      (await screen.findAllByRole("alert")).some((alert) =>
        alert.textContent?.includes("Falha ao carregar recorrências."),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await user.click(screen.getByRole("button", { name: "Novo" }));
    await user.type(screen.getByLabelText("Descrição"), "Salário");
    await user.type(screen.getByLabelText("Valor esperado (R$)"), "5000");
    await user.click(
      screen.getByRole("button", { name: "Adicionar recorrência" }),
    );

    await waitFor(() => expect(recurrenceAttempts).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(overviewReads).toBeGreaterThanOrEqual(2));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-recurrences",
      expect.objectContaining({ method: "POST" }),
      "Não foi possível salvar a recorrência.",
    );
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
      await screen.findByRole("dialog", { name: "Compromissos recorrentes" }),
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
});
