import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listExpenses: vi.fn(),
  listOccurrencesForMonth: vi.fn(),
  listLatestRealizedBeforeDate: vi.fn(),
  findExpense: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  setRealized: vi.fn(),
}));

vi.mock("@/backend/repositories/recurring-expenses.repository", () => ({
  recurringExpensesRepository: repository,
}));

import { RecurringExpensesService } from "@/backend/services/recurring-expenses.service";

function expense(
  overrides: Partial<{
    id: string;
    description: string;
    category: string | null;
    amount: string;
    frequency: string;
    firstDueDate: string;
    essential: boolean;
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
    active: true,
    ...overrides,
  };
}

function occurrence(
  overrides: Partial<{
    recurringExpenseId: string;
    dueDate: string;
    expectedAmount: string;
    actualAmount: string | null;
    realizedAt: Date | null;
  }> = {},
) {
  return {
    id: "o1",
    userId: "owner",
    recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
    dueDate: "2026-10-10",
    expectedAmount: "1900.00",
    actualAmount: "2000.00",
    realizedAt: new Date("2026-10-10T12:00:00.000Z"),
    createdAt: new Date("2026-10-10T12:00:00.000Z"),
    updatedAt: new Date("2026-10-10T12:00:00.000Z"),
    ...overrides,
  };
}

describe("RecurringExpensesService", () => {
  const service = new RecurringExpensesService();

  beforeEach(() => {
    vi.resetAllMocks();
    repository.listExpenses.mockResolvedValue([expense()]);
    repository.listOccurrencesForMonth.mockResolvedValue([]);
    repository.listLatestRealizedBeforeDate.mockResolvedValue([]);
    repository.findExpense.mockResolvedValue(expense());
    repository.createExpense.mockImplementation(async (value) => value);
    repository.updateExpense.mockImplementation(async (_id, value) => value);
    repository.setRealized.mockImplementation(async (value) => value);
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
    repository.listExpenses.mockResolvedValue([expense(), paused]);
    repository.listOccurrencesForMonth.mockResolvedValue([
      occurrence(),
      occurrence({
        recurringExpenseId: paused.id,
        dueDate: "2026-10-22",
        expectedAmount: "600.00",
        actualAmount: "640.00",
      }),
      occurrence({
        recurringExpenseId: paused.id,
        dueDate: "2026-10-01",
        actualAmount: null,
        realizedAt: null,
      }),
      occurrence({ recurringExpenseId: "missing-expense" }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(result.occurrences).toEqual([
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
    repository.listExpenses.mockResolvedValue([
      expense({ frequency: "WEEKLY", firstDueDate: "2026-10-01" }),
      expense({
        id: "e2e2e2e2-2222-4222-8222-222222222222",
        active: false,
      }),
    ]);

    const result = await service.getMonthlyOverview("2026-10");

    expect(result.month).toBe("2026-10");
    expect(result.occurrences.map((item) => item.dueDate)).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(result.occurrences[0]).toMatchObject({
      status: "planned",
      actualAmount: null,
      previousActualAmount: null,
      previousDueDate: null,
    });
  });

  it("attaches the latest earlier realized value for each recurrence", async () => {
    repository.listExpenses.mockResolvedValue([
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
      result.occurrences.find((item) => item.dueDate === "2026-10-01"),
    ).toMatchObject({
      previousActualAmount: "210.00",
      previousDueDate: "2026-09-24",
    });
    expect(
      result.occurrences.find((item) => item.dueDate === "2026-10-15"),
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
    });

    expect(repository.createExpense).toHaveBeenCalledWith({
      description: "Energia",
      category: "Casa",
      amount: "120.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-15",
      essential: true,
    });
    expect(result).toMatchObject({ description: "Energia" });
  });

  it("validates updates and preserves the current active flag when omitted", async () => {
    await expect(service.update({})).rejects.toMatchObject({ statusCode: 400 });
    repository.findExpense.mockResolvedValueOnce(null);
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

    repository.findExpense.mockResolvedValueOnce(expense({ active: false }));
    await service.update({
      id: "e1e1e1e1-1111-4111-8111-111111111111",
      description: " Internet ",
      amount: 110,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-15",
      essential: false,
    });
    expect(repository.updateExpense).toHaveBeenLastCalledWith(
      "e1e1e1e1-1111-4111-8111-111111111111",
      expect.objectContaining({ description: "Internet", active: false }),
    );
  });

  it("validates realization ownership, date cadence, and amount before saving", async () => {
    await expect(service.setRealized({}, new Date())).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.setRealized(
        {
          recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-02-30",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    repository.findExpense.mockResolvedValueOnce(null);
    await expect(
      service.setRealized(
        {
          recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-10-10",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.setRealized(
        {
          recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
          dueDate: "2026-10-11",
          actualAmount: 180,
        },
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const now = new Date("2026-10-12T12:00:00.000Z");
    await service.setRealized(
      {
        recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
        dueDate: "2026-10-10",
        actualAmount: 2050,
      },
      now,
    );
    expect(repository.setRealized).toHaveBeenCalledWith({
      recurringExpenseId: "e1e1e1e1-1111-4111-8111-111111111111",
      dueDate: "2026-10-10",
      expectedAmount: "2000.00",
      actualAmount: "2050.00",
      realizedAt: now,
    });
  });
});
