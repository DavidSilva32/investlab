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

import { FinancialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";

describe("FinancialRecurrencesRepository", () => {
  const repository = new FinancialRecurrencesRepository();

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
    const secondJoin = vi.fn().mockReturnValue({ where });
    const firstJoin = vi.fn().mockReturnValue({ leftJoin: secondJoin });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_recurrences");
      return { leftJoin: firstJoin };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-a", () => repository.listRecurrences()),
    ).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expectOwnerScopedWhere(where, "owner-a");
  });

  it("resolves a shared or owner category by normalized name", async () => {
    const rows = [{ id: "shared-category" }];
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findOrCreateCategory("INCOME", "  salário "),
      ),
    ).resolves.toBe("shared-category");
    expectOwnerScopedWhere(where, "owner-category");
  });

  it("skips category lookup when no legacy free-text category is present", async () => {
    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findOrCreateCategory("EXPENSE", null),
      ),
    ).resolves.toBeNull();
    expect(database.select).not.toHaveBeenCalled();
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("creates an owner category when no shared or owner category matches", async () => {
    const selectLimit = vi.fn().mockResolvedValue([]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    database.select.mockReturnValue({ from: selectFrom });

    const row = { id: "custom-category" };
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    database.insert.mockReturnValue({ values });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findOrCreateCategory("EXPENSE", "Academia"),
      ),
    ).resolves.toBe("custom-category");
    expect(values).toHaveBeenCalledWith({
      userId: "owner-category",
      kind: "EXPENSE",
      name: "Academia",
      isDefault: false,
    });
  });

  it("returns the category inserted concurrently after an insert conflict", async () => {
    const firstLimit = vi.fn().mockResolvedValueOnce([]);
    const firstWhere = vi.fn().mockReturnValue({ limit: firstLimit });
    const firstFrom = vi.fn().mockReturnValue({ where: firstWhere });
    const fallbackLimit = vi.fn().mockResolvedValueOnce([{ id: "winner" }]);
    const fallbackWhere = vi.fn().mockReturnValue({ limit: fallbackLimit });
    const fallbackFrom = vi.fn().mockReturnValue({ where: fallbackWhere });
    database.select
      .mockReturnValueOnce({ from: firstFrom })
      .mockReturnValueOnce({ from: fallbackFrom });
    const returning = vi.fn().mockResolvedValueOnce([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    database.insert.mockReturnValue({ values });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findOrCreateCategory("EXPENSE", "Academia"),
      ),
    ).resolves.toBe("winner");
    expect(database.select).toHaveBeenCalledTimes(2);
    expectOwnerScopedWhere(fallbackWhere, "owner-category");
  });

  it("returns null when no category appears after an insert conflict", async () => {
    const selectLimits = [
      vi.fn().mockResolvedValueOnce([]),
      vi.fn().mockResolvedValueOnce([]),
    ];
    const selectWheres = selectLimits.map((limit) =>
      vi.fn().mockReturnValue({ limit }),
    );
    const selectFroms = selectWheres.map((where) =>
      vi.fn().mockReturnValue({ where }),
    );
    database.select
      .mockReturnValueOnce({ from: selectFroms[0] })
      .mockReturnValueOnce({ from: selectFroms[1] });
    const returning = vi.fn().mockResolvedValueOnce([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    database.insert.mockReturnValue({ values });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findOrCreateCategory("EXPENSE", "Academia"),
      ),
    ).resolves.toBeNull();
    expect(database.select).toHaveBeenCalledTimes(2);
    expectOwnerScopedWhere(selectWheres[1], "owner-category");
  });

  it("validates a category belongs to the recurrence kind and visible owner scope", async () => {
    const rows = [{ id: "category" }];
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findCategoryForUser("category", "EXPENSE"),
      ),
    ).resolves.toBe("category");
    expectOwnerScopedWhere(where, "owner-category");
  });

  it("returns null when a category is missing or belongs to another kind", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-category", () =>
        repository.findCategoryForUser("other-kind-category", "INCOME"),
      ),
    ).resolves.toBeNull();
    expectOwnerScopedWhere(where, "owner-category");
  });

  it("checks realized occurrences without crossing recurrence ownership", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "realized-occurrence" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-recurrence", () =>
        repository.hasRealizedOccurrences("recurrence-id"),
      ),
    ).resolves.toBe(false);
    await expect(
      runWithDataOwner("owner-recurrence", () =>
        repository.hasRealizedOccurrences("recurrence-id"),
      ),
    ).resolves.toBe(true);
    expect(where).toHaveBeenCalledTimes(2);
    expectOwnerScopedWhere(where, "owner-recurrence");
  });

  it("lists saved occurrences within the owner and month", async () => {
    const rows = [{ id: "occurrence" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_financial_occurrences");
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

  it("lists recurring dates by due date or actual date for the active owner", async () => {
    const rows = [{ id: "occurrence" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_financial_occurrences");
      return { where };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-period", () =>
        repository.listOccurrencesForFinancialPeriod(
          "2026-10-01",
          "2026-10-31",
        ),
      ),
    ).resolves.toEqual(rows);
    expect(where).toHaveBeenCalledOnce();
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining(["owner-period", "2026-10-01", "2026-10-31"]),
    );
  });

  it("returns the latest realized history before the period for the owner", async () => {
    const rows = [
      {
        recurrenceId: "expense-1",
        dueDate: "2026-09-10",
        actualAmount: "210.00",
        realizedAt: new Date("2026-09-10T12:00:00.000Z"),
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_financial_occurrences");
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
      runWithDataOwner("owner-c", () =>
        repository.findRecurrence("expense-id"),
      ),
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
      runWithDataOwner("owner-c", () =>
        repository.findRecurrence("missing-id"),
      ),
    ).resolves.toBeNull();
    expectOwnerScopedWhere(where, "owner-c");
  });

  it("creates an expense with the active data owner", async () => {
    const row = { id: "created" };
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_recurrences");
      return { values };
    });

    const input = {
      description: "Internet",
      amount: "100.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: true,
      kind: "EXPENSE" as const,
      categoryId: null,
    };
    await expect(
      runWithDataOwner("owner-d", () => repository.createRecurrence(input)),
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
      expect(getTableName(table)).toBe("financial_recurrences");
      return { set };
    });
    const input = {
      description: "Internet",
      amount: "100.00",
      frequency: "MONTHLY",
      firstDueDate: "2026-10-10",
      essential: true,
      kind: "EXPENSE" as const,
      categoryId: null,
      active: false,
    };

    await expect(
      runWithDataOwner("owner-e", () =>
        repository.updateRecurrence("expense-id", input),
      ),
    ).resolves.toEqual(rows[0]);
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...input, updatedAt: expect.any(Date) }),
    );
    expectOwnerScopedWhere(where, "owner-e");
    await expect(
      runWithDataOwner("owner-e", () =>
        repository.updateRecurrence("missing-id", input),
      ),
    ).resolves.toBeNull();
  });

  it("upserts a realized occurrence while retaining its first expected amount", async () => {
    const row = { id: "realized" };
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockImplementation((table) => {
      expect(getTableName(table)).toBe("recurring_financial_occurrences");
      return { values };
    });
    const input = {
      recurrenceId: "expense-id",
      dueDate: "2026-10-10",
      actualDate: "2026-10-12",
      expectedAmount: "100.00",
      actualAmount: "105.00",
      realizedAt: new Date("2026-10-10T12:00:00.000Z"),
    };

    await expect(
      runWithDataOwner("owner-f", () => repository.realizeOccurrence(input)),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({ ...input, userId: "owner-f" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          actualAmount: input.actualAmount,
          actualDate: input.actualDate,
          realizedAt: input.realizedAt,
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
