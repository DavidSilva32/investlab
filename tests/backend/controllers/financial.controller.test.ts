import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  getMonthlyOverview: vi.fn(),
  simulateMonthlyCapacity: vi.fn(),
  closeMonth: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/financial.service", () => ({
  financialService: {
    listCategories: state.listCategories,
    listEntries: state.listEntries,
    createEntry: state.createEntry,
    updateEntry: state.updateEntry,
    deleteEntry: state.deleteEntry,
    getMonthlyOverview: state.getMonthlyOverview,
    simulateMonthlyCapacity: state.simulateMonthlyCapacity,
    closeMonth: state.closeMonth,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: state.info },
}));

import { FinancialController } from "@/backend/controllers/financial.controller";

describe("FinancialController", () => {
  const controller = new FinancialController();

  beforeEach(() => vi.resetAllMocks());

  it("adapts category, entry, and monthly overview calls to JSON responses", async () => {
    state.listCategories.mockResolvedValue([{ id: "category" }]);
    const categories = await controller.getCategories("request-a");
    expect(await categories.json()).toEqual({
      categories: [{ id: "category" }],
    });
    expect(state.info).toHaveBeenCalledWith(
      "financial_categories_loaded",
      expect.objectContaining({ requestId: "request-a", count: 1 }),
    );

    state.listEntries.mockResolvedValue({ month: "2026-10", entries: [] });
    const entries = await controller.getEntries("2026-10", "request-e");
    expect(await entries.json()).toEqual({ month: "2026-10", entries: [] });
    state.createEntry.mockResolvedValue({
      id: "created-entry",
      kind: "INCOME",
    });
    const createdEntry = await controller.createEntry({}, "request-f");
    expect(createdEntry.status).toBe(201);
    expect(await createdEntry.json()).toMatchObject({
      id: "created-entry",
      message: "Lançamento cadastrado.",
    });
    state.updateEntry.mockResolvedValue({
      id: "updated-entry",
      kind: "EXPENSE",
    });
    const updatedEntry = await controller.updateEntry({}, "request-g");
    expect(await updatedEntry.json()).toMatchObject({
      id: "updated-entry",
      message: "Lançamento atualizado.",
    });
    state.deleteEntry.mockResolvedValue({ id: "deleted-entry" });
    const deletedEntry = await controller.deleteEntry("id", "request-h");
    expect(await deletedEntry.json()).toMatchObject({
      id: "deleted-entry",
      message: "Lançamento excluído.",
    });

    state.getMonthlyOverview.mockResolvedValue({
      month: "2026-10",
      summary: { completeness: "recorded_only" },
    });
    const overview = await controller.getOverview("2026-10", "request-i");
    expect(await overview.json()).toMatchObject({ month: "2026-10" });
    expect(state.info).toHaveBeenCalledWith(
      "financial_overview_loaded",
      expect.objectContaining({
        requestId: "request-i",
        completeness: "recorded_only",
      }),
    );

    const capacity = {
      month: "2026-12",
      status: "positive",
      simulatedBalanceCents: "10000",
    };
    state.simulateMonthlyCapacity.mockResolvedValue(capacity);
    const simulation = await controller.simulateMonthlyCapacity(
      { month: "2026-12" },
      "request-j",
    );
    expect(await simulation.json()).toEqual(capacity);
    expect(state.simulateMonthlyCapacity).toHaveBeenCalledWith({
      month: "2026-12",
    });
    expect(state.info).toHaveBeenCalledWith(
      "financial_capacity_simulated",
      expect.objectContaining({
        requestId: "request-j",
        month: "2026-12",
        status: "positive",
      }),
    );

    const close = {
      month: "2026-10",
      close: {
        status: "closed",
        closedAt: "2026-11-01T12:00:00.000Z",
        totals: {
          expectedIncome: "1000.00",
          realizedIncome: "950.00",
          expectedExpenses: "500.00",
          realizedExpenses: "525.00",
          expectedBalance: "500.00",
          recordedBalance: "425.00",
        },
      },
    };
    state.closeMonth.mockResolvedValue(close);
    const closed = await controller.closeMonth(
      { month: "2026-10" },
      "request-k",
    );
    expect(await closed.json()).toMatchObject({
      ...close,
      message: "Mês fechado.",
    });
    expect(state.closeMonth).toHaveBeenCalledWith({ month: "2026-10" });
    expect(state.info).toHaveBeenCalledWith(
      "financial_month_closed",
      expect.objectContaining({
        requestId: "request-k",
        month: "2026-10",
        status: "closed",
      }),
    );
  });
});
