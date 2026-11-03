// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("@/components/app-shell", () => ({ useAdminSupportView: () => false }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(private)/financas/_components/financial-entry-dialog", () => ({
  FinancialEntryDialog: ({
    open,
    onOpenChange,
    entry,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entry: { description: string } | null;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label={entry ? "Editar lançamento" : "Novo lançamento"}
      >
        <span>{entry?.description ?? "Novo lançamento"}</span>
        <button onClick={() => onOpenChange(true)}>
          Notificar diálogo aberto
        </button>
        <button onClick={() => onOpenChange(false)}>Fechar lançamento</button>
      </div>
    ) : null,
}));

vi.mock(
  "@/app/(private)/financas/_components/financial-recurrences-sheet",
  () => ({
    FinancialRecurrencesSheet: ({
      open,
      onOpenChange,
      editRecurrenceId,
      onEditRecurrenceHandled,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      editRecurrenceId?: string | null;
      onEditRecurrenceHandled?: () => void;
    }) =>
      open ? (
        <div role="dialog" aria-label="Editar recorrência">
          <input aria-label="Descrição" value="Aluguel" readOnly />
          <span>{editRecurrenceId ?? "no-pending-edit"}</span>
          <button onClick={() => onOpenChange(true)}>
            Confirmar abertura da recorrência
          </button>
          <button onClick={onEditRecurrenceHandled}>
            Consumir pedido de edição
          </button>
        </div>
      ) : null,
  }),
);

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
  entries: [
    {
      id: "entry-1",
      kind: "EXPENSE" as const,
      description: "Aluguel",
      categoryId,
      categoryName: "Moradia",
      expectedAmount: "550.00",
      expectedDate: "2026-10-10",
      actualAmount: null,
      actualDate: null,
    },
  ],
  recurringOccurrences: [],
  history: {
    months: [],
    completeness: "recorded_only" as const,
    explanation: "Sem registros no período.",
  },
  categories: [
    { id: categoryId, kind: "EXPENSE" as const, name: "Moradia", active: true },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  api.request.mockImplementation((url: string) =>
    url.startsWith("/api/finance-overview")
      ? Promise.resolve(overview)
      : Promise.resolve({ recurrences: [], recurrenceOccurrences: [] }),
  );
});

describe("FinancialOverview controlled entry dialog callback", () => {
  it("keeps the selected entry open on an open notification and clears it on close", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinancialOverview />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Ações para Aluguel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Editar/ }));
    const editDialog = await screen.findByRole("dialog", {
      name: "Editar lançamento",
    });
    expect(within(editDialog).getByText("Aluguel")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Notificar diálogo aberto" }),
    );
    const stillEditing = screen.getByRole("dialog", {
      name: "Editar lançamento",
    });
    expect(within(stillEditing).getByText("Aluguel")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Fechar lançamento" }));
    expect(
      screen.queryByRole("dialog", { name: "Editar lançamento" }),
    ).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Lançamento" })[0]);
    expect(
      await screen.findByRole("dialog", { name: "Novo lançamento" }),
    ).toBeTruthy();
  });

  it("opens the recurrence editor from an occurrence in the monthly table", async () => {
    const user = userEvent.setup();
    api.request.mockImplementation((url: string) =>
      url.startsWith("/api/finance-overview")
        ? Promise.resolve({
            ...overview,
            recurringOccurrences: [
              {
                id: "recurrence-1:2026-10-10",
                recurrenceId: "recurrence-1",
                kind: "EXPENSE",
                description: "Aluguel",
                category: "Moradia",
                essential: true,
                dueDate: "2026-10-10",
                expectedAmount: "550.00",
                actualAmount: null,
                actualDate: null,
                status: "planned",
              },
            ],
          })
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
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinancialOverview />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Ações para Aluguel em 10/10/2026",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Editar recorrência" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Editar recorrência",
    });
    expect(within(dialog).getByLabelText("Descrição")).toHaveProperty(
      "value",
      "Aluguel",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar abertura da recorrência",
      }),
    );
    expect(within(dialog).getByText("recurrence-1")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Consumir pedido de edição" }),
    );
    expect(within(dialog).getByText("no-pending-edit")).toBeTruthy();
  });

  it("keeps the pending recurrence request when the sheet confirms it is open", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinancialOverview />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Recorrências" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar recorrência",
    });
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar abertura da recorrência",
      }),
    );
    expect(dialog).toBeTruthy();
  });
});
