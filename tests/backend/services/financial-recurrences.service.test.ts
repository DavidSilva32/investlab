import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listRecurrences: vi.fn(),
  listOccurrencesForMonth: vi.fn(),
  listLatestRealizedBeforeDate: vi.fn(),
  findRecurrence: vi.fn(),
  createRecurrence: vi.fn(),
  updateRecurrence: vi.fn(),
  realizeOccurrence: vi.fn(),
  findOrCreateCategory: vi.fn(),
  findCategoryForUser: vi.fn(),
  hasRealizedOccurrences: vi.fn(),
}));

vi.mock("@/backend/repositories/financial-recurrences.repository", () => ({
  financialRecurrencesRepository: repository,
}));

import { FinancialRecurrencesService } from "@/backend/services/financial-recurrences.service";

function expense(
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
    id: "e1e1e1e1-1111-4111-8111-111111111111",
    description: "Aluguel",
    category: "Moradia",
    amount: "2000.00",
    frequency: "MONTHLY",
    firstDueDate: "2026-01-10",
    essential: true,
    kind: "EXPENSE" as const,
    active: true,
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<{
    recurrenceId: string;
    dueDate: string;
    expectedAmount: string;
    actualAmount: string | null;
    realizedAt: Date | null;
  }> = {},
) {
  return {
    id: "o1",
    userId: "owner",
    recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
    dueDate: "2026-10-10",
    expectedAmount: "1900.00",
    actualAmount: "2000.00",
    realizedAt: new Date("2026-10-10T12:00:00.000Z"),
    createdAt: new Date("2026-10-10T12:00:00.000Z"),
    updatedAt: new Date("2026-10-10T12:00:00.000Z"),
    ...overrides,
  };
}

