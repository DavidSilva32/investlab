import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getMonthlyOverview: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setRealized: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/recurring-expenses.service", () => ({
  recurringExpensesService: {
    getMonthlyOverview: state.getMonthlyOverview,
    create: state.create,
    update: state.update,
    setRealized: state.setRealized,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: state.info },
}));

import { RecurringExpensesController } from "@/backend/controllers/recurring-expenses.controller";

describe("RecurringExpensesController", () => {
  const controller = new RecurringExpensesController();

  beforeEach(() => vi.resetAllMocks());

  it("returns an overview and logs counts", async () => {
    state.getMonthlyOverview.mockResolvedValue({
      month: "2026-10",
      expenses: [{ id: "expense" }],
      occurrences: [{ id: "occurrence" }],
    });
    const response = await controller.get("2026-10", "request-1");
    expect(await response.json()).toEqual({
      month: "2026-10",
      expenses: [{ id: "expense" }],
      occurrences: [{ id: "occurrence" }],
    });
    expect(state.info).toHaveBeenCalledWith(
      "recurring_expenses_loaded",
      expect.objectContaining({
        expenses: 1,
        occurrences: 1,
        month: "2026-10",
      }),
    );
  });

  it("creates and updates recurrence definitions", async () => {
    state.create.mockResolvedValue({ id: "new-expense" });
    const created = await controller.create(
      { description: "Internet" },
      "request-2",
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      id: "new-expense",
      message: "Despesa recorrente cadastrada.",
    });

    state.update.mockResolvedValue({ id: "existing-expense" });
    const updated = await controller.update(
      { id: "existing-expense" },
      "request-3",
    );
    expect(await updated.json()).toEqual({
      id: "existing-expense",
      message: "Despesa recorrente atualizada.",
    });
  });

  it("records a realized occurrence", async () => {
    state.setRealized.mockResolvedValue({
      id: "occurrence",
      recurringExpenseId: "expense",
      dueDate: "2026-10-10",
    });
    const response = await controller.realize(
      { actualAmount: 100 },
      "request-4",
    );
    expect(await response.json()).toEqual({
      id: "occurrence",
      recurringExpenseId: "expense",
      dueDate: "2026-10-10",
      message: "Valor realizado registrado.",
    });
    expect(state.info).toHaveBeenCalledWith(
      "recurring_expense_occurrence_realized",
      expect.objectContaining({
        recurringExpenseId: "expense",
        dueDate: "2026-10-10",
      }),
    );
  });
});
