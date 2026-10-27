import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  getMonthlyOverview: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/financial.service", () => ({
  financialService: {
    listCategories: state.listCategories,
    createCategory: state.createCategory,
    updateCategory: state.updateCategory,
    deleteCategory: state.deleteCategory,
    listEntries: state.listEntries,
    createEntry: state.createEntry,
    updateEntry: state.updateEntry,
    deleteEntry: state.deleteEntry,
    getMonthlyOverview: state.getMonthlyOverview,
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

    state.createCategory.mockResolvedValue({ id: "created-category" });
    const createdCategory = await controller.createCategory({}, "request-b");
    expect(createdCategory.status).toBe(201);
    expect(await createdCategory.json()).toMatchObject({
      id: "created-category",
      message: "Categoria cadastrada.",
    });

    state.updateCategory.mockResolvedValue({ id: "updated-category" });
    const updatedCategory = await controller.updateCategory({}, "request-c");
    expect(await updatedCategory.json()).toMatchObject({
      id: "updated-category",
      message: "Categoria atualizada.",
    });
    state.deleteCategory.mockResolvedValue({ id: "hidden-category" });
    const deletedCategory = await controller.deleteCategory("id", "request-d");
    expect(await deletedCategory.json()).toMatchObject({
      id: "hidden-category",
      message: "Categoria desativada.",
    });

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
  });
});
