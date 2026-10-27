import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateOwnedCategory: vi.fn(),
  saveDefaultCategoryPreference: vi.fn(),
  setOwnedCategoryActive: vi.fn(),
  listEntries: vi.fn(),
  findCategory: vi.fn(),
  findEntry: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  listRecurrences: vi.fn(),
  listOccurrencesForFinancialPeriod: vi.fn(),
}));

vi.mock("@/backend/repositories/financial.repository", () => ({
  financialRepository: {
    listCategories: repositories.listCategories,
    createCategory: repositories.createCategory,
    updateOwnedCategory: repositories.updateOwnedCategory,
    saveDefaultCategoryPreference: repositories.saveDefaultCategoryPreference,
    setOwnedCategoryActive: repositories.setOwnedCategoryActive,
    listEntries: repositories.listEntries,
    findCategory: repositories.findCategory,
    findEntry: repositories.findEntry,
    createEntry: repositories.createEntry,
    updateEntry: repositories.updateEntry,
    deleteEntry: repositories.deleteEntry,
  },
}));

vi.mock("@/backend/repositories/financial-recurrences.repository", () => ({
  financialRecurrencesRepository: {
    listRecurrences: repositories.listRecurrences,
    listOccurrencesForFinancialPeriod:
      repositories.listOccurrencesForFinancialPeriod,
  },
}));

import { FinancialService } from "@/backend/services/financial.service";

const defaultCategory = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: null,
  kind: "INCOME",
  name: "Salário",
  originalName: "Salário",
  isDefault: true,
  active: true,
};

const ownedCategory = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "owner",
  kind: "EXPENSE",
  name: "Moradia",
  originalName: "Moradia",
  isDefault: false,
  active: true,
};

const defaultExpenseCategory = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  userId: null,
  kind: "EXPENSE",
  name: "Alimentação",
  originalName: "Alimentação",
  isDefault: true,
  active: true,
};

function entry(
  overrides: Partial<{
    id: string;
    kind: string;
    description: string;
    categoryId: string;
    categoryName: string;
    expectedAmount: string | null;
    expectedDate: string | null;
    actualAmount: string | null;
    actualDate: string | null;
  }> = {},
) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "owner",
    kind: "EXPENSE",
    description: "Conta de luz",
    categoryId: ownedCategory.id,
    categoryName: "Moradia",
    expectedAmount: "100.00",
    expectedDate: "2026-10-10",
    actualAmount: "105.00",
    actualDate: "2026-10-11",
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    updatedAt: new Date("2026-10-11T12:00:00.000Z"),
    ...overrides,
  };
}

function recurringExpense(
  overrides: Partial<{
    id: string;
    description: string;
    category: string | null;
    amount: string;
    frequency: string;
    firstDueDate: string;
    essential: boolean;
    kind: "INCOME" | "EXPENSE";
    active: boolean;
  }> = {},
) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: "owner",
    description: "Aluguel",
    category: "Moradia",
    amount: "100.00",
    frequency: "MONTHLY",
    firstDueDate: "2026-01-10",
    essential: true,
    kind: "EXPENSE" as const,
    active: true,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<{
    id: string;
    recurrenceId: string;
    dueDate: string;
    expectedAmount: string;
    actualAmount: string | null;
    actualDate: string | null;
    realizedAt: Date | null;
  }> = {},
) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    userId: "owner",
    recurrenceId: recurringExpense().id,
    dueDate: "2026-10-10",
    expectedAmount: "100.00",
    actualAmount: "110.00",
    actualDate: "2026-10-12",
    realizedAt: new Date("2026-10-12T12:00:00.000Z"),
    createdAt: new Date("2026-10-12T12:00:00.000Z"),
    updatedAt: new Date("2026-10-12T12:00:00.000Z"),
    ...overrides,
  };
}

