import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getMonthlyOverview: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  realizeOccurrence: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/financial-recurrences.service", () => ({
  financialRecurrencesService: {
    getMonthlyOverview: state.getMonthlyOverview,
    create: state.create,
    update: state.update,
    realizeOccurrence: state.realizeOccurrence,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: state.info },
}));

import { FinancialRecurrencesController } from "@/backend/controllers/financial-recurrences.controller";

describe("FinancialRecurrencesController", () => {
  const controller = new FinancialRecurrencesController();

  beforeEach(() => vi.resetAllMocks());

  it("returns an overview and logs counts", async () => {
    state.getMonthlyOverview.mockResolvedValue({
      month: "2026-10",
      recurrences: [{ id: "expense", kind: "EXPENSE" }],
      recurrenceOccurrences: [{ id: "occurrence" }],
    });
    const response = await controller.get("2026-10", "request-1");
    expect(await response.json()).toEqual({
      month: "2026-10",
      recurrences: [{ id: "expense", kind: "EXPENSE" }],
      recurrenceOccurrences: [{ id: "occurrence" }],
    });
    expect(state.info).toHaveBeenCalledWith(
      "financial_recurrences_loaded",
      expect.objectContaining({
        recurrences: 1,
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

    state.create.mockResolvedValue({ id: "new-income", kind: "INCOME" });
    const createdIncome = await controller.create(
      { description: "Salário" },
      "request-5",
    );
    expect(await createdIncome.json()).toEqual({
      id: "new-income",
      kind: "INCOME",
      message: "Receita recorrente cadastrada.",
    });

    state.update.mockResolvedValue({ id: "existing-income", kind: "INCOME" });
    const updatedIncome = await controller.update(
      { id: "existing-income" },
      "request-6",
    );
    expect(await updatedIncome.json()).toEqual({
      id: "existing-income",
      kind: "INCOME",
      message: "Receita recorrente atualizada.",
    });

    state.update.mockResolvedValue(null);
    const missingUpdate = await controller.update(
      { id: "missing" },
      "request-7",
    );
    expect(await missingUpdate.json()).toEqual({
      message: "Despesa recorrente atualizada.",
    });
  });

  it("records a realized occurrence", async () => {
    state.realizeOccurrence.mockResolvedValue({
      id: "occurrence",
      recurrenceId: "expense",
      dueDate: "2026-10-10",
    });
    const response = await controller.realize(
      { actualAmount: 100 },
      "request-4",
    );
    expect(await response.json()).toEqual({
      id: "occurrence",
      recurrenceId: "expense",
      dueDate: "2026-10-10",
      message: "Valor realizado registrado.",
    });
    expect(state.info).toHaveBeenCalledWith(
      "financial_recurrence_occurrence_realized",
      expect.objectContaining({
        recurrenceId: "expense",
        dueDate: "2026-10-10",
      }),
    );
  });
});
