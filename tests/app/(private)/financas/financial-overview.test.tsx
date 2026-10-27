// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("@/components/app-shell", () => ({
  useAdminSupportView: () => false,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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
    await user.type(
      screen.getByLabelText("Valor (R$)", { selector: "#actual-amount" }),
      "200",
    );
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
});