describe("FinancialService", () => {
  const service = new FinancialService();

  beforeEach(() => {
    vi.resetAllMocks();
    repositories.listCategories.mockResolvedValue([
      defaultCategory,
      defaultExpenseCategory,
      ownedCategory,
    ]);
    repositories.createCategory.mockImplementation(async (value) => value);
    repositories.updateOwnedCategory.mockResolvedValue(ownedCategory);
    repositories.saveDefaultCategoryPreference.mockImplementation(
      async (id, value) => ({ ...defaultCategory, id, ...value }),
    );
    repositories.setOwnedCategoryActive.mockImplementation(
      async (_id, active) => ({ ...ownedCategory, active }),
    );
    repositories.listEntries.mockResolvedValue([]);
    repositories.findCategory.mockImplementation(
      async (id) =>
        [defaultCategory, ownedCategory].find((value) => value.id === id) ??
        null,
    );
    repositories.findEntry.mockResolvedValue(entry());
    repositories.createEntry.mockImplementation(async (value) => value);
    repositories.updateEntry.mockImplementation(async (_id, value) => value);
    repositories.deleteEntry.mockImplementation(async (id) => ({ id }));
    repositories.listRecurrences.mockResolvedValue([]);
    repositories.listOccurrencesForFinancialPeriod.mockResolvedValue([]);
  });

  it("lists categories and validates the month when listing entries", async () => {
    await expect(service.listCategories()).resolves.toEqual([
      defaultCategory,
      defaultExpenseCategory,
      ownedCategory,
    ]);
    await expect(service.listEntries(undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.listEntries("2026-10")).resolves.toEqual({
      month: "2026-10",
      entries: [],
    });
    expect(repositories.listEntries).toHaveBeenCalledWith(
      "2026-10-01",
      "2026-10-31",
    );
  });

  it("creates custom categories and rejects duplicates after normalization", async () => {
    await expect(
      service.createCategory({ kind: "INCOME", name: "  Trabalho  " }),
    ).resolves.toEqual({ kind: "INCOME", name: "Trabalho" });
    expect(repositories.createCategory).toHaveBeenCalledWith({
      kind: "INCOME",
      name: "Trabalho",
    });
    await expect(
      service.createCategory({ kind: "INCOME", name: " salário " }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.createCategory({ kind: "OTHER", name: "x" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("customizes shared defaults without changing their shared source row", async () => {
    await service.updateCategory({
      id: defaultCategory.id,
      name: "Renda principal",
    });
    expect(repositories.saveDefaultCategoryPreference).toHaveBeenCalledWith(
      defaultCategory.id,
      { nameOverride: "Renda principal", active: true },
    );
    await service.updateCategory({ id: defaultCategory.id, active: false });
    expect(repositories.saveDefaultCategoryPreference).toHaveBeenLastCalledWith(
      defaultCategory.id,
      { nameOverride: null, active: false },
    );
  });

  it("updates owned categories and permits reactivating a custom category", async () => {
    await service.updateCategory({
      id: ownedCategory.id,
      name: "Casa",
      active: false,
    });
    expect(repositories.updateOwnedCategory).toHaveBeenCalledWith(
      ownedCategory.id,
      { kind: "EXPENSE", name: "Casa" },
    );
    expect(repositories.setOwnedCategoryActive).toHaveBeenCalledWith(
      ownedCategory.id,
      false,
    );
    await service.updateCategory({ id: ownedCategory.id, active: true });
    expect(repositories.setOwnedCategoryActive).toHaveBeenLastCalledWith(
      ownedCategory.id,
      true,
    );
    repositories.findCategory
      .mockResolvedValueOnce(ownedCategory)
      .mockResolvedValueOnce(null);
    await expect(
      service.updateCategory({ id: ownedCategory.id, name: "Contas da casa" }),
    ).resolves.toBeNull();
  });

  it("rejects missing, duplicate, and non-owner categories", async () => {
    repositories.findCategory.mockResolvedValueOnce(null);
    await expect(
      service.updateCategory({ id: ownedCategory.id, name: "Casa" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.updateCategory({ id: ownedCategory.id, name: "Alimentação" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    repositories.findCategory.mockResolvedValueOnce({
      ...ownedCategory,
      userId: null,
      isDefault: false,
    });
    await expect(
      service.updateCategory({ id: ownedCategory.id, active: false }),
    ).rejects.toMatchObject({ statusCode: 500 });
    await expect(
      service.updateCategory({ id: ownedCategory.id }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("deactivates categories instead of deleting their historical references", async () => {
    await expect(service.deleteCategory("bad-id")).rejects.toMatchObject({
      statusCode: 400,
    });
    repositories.findCategory
      .mockResolvedValueOnce(ownedCategory)
      .mockResolvedValueOnce({ ...ownedCategory, active: false });
    await expect(
      service.deleteCategory(ownedCategory.id),
    ).resolves.toMatchObject({
      active: false,
    });
    expect(repositories.setOwnedCategoryActive).toHaveBeenCalledWith(
      ownedCategory.id,
      false,
    );
  });

  it("validates and creates forecast-only, realized-only, or combined entries", async () => {
    await expect(service.createEntry({})).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.createEntry({
        kind: "EXPENSE",
        description: "Conta",
        categoryId: ownedCategory.id,
        expectedAmount: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.createEntry({
        kind: "EXPENSE",
        description: "Conta",
        categoryId: ownedCategory.id,
        expectedAmount: 10,
        expectedDate: "2026-02-30",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    repositories.findCategory.mockResolvedValueOnce(null);
    await expect(
      service.createEntry({
        kind: "EXPENSE",
        description: "Conta",
        categoryId: ownedCategory.id,
        actualAmount: 10,
        actualDate: "2026-10-10",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    repositories.findCategory.mockResolvedValueOnce({
      ...ownedCategory,
      active: false,
    });
    await expect(
      service.createEntry({
        kind: "EXPENSE",
        description: "Conta",
        categoryId: ownedCategory.id,
        actualAmount: 10,
        actualDate: "2026-10-10",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.createEntry({
        kind: "INCOME",
        description: "Conta",
        categoryId: ownedCategory.id,
        actualAmount: 10,
        actualDate: "2026-10-10",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.createEntry({
        kind: "INCOME",
        description: "Salário",
        categoryId: defaultCategory.id,
        expectedAmount: 2500,
        expectedDate: "2026-10-05",
        actualAmount: 2400,
        actualDate: "2026-10-05",
      }),
    ).resolves.toMatchObject({
      kind: "INCOME",
      expectedAmount: "2500.00",
      expectedDate: "2026-10-05",
      actualAmount: "2400.00",
      actualDate: "2026-10-05",
    });
    await expect(
      service.createEntry({
        kind: "EXPENSE",
        description: "Despesa planejada",
        categoryId: ownedCategory.id,
        expectedAmount: 10,
        expectedDate: "2026-10-30",
      }),
    ).resolves.toMatchObject({
      actualAmount: null,
      actualDate: null,
      expectedAmount: "10.00",
      expectedDate: "2026-10-30",
    });
  });

  it("updates only owner entries and permits keeping a historical inactive category", async () => {
    const sameCategory = { ...ownedCategory, active: false };
    repositories.findCategory.mockResolvedValueOnce(sameCategory);
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "Conta de luz revisada",
        categoryId: ownedCategory.id,
        actualAmount: 105,
        actualDate: "2026-10-12",
      }),
    ).resolves.toMatchObject({ actualAmount: "105.00" });
    expect(repositories.updateEntry).toHaveBeenCalledWith(
      entry().id,
      expect.objectContaining({
        expectedAmount: null,
        expectedDate: null,
        actualAmount: "105.00",
        actualDate: "2026-10-12",
      }),
    );
  });

  it("rejects invalid or missing entry updates and deletions", async () => {
    await expect(service.updateEntry({ id: "bad" })).rejects.toMatchObject({
      statusCode: 400,
    });
    repositories.findEntry.mockResolvedValueOnce(null);
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "X",
        categoryId: ownedCategory.id,
        actualAmount: 1,
        actualDate: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    repositories.findCategory.mockResolvedValueOnce(null);
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "X",
        categoryId: ownedCategory.id,
        actualAmount: 1,
        actualDate: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    repositories.findCategory.mockResolvedValueOnce({
      ...ownedCategory,
      kind: "INCOME",
    });
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "X",
        categoryId: ownedCategory.id,
        actualAmount: 1,
        actualDate: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    repositories.findCategory.mockResolvedValueOnce({
      ...defaultExpenseCategory,
      active: false,
    });
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "X",
        categoryId: defaultExpenseCategory.id,
        actualAmount: 1,
        actualDate: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    repositories.updateEntry.mockResolvedValueOnce(null);
    await expect(
      service.updateEntry({
        id: entry().id,
        kind: "EXPENSE",
        description: "X",
        categoryId: ownedCategory.id,
        actualAmount: 1,
        actualDate: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.deleteEntry(null)).rejects.toMatchObject({
      statusCode: 400,
    });
    repositories.deleteEntry.mockResolvedValueOnce(null);
    await expect(service.deleteEntry(entry().id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.deleteEntry(entry().id)).resolves.toEqual({
      id: entry().id,
    });
  });

  it("aggregates manual and recurring flows without double-counting saved occurrences", async () => {
    const salary = entry({
      kind: "INCOME",
      description: "Salário",
      categoryId: defaultCategory.id,
      categoryName: "Salário",
      expectedAmount: "3000.00",
      expectedDate: "2026-10-05",
      actualAmount: "2900.00",
      actualDate: "2026-10-05",
    });
    const grocery = entry({
      id: "66666666-6666-4666-8666-666666666666",
      description: "Mercado",
      expectedAmount: "500.00",
      expectedDate: "2026-10-15",
      actualAmount: "520.00",
      actualDate: "2026-10-16",
    });
    const planned = entry({
      id: "77777777-7777-4777-8777-777777777777",
      expectedAmount: "120.00",
      expectedDate: "2026-10-20",
      actualAmount: null,
      actualDate: null,
    });
    const realizedOnly = entry({
      id: "abababab-abab-4bab-8bab-abababababab",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: "50.00",
      actualDate: "2026-10-21",
    });
    const realizedLater = entry({
      id: "88888888-8888-4888-8888-888888888888",
      expectedAmount: "80.00",
      expectedDate: "2026-09-30",
      actualAmount: "85.00",
      actualDate: "2026-10-03",
    });
    const currentRecurring = recurringExpense();
    const pausedRecurring = recurringExpense({
      id: "99999999-9999-4999-8999-999999999999",
      description: "Internet",
      amount: "30.00",
      active: false,
    });
    const movedRecurring = recurringExpense({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      description: "Seguro",
      amount: "20.00",
      active: false,
    });
    const undatedRecurring = recurringExpense({
      id: "acacacac-acac-4cac-8cac-acacacacacac",
      description: "Água",
      amount: "40.00",
      active: false,
    });
    repositories.listEntries.mockResolvedValue([
      salary,
      grocery,
      planned,
      realizedOnly,
      realizedLater,
    ]);
    repositories.listCategories.mockResolvedValue([
      defaultCategory,
      ownedCategory,
    ]);
    repositories.listRecurrences.mockResolvedValue([
      currentRecurring,
      pausedRecurring,
      movedRecurring,
      undatedRecurring,
    ]);
    repositories.listOccurrencesForFinancialPeriod.mockResolvedValue([
      occurrence(),
      occurrence({
        id: "saved-paused",
        recurrenceId: pausedRecurring.id,
        dueDate: "2026-10-02",
        expectedAmount: "30.00",
        actualAmount: "35.00",
        actualDate: "2026-10-13",
      }),
      occurrence({
        id: "saved-paid-later",
        recurrenceId: movedRecurring.id,
        dueDate: "2026-09-30",
        expectedAmount: "20.00",
        actualAmount: "25.00",
        actualDate: "2026-10-03",
      }),
      occurrence({
        id: "saved-without-actual-date",
        recurrenceId: undatedRecurring.id,
        dueDate: "2026-10-25",
        expectedAmount: "40.00",
        actualAmount: "42.00",
        actualDate: null,
      }),
      occurrence({
        id: "saved-outside-selected-period",
        recurrenceId: currentRecurring.id,
        dueDate: "2026-09-05",
        expectedAmount: "5.00",
        actualAmount: "5.00",
        actualDate: "2026-09-06",
      }),
      occurrence({
        id: "missing-expense",
        recurrenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(result.summary).toEqual({
      expectedIncome: "3000.00",
      realizedIncome: "2900.00",
      expectedExpenses: "790.00",
      realizedExpenses: "825.00",
      expectedBalance: "2210.00",
      recordedBalance: "2075.00",
      undatedRecurringRealizations: 1,
      completeness: "recorded_only",
    });
    expect(result.entries).toHaveLength(5);
    expect(result.entries[0].categoryName).toBe("Salário");
    expect(result.recurringOccurrences).toHaveLength(4);
    expect(result.history.months).toHaveLength(12);
    expect(result.history.months[0]).toMatchObject({
      month: "2025-11",
      expectedIncome: null,
      realizedExpenses: null,
      completeness: "recorded_only",
    });
    expect(result.history.months[10]).toMatchObject({
      month: "2026-09",
      expectedExpenses: "105.00",
      realizedExpenses: "5.00",
    });
    expect(result.history.months[11]).toMatchObject({
      month: "2026-10",
      expectedExpenses: "790.00",
      realizedExpenses: "825.00",
      undatedRecurringRealizations: 1,
    });
    expect(result.history.explanation).toContain("não são tratados como zero");
  });

  it("keeps missing periods and incomplete balances as unknown", async () => {
    repositories.listEntries.mockResolvedValue([
      entry({
        kind: "EXPENSE",
        expectedAmount: null,
        expectedDate: null,
        actualAmount: "12.34",
        actualDate: "2026-01-02",
      }),
    ]);
    await expect(service.getMonthlyOverview("2026-01")).resolves.toMatchObject({
      summary: {
        expectedIncome: null,
        realizedIncome: null,
        expectedExpenses: null,
        realizedExpenses: "12.34",
        recordedBalance: null,
        completeness: "recorded_only",
      },
      history: {
        months: expect.arrayContaining([
          expect.objectContaining({
            month: "2025-02",
            expectedIncome: null,
            realizedIncome: null,
            recordedBalance: null,
          }),
        ]),
      },
    });
  });

  it("returns unknown totals instead of presenting an empty period as zero", async () => {
    repositories.listRecurrences.mockResolvedValue([
      recurringExpense({ active: false, firstDueDate: "2026-11-01" }),
    ]);
    await expect(service.getMonthlyOverview("2026-10")).resolves.toMatchObject({
      summary: {
        expectedIncome: null,
        realizedIncome: null,
        expectedExpenses: null,
        realizedExpenses: null,
        expectedBalance: null,
        recordedBalance: null,
        completeness: "no_data",
      },
      recurringOccurrences: [],
      history: {
        months: expect.arrayContaining([
          expect.objectContaining({ month: "2026-10", expectedExpenses: null }),
        ]),
      },
    });
  });

  it("forecasts active recurring expenses when no occurrence has been realized", async () => {
    repositories.listRecurrences.mockResolvedValue([recurringExpense()]);
    await expect(service.getMonthlyOverview("2026-10")).resolves.toMatchObject({
      summary: {
        expectedExpenses: "100.00",
        realizedExpenses: null,
        completeness: "recorded_only",
      },
      recurringOccurrences: [
        expect.objectContaining({
          dueDate: "2026-10-10",
          expectedAmount: "100.00",
          actualAmount: null,
          actualDate: null,
        }),
      ],
    });
  });

  it("does not apply today's recurrence setup to a past month", async () => {
    repositories.listRecurrences.mockResolvedValue([
      recurringExpense({ firstDueDate: "2019-01-10" }),
    ]);
    await expect(service.getMonthlyOverview("2020-01")).resolves.toMatchObject({
      summary: {
        expectedExpenses: null,
        realizedExpenses: null,
      },
      recurringOccurrences: [],
      history: {
        completeness: "recorded_only",
      },
    });
  });

  it("includes recurring income once in the financial overview", async () => {
    const salary = recurringExpense({
      kind: "INCOME",
      description: "Salário",
      category: "Salário",
      amount: "5000.00",
      essential: false,
    });
    repositories.listRecurrences.mockResolvedValue([salary]);
    repositories.listOccurrencesForFinancialPeriod.mockResolvedValue([
      occurrence({
        recurrenceId: salary.id,
        expectedAmount: "5000.00",
        actualAmount: "4800.00",
        actualDate: "2026-10-10",
      }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");
    expect(result.summary).toMatchObject({
      expectedIncome: "5000.00",
      realizedIncome: "4800.00",
      expectedExpenses: null,
      realizedExpenses: null,
      recordedBalance: null,
    });
    expect(result.recurringOccurrences).toHaveLength(1);
    expect(result.recurringOccurrences[0]).toMatchObject({
      kind: "INCOME",
      expectedAmount: "5000.00",
      actualAmount: "4800.00",
    });
  });

  it("formats a negative recorded balance without turning missing income into zero", async () => {
    repositories.listEntries.mockResolvedValue([
      entry({
        kind: "INCOME",
        categoryId: defaultCategory.id,
        expectedAmount: "1.00",
        expectedDate: "2026-10-01",
        actualAmount: "1.00",
        actualDate: "2026-10-01",
      }),
      entry({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        expectedAmount: "2.00",
        expectedDate: "2026-10-02",
        actualAmount: "2.00",
        actualDate: "2026-10-02",
      }),
    ]);
    await expect(service.getMonthlyOverview("2026-10")).resolves.toMatchObject({
      summary: {
        expectedBalance: "-1.00",
        recordedBalance: "-1.00",
      },
    });
  });

  it("validates malformed, out-of-range, and impossible reporting months", async () => {
    for (const month of [null, "2026-1", "1899-01", "9999-01", "2026-13"]) {
      await expect(service.getMonthlyOverview(month)).rejects.toMatchObject({
        statusCode: 400,
      });
    }
  });
});
