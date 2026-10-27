import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  selectDistinctOn: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { RecurringExpensesRepository } from "@/backend/repositories/recurring-expenses.repository";

describe("RecurringExpensesRepository", () => {
  const repository = new RecurringExpensesRepository();

  function expectOwnerScopedWhere(
    where: ReturnType<typeof vi.fn>,
    userId: string,
  ) {
    const predicate = where.mock.calls[0]?.[0];
    expect(predicate).toBeDefined();
    expect(new PgDialect().sqlToQuery(predicate).params).toContain(userId);
  }

  beforeEach(() => vi.resetAllMocks());

  it("lists owner expenses in name order", async () => {
    const rows = [{ id: "expense" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expenses");
      return { where };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-a", () => repository.listExpenses()),
    ).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expectOwnerScopedWhere(where, "owner-a");
  });

  it("lists saved occurrences within the owner and month", async () => {
    const rows = [{ id: "occurrence" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expense_occurrences");
      return { where };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-b", () =>
        repository.listOccurrencesForMonth("2026-10-01", "2026-10-31"),
      ),
    ).resolves.toEqual(rows);
    expect(where).toHaveBeenCalledOnce();
    expectOwnerScopedWhere(where, "owner-b");
  });

  it("returns the latest realized history before the period for the owner", async () => {
    const rows = [
      {
        recurringExpenseId: "expense-1",
        dueDate: "2026-09-10",
        actualAmount: "210.00",
        realizedAt: new Date("2026-09-10T12:00:00.000Z"),
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expense_occurrences");
      return { where };
    });
    database.selectDistinctOn.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-history", () =>
        repository.listLatestRealizedBeforeDate(["expense-1"], "2026-10-01"),
      ),
    ).resolves.toEqual(rows);

    expectOwnerScopedWhere(where, "owner-history");
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining(["2026-10-01", "expense-1"]),
    );
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).sql).toMatch(
      /"realizedAt" is not null/i,
    );
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("skips the history query when no expenses are available", async () => {
    await expect(
      runWithDataOwner("owner-history", () =>
        repository.listLatestRealizedBeforeDate([], "2026-10-01"),
      ),
    ).resolves.toEqual([]);
    expect(database.selectDistinctOn).not.toHaveBeenCalled();
  });

  it("finds an expense only for the data owner", async () => {
    const row = { id: "expense" };
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-c", () => repository.findExpense("expense-id")),
    ).resolves.toEqual(row);
    expect(limit).toHaveBeenCalledWith(1);
    expectOwnerScopedWhere(where, "owner-c");
  });

  it("returns null when an owner has no matching expense", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-c", () => repository.findExpense("missing-id")),
    ).resolves.toBeNull();
    expectOwnerScopedWhere(where, "owner-c");
  });

  it("creates an expense with the active data owner", async () => {
    const row = { id: "created" };
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expenses");
      return { values };
    });

    const input = {
      description: "Internet",
      category: "Casa",
      amount: "100.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: true,
    };
    await expect(
      runWithDataOwner("owner-d", () => repository.createExpense(input)),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({ ...input, userId: "owner-d" });
  });

  it("updates an owner expense and returns null when no row matches", async () => {
    const rows = [{ id: "updated" }];
    const returning = vi
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expenses");
      return { set };
    });
    const input = {
      description: "Internet",
      category: null,
      amount: "100.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: true,
      active: false,
    };

    await expect(
      runWithDataOwner("owner-e", () =>
        repository.updateExpense("expense-id", input),
      ),
    ).resolves.toEqual(rows[0]);
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...input, updatedAt: expect.any(Date) }),
    );
    expectOwnerScopedWhere(where, "owner-e");
    await expect(
      runWithDataOwner("owner-e", () =>
        repository.updateExpense("missing-id", input),
      ),
    ).resolves.toBeNull();
  });

  it("upserts a realized occurrence while retaining its first expected amount", async () => {
    const row = { id: "realized" };
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_expense_occurrences");
      return { values };
    });
    const input = {
      recurringExpenseId: "expense-id",
      dueDate: "2026-10-10",
      expectedAmount: "100.00",
      actualAmount: "105.00",
      realizedAt: new Date("2026-10-10T12:00:00.000Z"),
    };

    await expect(
      runWithDataOwner("owner-f", () => repository.setRealized(input)),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({ ...input, userId: "owner-f" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          actualAmount: input.actualAmount,
          realizedAt: input.realizedAt,
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
