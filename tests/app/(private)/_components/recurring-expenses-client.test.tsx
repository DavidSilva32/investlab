// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addMonths, format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {
    isPending: true,
    isError: false,
    data: undefined as unknown,
    refetch: vi.fn(),
  },
  options: undefined as
    { queryKey: unknown[]; queryFn: () => Promise<unknown> } | undefined,
  apiRequest: vi.fn(),
  invalidateQueries: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: typeof state.options) => {
    state.options = options ?? undefined;
    return state.query;
  },
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));

vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: state.toastError },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiRequest: state.apiRequest };
});

vi.mock(
  "@/app/(private)/despesas-recorrentes/_components/recurring-expense-form",
  () => ({
    RecurringExpenseForm: ({
      expense,
      saving,
      onSave,
      onCancel,
    }: {
      expense?: { id: string };
      saving: boolean;
      onSave: (values: Record<string, unknown>) => Promise<boolean>;
      onCancel?: () => void;
    }) => (
      <section aria-label="Formulário de despesa">
        <p>{expense ? `Editando ${expense.id}` : "Nova despesa"}</p>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void onSave({
              description: "Internet",
              category: "Casa",
              amount: 100,
              frequency: "MONTHLY",
              firstDueDate: "2026-10-10",
              essential: true,
            })
          }
        >
          Salvar cadastro
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
      </section>
    ),
    type: {},
  }),
);

vi.mock(
  "@/app/(private)/despesas-recorrentes/_components/recurring-expense-list",
  () => ({
    RecurringExpenseList: ({
      expenses,
      onEdit,
      onToggleActive,
    }: {
      expenses: Array<{
        id: string;
        description: string;
        category: string | null;
        amount: string;
        frequency: "MONTHLY";
        firstDueDate: string;
        essential: boolean;
        active: boolean;
      }>;
      onEdit: (expense: (typeof expenses)[number]) => void;
      onToggleActive: (expense: (typeof expenses)[number]) => void;
    }) => (
      <section aria-label="Lista de despesas">
        {expenses.map((expense) => (
          <div key={expense.id}>
            <span>{expense.description}</span>
            <button type="button" onClick={() => onEdit(expense)}>
              Editar despesa
            </button>
            <button type="button" onClick={() => onToggleActive(expense)}>
              Pausar despesa
            </button>
          </div>
        ))}
      </section>
    ),
  }),
);

vi.mock(
  "@/app/(private)/despesas-recorrentes/_components/recurring-expense-occurrences",
  () => ({
    RecurringExpenseOccurrences: ({
      occurrences,
      onRealize,
    }: {
      occurrences: Array<{
        id: string;
        recurringExpenseId: string;
        description: string;
        category: string | null;
        essential: boolean;
        dueDate: string;
        expectedAmount: string;
        actualAmount: string | null;
        previousActualAmount: string | null;
        previousDueDate: string | null;
        status: "planned" | "realized";
      }>;
      onRealize: (
        occurrence: (typeof occurrences)[number],
        amount: number,
      ) => Promise<boolean>;
    }) => (
      <section aria-label="Lançamentos previstos">
        {occurrences.map((occurrence) => (
          <button
            key={occurrence.id}
            type="button"
            onClick={() => void onRealize(occurrence, 105)}
          >
            Registrar {occurrence.description}
          </button>
        ))}
      </section>
    ),
  }),
);

import { ApiError } from "@/lib/api-client";
import { RecurringExpensesClient } from "@/app/(private)/despesas-recorrentes/_components/recurring-expenses-client";

const expense = {
  id: "expense-1",
  description: "Aluguel",
  category: "Moradia",
  amount: "550.00",
  frequency: "MONTHLY" as const,
  firstDueDate: "2026-10-05",
  essential: true,
  active: true,
};
const occurrence = {
  id: "occurrence-1",
  recurringExpenseId: "expense-1",
  description: "Aluguel",
  category: "Moradia",
  essential: true,
  dueDate: "2026-10-05",
  expectedAmount: "550.00",
  actualAmount: null,
  previousActualAmount: null,
  previousDueDate: null,
  status: "planned" as const,
};
const overview = {
  month: "2026-10",
  expenses: [expense],
  occurrences: [occurrence],
};

function setLoaded() {
  state.query = {
    isPending: false,
    isError: false,
    data: overview,
    refetch: state.query.refetch,
  };
}

beforeEach(() => {
  state.query = {
    isPending: true,
    isError: false,
    data: undefined,
    refetch: vi.fn(),
  };
  state.options = undefined;
  state.apiRequest.mockReset().mockResolvedValue(undefined);
  state.invalidateQueries.mockReset().mockResolvedValue(undefined);
  state.toastSuccess.mockReset();
  state.toastError.mockReset();
});

afterEach(cleanup);