describe("FinancialRecurrencesService", () => {
  const service = new FinancialRecurrencesService();

  beforeEach(() => {
    vi.resetAllMocks();
    repository.listRecurrences.mockResolvedValue([expense()]);
    repository.listRecurrences.mockResolvedValue([expense()]);
    repository.listOccurrencesForMonth.mockResolvedValue([]);
    repository.listLatestRealizedBeforeDate.mockResolvedValue([]);
    repository.findRecurrence.mockResolvedValue(expense());
    repository.createRecurrence.mockImplementation(async (value) => value);
    repository.updateRecurrence.mockImplementation(async (_id, value) => value);
    repository.realizeOccurrence.mockImplementation(async (value) => value);
    repository.findOrCreateCategory.mockResolvedValue(null);
    repository.findCategoryForUser.mockImplementation(async (id) => id);
    repository.hasRealizedOccurrences.mockResolvedValue(false);
  });

  it("requires a well-formed and valid month", async () => {
    await expect(service.getMonthlyOverview(undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.getMonthlyOverview("2026-1")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.getMonthlyOverview("1899-01")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.getMonthlyOverview("9999-01")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.getMonthlyOverview("2026-13")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("combines active forecasts and saved realized occurrences without duplicating dates", async () => {
    const paused = expense({
      id: "e2e2e2e2-2222-4222-8222-222222222222",
      description: "Seguro anual",
      frequency: "YEARLY",
      firstDueDate: "2025-10-22",
      active: false,
    });
    repository.listRecurrences.mockResolvedValue([expense(), paused]);
    repository.listOccurrencesForMonth.mockResolvedValue([
      occurrence(),
      occurrence({
        recurrenceId: paused.id,
        dueDate: "2026-10-22",
        expectedAmount: "600.00",
        actualAmount: "640.00",
      }),
      occurrence({
        recurrenceId: paused.id,
        dueDate: "2026-10-01",
        actualAmount: null,
        realizedAt: null,
      }),
      occurrence({ recurrenceId: "missing-expense" }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(result.recurrenceOccurrences).toEqual([
      expect.objectContaining({
        dueDate: "2026-10-10",
        expectedAmount: "1900.00",
        actualAmount: "2000.00",
        previousActualAmount: null,
        previousDueDate: null,
        status: "realized",
      }),
      expect.objectContaining({
        dueDate: "2026-10-22",
        expectedAmount: "600.00",
        actualAmount: "640.00",
        previousActualAmount: null,
        previousDueDate: null,
        status: "realized",
      }),
    ]);
    expect(repository.listOccurrencesForMonth).toHaveBeenCalledWith(
      "2026-10-01",
      "2026-10-31",
    );
  });

  it("returns generated planned dates for active expenses only", async () => {
    repository.listRecurrences.mockResolvedValue([
      expense({ frequency: "WEEKLY", firstDueDate: "2026-10-01" }),
      expense({
        id: "e2e2e2e2-2222-4222-8222-222222222222",
        active: false,
      }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(result.month).toBe("2026-10");
    expect(result.recurrenceOccurrences.map((item) => item.dueDate)).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(result.recurrenceOccurrences[0]).toMatchObject({
      status: "planned",
      actualAmount: null,
      previousActualAmount: null,
      previousDueDate: null,
    });
  });

  it("does not project current recurrence templates into a historical month", async () => {
    repository.listRecurrences.mockResolvedValue([
      expense({ firstDueDate: "2019-01-10" }),
    ]);
    const result = await service.getMonthlyOverview("2020-01");
    expect(result.recurrenceOccurrences).toEqual([]);
  });

  it("attaches the latest earlier realized value for each recurrence", async () => {
    repository.listRecurrences.mockResolvedValue([
      expense({ frequency: "WEEKLY", firstDueDate: "2026-10-01" }),
    ]);
    repository.listOccurrencesForMonth.mockResolvedValue([
      occurrence({
        dueDate: "2026-10-01",
        actualAmount: "205.00",
      }),
      occurrence({
        dueDate: "2026-10-08",
        actualAmount: "215.00",
      }),
    ]);
    repository.listLatestRealizedBeforeDate.mockResolvedValue([
      occurrence({
        dueDate: "2026-09-24",
        actualAmount: "210.00",
      }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(repository.listLatestRealizedBeforeDate).toHaveBeenCalledWith(
      ["e1e1e1e1-1111-4111-8111-111111111111"],
      "2026-10-01",
    );
    expect(
      result.recurrenceOccurrences.find(
        (item) => item.dueDate === "2026-10-01",
      ),
    ).toMatchObject({
      previousActualAmount: "210.00",
      previousDueDate: "2026-09-24",
    });
    expect(
      result.recurrenceOccurrences.find(
        (item) => item.dueDate === "2026-10-15",
      ),
    ).toMatchObject({
      previousActualAmount: "215.00",
      previousDueDate: "2026-10-08",
    });
  });

  it("validates and creates a recurring expense with normalized values", async () => {
    await expect(service.create({})).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.create({
        description: "Energia",
        amount: 120.005,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-15",
        essential: false,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.create({
        description: "Energia",
        amount: 120,
        frequency: "MONTHLY",
        firstDueDate: "2026-02-30",
        essential: false,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const result = await service.create({
      description: "  Energia  ",
      category: "  Casa ",
      amount: 120,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-15",
      essential: true,
      kind: "EXPENSE",
      categoryId: null,
    });

    expect(repository.createRecurrence).toHaveBeenCalledWith({
      description: "Energia",
      amount: "120.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-15",
      essential: true,
      kind: "EXPENSE",
      categoryId: null,
    });
    expect(result).toMatchObject({ description: "Energia" });
  });

  it("creates recurring income with an income category and rejects essentials", async () => {
    repository.findOrCreateCategory.mockResolvedValueOnce("income-category");
    const result = await service.create({
      kind: "INCOME",
      description: "Salário",
      category: "Salário",
      amount: 5000,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-05",
      essential: false,
    });

    expect(repository.findOrCreateCategory).toHaveBeenCalledWith(
      "INCOME",
      "Salário",
    );
    expect(repository.createRecurrence).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "INCOME",
        categoryId: "income-category",
        essential: false,
      }),
    );
    expect(result).toMatchObject({ kind: "INCOME" });

    await expect(
      service.create({
        kind: "INCOME",
        description: "Salário",
        amount: 5000,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-05",
        essential: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("validates updates and preserves the current active flag when omitted", async () => {
    await expect(service.update({})).rejects.toMatchObject({ statusCode: 400 });
    repository.findRecurrence.mockResolvedValueOnce(null);
    await expect(
      service.update({
        id: "e1e1e1e1-1111-4111-8111-111111111111",
        description: "Internet",
        amount: 100,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-15",
        essential: false,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    repository.findRecurrence.mockResolvedValueOnce(expense({ active: false }));
    await service.update({
      id: "e1e1e1e1-1111-4111-8111-111111111111",
      description: " Internet ",
      amount: 110,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-15",
      essential: false,
    });
    expect(repository.updateRecurrence).toHaveBeenLastCalledWith(
      "e1e1e1e1-1111-4111-8111-111111111111",
      expect.objectContaining({ description: "Internet", active: false }),
    );
  });

  it("rejects changing recurrence kind after a realized occurrence exists", async () => {
    repository.hasRealizedOccurrences.mockResolvedValueOnce(true);
    await expect(
      service.update({
        id: "e1e1e1e1-1111-4111-8111-111111111111",
        kind: "INCOME",
        description: "Salário",
        amount: 5000,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-10",
        essential: false,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.hasRealizedOccurrences).toHaveBeenCalledWith(
      "e1e1e1e1-1111-4111-8111-111111111111",
    );
    expect(repository.updateRecurrence).not.toHaveBeenCalled();
  });

  it("preserves the existing recurrence kind when an update omits it", async () => {
    repository.findRecurrence.mockResolvedValueOnce(
      expense({ kind: "INCOME", essential: false }),
    );
    await service.update({
      id: "e1e1e1e1-1111-4111-8111-111111111111",
      description: "Salário",
      amount: 5000,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: false,
    });
    expect(repository.updateRecurrence).toHaveBeenLastCalledWith(
      "e1e1e1e1-1111-4111-8111-111111111111",
      expect.objectContaining({ kind: "INCOME" }),
    );
    expect(repository.hasRealizedOccurrences).not.toHaveBeenCalled();
  });

  it("rejects essential income updates and category IDs outside the owner's kind", async () => {
    repository.findRecurrence.mockResolvedValueOnce(
      expense({ kind: "INCOME", essential: false }),
    );
    await expect(
      service.update({
        id: "e1e1e1e1-1111-4111-8111-111111111111",
        description: "Salário",
        amount: 5000,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-10",
        essential: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    repository.findCategoryForUser.mockResolvedValueOnce(null);
    await expect(
      service.create({
        kind: "EXPENSE",
        description: "Aluguel",
        categoryId: "24e0fa40-0563-4e4e-a52e-64fab0e6f79f",
        amount: 550,
        frequency: "MONTHLY",
        firstDueDate: "2026-10-05",
        essential: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.findCategoryForUser).toHaveBeenCalledWith(
      "24e0fa40-0563-4e4e-a52e-64fab0e6f79f",
      "EXPENSE",
    );
  });

  it("keeps a valid user category ID when saving a recurrence", async () => {
    const categoryId = "24e0fa40-0563-4e4e-a52e-64fab0e6f79f";
    await service.create({
      kind: "EXPENSE",
      description: "Aluguel",
      categoryId,
      amount: 550,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-05",
      essential: true,
    });

    expect(repository.findCategoryForUser).toHaveBeenCalledWith(
      categoryId,
      "EXPENSE",
    );
    expect(repository.createRecurrence).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId }),
    );
  });

  it("validates realization ownership, date cadence, and amount before saving", async () => {
    await expect(
      service.realizeOccurrence({}, new Date()),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.realizeOccurrence(
        {
          recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-02-30",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.realizeOccurrence(
        {
          recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-10-10",
          actualDate: "2026-02-30",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    repository.findRecurrence.mockResolvedValueOnce(null);
    await expect(
      service.realizeOccurrence(
        {
          recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-10-10",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.realizeOccurrence(
        {
          recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-10-11",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const now = new Date("2026-10-12T12:00:00.000Z");
    await service.realizeOccurrence(
      {
        recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
        dueDate: "2026-10-10",
        actualAmount: 2050,
      },
      now,
    );
    expect(repository.realizeOccurrence).toHaveBeenCalledWith({
      recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
      dueDate: "2026-10-10",
      actualDate: null,
      expectedAmount: "2000.00",
      actualAmount: "2050.00",
      realizedAt: now,
    });
    await service.realizeOccurrence(
      {
        recurrenceId: "e1e1e1e1-1111-4111-8111-111111111111",
        dueDate: "2026-10-10",
        actualDate: "2026-10-11",
        actualAmount: 2050,
      },
      now,
    );
    expect(repository.realizeOccurrence).toHaveBeenLastCalledWith(
      expect.objectContaining({ actualDate: "2026-10-11" }),
    );
  });
});