describe("RecurringExpensesClient", () => {
  it("shows loading, then inline load error with retry and no duplicate toast", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RecurringExpensesClient />);
    expect(
      screen.getByRole("status", { name: "Carregando despesas recorrentes" }),
    ).toBeTruthy();

    state.query = { ...state.query, isPending: false, isError: true };
    rerender(<RecurringExpensesClient />);
    expect(
      screen.getByText("Não foi possível carregar os vencimentos."),
    ).toBeTruthy();
    expect(state.toastError).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.query.refetch).toHaveBeenCalledOnce();
  });

  it("loads the selected month and navigates between months", async () => {
    setLoaded();
    const user = userEvent.setup();
    render(<RecurringExpensesClient />);
    const initialMonth = state.options?.queryKey[1] as string;
    expect(initialMonth).toBe(format(new Date(), "yyyy-MM"));
    await state.options?.queryFn();
    expect(state.apiRequest).toHaveBeenCalledWith(
      `/api/recurring-expenses?month=${initialMonth}`,
      undefined,
      "Não foi possível carregar as despesas recorrentes.",
    );

    await user.click(screen.getByRole("button", { name: "Ver mês anterior" }));
    expect(state.options?.queryKey[1]).toBe(
      format(addMonths(new Date(`${initialMonth}-01T12:00:00`), -1), "yyyy-MM"),
    );
    expect(screen.getByText(/previsto em despesas recorrentes/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ver próximo mês" }));
    expect(state.options?.queryKey[1]).toBe(initialMonth);
  });

  it("renders neither totals nor forms until overview data is available", () => {
    state.query = {
      isPending: false,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    };
    render(<RecurringExpensesClient />);
    expect(screen.queryByText("Previsto em despesas recorrentes")).toBeNull();
    expect(screen.queryByLabelText("Formulário de despesa")).toBeNull();
  });

  it("adds recorded values to the realized monthly total", () => {
    state.query = {
      isPending: false,
      isError: false,
      data: {
        ...overview,
        occurrences: [{ ...occurrence, actualAmount: "123.45" }],
      },
      refetch: vi.fn(),
    };
    render(<RecurringExpensesClient />);
    expect(screen.getByText("R$ 123,45")).toBeTruthy();
  });

  it("creates, edits, pauses, and realizes expenses with success toasts and invalidation", async () => {
    setLoaded();
    const user = userEvent.setup();
    render(<RecurringExpensesClient />);

    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() =>
      expect(state.apiRequest).toHaveBeenCalledWith(
        "/api/recurring-expenses",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"description":"Internet"'),
        }),
        expect.any(String),
      ),
    );
    expect(JSON.parse(state.apiRequest.mock.calls[0][1].body)).toMatchObject({
      amount: 100,
    });
    expect(state.toastSuccess).toHaveBeenCalledWith(
      "Despesa recorrente cadastrada.",
    );

    await user.click(screen.getByRole("button", { name: "Editar despesa" }));
    expect(screen.getByText("Editando expense-1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar edição" }));
    expect(screen.getByText("Nova despesa")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar despesa" }));
    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() =>
      expect(state.apiRequest).toHaveBeenLastCalledWith(
        "/api/recurring-expenses",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"id":"expense-1"'),
        }),
        expect.any(String),
      ),
    );
    expect(JSON.parse(state.apiRequest.mock.calls[1][1].body)).toMatchObject({
      amount: 100,
    });
    expect(state.toastSuccess).toHaveBeenLastCalledWith(
      "Despesa recorrente atualizada.",
    );

    await user.click(screen.getByRole("button", { name: "Pausar despesa" }));
    await waitFor(() =>
      expect(state.toastSuccess).toHaveBeenLastCalledWith(
        "Despesa recorrente pausada.",
      ),
    );
    expect(JSON.parse(state.apiRequest.mock.calls[2][1].body)).toMatchObject({
      amount: 550,
    });
    await user.click(screen.getByRole("button", { name: "Registrar Aluguel" }));
    await waitFor(() =>
      expect(state.apiRequest).toHaveBeenLastCalledWith(
        "/api/recurring-expenses/occurrences",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"actualAmount":105'),
        }),
        expect.any(String),
      ),
    );
    expect(JSON.parse(state.apiRequest.mock.calls[3][1].body)).toMatchObject({
      actualAmount: 105,
    });
    expect(state.toastSuccess).toHaveBeenLastCalledWith(
      "Valor realizado registrado.",
    );
    expect(state.invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it("shows API mutation failures only in a toast", async () => {
    setLoaded();
    state.apiRequest.mockRejectedValueOnce(new ApiError("Sem acesso", 403));
    const user = userEvent.setup();
    render(<RecurringExpensesClient />);
    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith("Sem acesso"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resumes paused expenses and handles toggle, realization, and save failures", async () => {
    const pausedOverview = {
      ...overview,
      expenses: [{ ...expense, active: false }],
    };
    state.query = {
      isPending: false,
      isError: false,
      data: pausedOverview,
      refetch: vi.fn(),
    };
    const user = userEvent.setup();
    render(<RecurringExpensesClient />);

    await user.click(screen.getByRole("button", { name: "Pausar despesa" }));
    await waitFor(() =>
      expect(state.toastSuccess).toHaveBeenCalledWith(
        "Despesa recorrente retomada.",
      ),
    );

    state.apiRequest.mockRejectedValueOnce(new Error("internal failure"));
    await user.click(screen.getByRole("button", { name: "Pausar despesa" }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenLastCalledWith(
        "Não foi possível salvar a despesa recorrente.",
      ),
    );

    state.apiRequest.mockRejectedValueOnce(new ApiError("Valor recusado", 400));
    await user.click(screen.getByRole("button", { name: "Registrar Aluguel" }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenLastCalledWith("Valor recusado"),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    state.apiRequest.mockRejectedValueOnce(new Error("internal failure"));
    await user.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenLastCalledWith(
        "Não foi possível salvar a despesa recorrente.",
      ),
    );
  });
});
