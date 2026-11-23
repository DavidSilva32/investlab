import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { FinancialRepository } from "@/backend/repositories/financial.repository";

function selectSequence(rows: unknown[][]) {
  let index = 0;
  const next = async () => rows[index++] ?? [];
  return vi.fn(() => ({
    from: vi.fn((table) => ({
      where: vi.fn(() => {
        if (getTableName(table) === "financial_entry_relations") {
          const empty = Promise.resolve([]);
          return Object.assign(empty, { limit: async () => [] });
        }
        return { limit: next, for: vi.fn(() => ({ limit: next })) };
      }),
    })),
  }));
}

describe("FinancialRepository", () => {
  const repository = new FinancialRepository();

  beforeEach(() => vi.resetAllMocks());

  it("lists shared defaults and owner categories through owner preferences", async () => {
    const rows = [{ id: "default", userId: null, name: "Salário" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_categories");
      return { leftJoin };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-a", () => repository.listCategories()),
    ).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(leftJoin).toHaveBeenCalledOnce();
    const predicate = where.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(predicate).params).toContain("owner-a");
  });

  it("lists entries within expected or actual dates for the active owner", async () => {
    const rows = [{ id: "entry" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const innerJoin = vi.fn().mockReturnValue({ leftJoin });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { innerJoin };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-d", () =>
        repository.listEntries("2026-10-01", "2026-10-31"),
      ),
    ).resolves.toEqual(rows);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining(["owner-d", "2026-10-01", "2026-10-31", "CARD"]),
    );
  });

  it("finds entries only for the current owner and returns null for missing rows", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "entry" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockImplementation((table) => {
      expect(getTableName(table)).toBe("financial_entries");
      return { where };
    });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-e", () => repository.findEntry("entry-id")),
    ).resolves.toEqual({ id: "entry" });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-e",
    );
    limit.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-e", () => repository.findEntry("missing")),
    ).resolves.toBeNull();
  });

  it("finds a shared or owner category and returns null when it is unavailable", async () => {
    const rows = [{ id: "category-id" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    database.select.mockReturnValue({ from });

    await expect(
      runWithDataOwner("owner-find", () =>
        repository.findCategory("category-id"),
      ),
    ).resolves.toEqual(rows[0]);
    orderBy.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-find", () =>
        repository.findCategory("missing-category"),
      ),
    ).resolves.toBeNull();
  });

  it("creates and updates financial entries as owner-scoped writes", async () => {
    const row = { id: "entry" };
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([row]),
    });
    const selected = vi.fn().mockResolvedValue([
      {
        kind: "EXPENSE",
        expectedAmount: "100.00",
        expectedDate: "2026-10-10",
        actualAmount: null,
        actualDate: null,
        reviewStatus: "NONE",
      },
    ]);
    const updatedEntry = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({
      returning: updatedEntry,
      then: (resolve: (value: undefined) => unknown) =>
        Promise.resolve(undefined).then(resolve),
    });
    const set = vi.fn().mockReturnValue({ where });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => {
          const isRelation =
            getTableName(table) === "financial_entry_relations";
          return {
            where: vi.fn(() =>
              isRelation
                ? { limit: vi.fn().mockResolvedValue([]) }
                : {
                    limit: selected,
                    for: vi.fn(() => ({ limit: selected })),
                  },
            ),
          };
        }),
      })),
      insert: vi.fn((table) => {
        expect(getTableName(table)).toBe("financial_entries");
        return { values };
      }),
      update: vi.fn((table) => {
        if (getTableName(table) === "financial_monthly_closures") {
          return {
            set: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(undefined),
            })),
          };
        }
        return { set };
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const input = {
      kind: "EXPENSE",
      description: "Luz",
      categoryId: "category-id",
      expectedAmount: "100.00",
      expectedDate: "2026-10-10",
      actualAmount: null,
      actualDate: null,
    };
    await expect(
      runWithDataOwner("owner-f", () => repository.createEntry(input)),
    ).resolves.toEqual(row);
    expect(values).toHaveBeenCalledWith({ ...input, userId: "owner-f" });
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.insert.mock.invocationCallOrder[0],
    );
    await expect(
      runWithDataOwner("owner-f", () =>
        repository.updateEntry("entry-id", input),
      ),
    ).resolves.toEqual(row);
    expect(transaction.execute.mock.invocationCallOrder[3]).toBeLessThan(
      transaction.select.mock.invocationCallOrder[0],
    );
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-f",
    );
    selected.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-f", () =>
        repository.updateEntry("missing", input),
      ),
    ).resolves.toBeNull();
    selected.mockResolvedValueOnce([
      { expectedDate: "2026-10-10", actualDate: null },
    ]);
    updatedEntry.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-f", () =>
        repository.updateEntry("entry-id", input),
      ),
    ).resolves.toBeNull();
  });

  it("returns null when an entry disappears before the update row lock", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selectSequence([
        [{ expectedDate: "2026-10-10", actualDate: null }],
        [],
      ]),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-update-race", () =>
        repository.updateEntry("entry-id", {
          kind: "EXPENSE",
          description: "Luz",
          categoryId: "category-id",
          expectedAmount: "100.00",
          expectedDate: "2026-10-10",
          actualAmount: null,
          actualDate: null,
        }),
      ),
    ).resolves.toBeNull();
    expect(transaction.select).toHaveBeenCalledTimes(2);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects amount or date edits that would invalidate an active relation", async () => {
    const existingEntry = {
      kind: "EXPENSE",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: "25.00",
      actualDate: "2026-10-31",
      reviewStatus: "NONE",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue(
                getTableName(table) === "financial_entry_relations"
                  ? [{ id: "relation" }]
                  : [existingEntry],
              ),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existingEntry]),
            })),
          })),
        })),
      })),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-related-edit", () =>
        repository.updateEntry("expense", {
          kind: "EXPENSE",
          description: "Compra corrigida",
          categoryId: "category-id",
          expectedAmount: null,
          expectedDate: null,
          actualAmount: "26.00",
          actualDate: "2026-10-31",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("requires review before changing the kind of a pending reversal credit", async () => {
    const pendingEntry = {
      kind: "INCOME",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: "25.00",
      actualDate: "2026-10-31",
      reviewStatus: "REVERSAL_PENDING",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selectSequence([[pendingEntry], [pendingEntry]]),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-pending-edit", () =>
        repository.updateEntry("refund", {
          kind: "EXPENSE",
          description: "Crédito recebido",
          categoryId: "category-id",
          expectedAmount: null,
          expectedDate: null,
          actualAmount: "25.00",
          actualDate: "2026-10-31",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([
    { field: "kind", update: { kind: "INCOME" } },
    { field: "expected amount", update: { expectedAmount: "26.00" } },
    { field: "expected date", update: { expectedDate: "2026-10-11" } },
    { field: "actual amount", update: { actualAmount: "26.00" } },
    { field: "actual date", update: { actualDate: "2026-11-01" } },
  ])("rejects a linked entry %s change", async ({ update }) => {
    const existingEntry = {
      kind: "EXPENSE",
      expectedAmount: "25.00",
      expectedDate: "2026-10-10",
      actualAmount: "25.00",
      actualDate: "2026-10-31",
      reviewStatus: "NONE",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn(() => ({
            limit: vi
              .fn()
              .mockResolvedValue(
                getTableName(table) === "financial_entry_relations"
                  ? [{ id: "relation" }]
                  : [existingEntry],
              ),
            for: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([existingEntry]),
            })),
          })),
        })),
      })),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-related-edit", () =>
        repository.updateEntry("expense", {
          kind: "EXPENSE",
          description: "Compra",
          categoryId: "category-id",
          expectedAmount: "25.00",
          expectedDate: "2026-10-10",
          actualAmount: "25.00",
          actualDate: "2026-10-31",
          ...update,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("creates a recurrence and linked entry in one transaction and rolls back failures", async () => {
    const recurrenceId = "77777777-7777-4777-8777-777777777777";
    const recurrence = {
      amount: "550.00",
      categoryId: "category-id",
      description: "Aluguel",
      essential: true,
      firstDueDate: "2026-11-10",
      frequency: "MONTHLY",
      kind: "EXPENSE" as const,
    };
    const input = {
      kind: "EXPENSE",
      description: "Aluguel",
      categoryId: "category-id",
      recurrenceId: null,
      expectedAmount: "550.00",
      expectedDate: "2026-10-10",
      actualAmount: null,
      actualDate: null,
    };
    const insertedValues: Array<{ table: string; values: unknown }> = [];
    const updatedValues: Array<{ table: string; values: unknown }> = [];
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: recurrenceId }])
      .mockResolvedValueOnce([{ id: "entry-id", recurrenceId }]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => {
          const entryRows = [
            {
              id: "existing-entry",
              kind: "EXPENSE",
              expectedAmount: "550.00",
              expectedDate: "2026-10-10",
              actualAmount: null,
              actualDate: null,
              reviewStatus: "NONE",
            },
          ];
          const isRelation =
            getTableName(table) === "financial_entry_relations";
          return {
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(isRelation ? [] : entryRows),
              for: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(entryRows),
              })),
            })),
          };
        }),
      })),
      insert: vi.fn((table) => ({
        values: vi.fn((values) => {
          insertedValues.push({ table: getTableName(table), values });
          return { returning };
        }),
      })),
      update: vi.fn((table) => ({
        set: vi.fn((values) => {
          if (getTableName(table) === "financial_monthly_closures") {
            return { where: vi.fn().mockResolvedValue(undefined) };
          }
          updatedValues.push({ table: getTableName(table), values });
          return { where: vi.fn(() => ({ returning })) };
        }),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-transaction", () =>
        repository.saveEntryWithRecurrence(null, input, recurrence),
      ),
    ).resolves.toMatchObject({ id: "entry-id", recurrenceId });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.insert.mock.invocationCallOrder[0],
    );
    expect(insertedValues).toEqual([
      {
        table: "financial_recurrences",
        values: { ...recurrence, userId: "owner-transaction" },
      },
      {
        table: "financial_entries",
        values: {
          ...input,
          recurrenceId,
          userId: "owner-transaction",
        },
      },
    ]);

    returning
      .mockReset()
      .mockResolvedValueOnce([{ id: recurrenceId }])
      .mockResolvedValueOnce([{ id: "existing-entry", recurrenceId }]);
    await expect(
      runWithDataOwner("owner-transaction", () =>
        repository.saveEntryWithRecurrence("existing-entry", input, recurrence),
      ),
    ).resolves.toMatchObject({ id: "existing-entry", recurrenceId });
    expect(updatedValues).toEqual([
      {
        table: "financial_entries",
        values: {
          ...input,
          recurrenceId,
          updatedAt: expect.any(Date),
        },
      },
    ]);

    returning
      .mockReset()
      .mockResolvedValueOnce([{ id: recurrenceId }])
      .mockRejectedValueOnce(new Error("entry insert failed"));
    await expect(
      runWithDataOwner("owner-transaction", () =>
        repository.saveEntryWithRecurrence(null, input, recurrence),
      ),
    ).rejects.toThrow("entry insert failed");

    returning.mockReset().mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-transaction", () =>
        repository.saveEntryWithRecurrence(null, input, recurrence),
      ),
    ).rejects.toThrow("The recurrence could not be created.");

    returning
      .mockReset()
      .mockResolvedValueOnce([{ id: recurrenceId }])
      .mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-transaction", () =>
        repository.saveEntryWithRecurrence(null, input, recurrence),
      ),
    ).rejects.toThrow("The linked financial entry could not be saved.");
    expect(database.transaction).toHaveBeenCalledTimes(5);
  });

  it("requires review before changing the kind of a pending credit through recurrence editing", async () => {
    const pendingEntry = {
      id: "refund",
      kind: "INCOME",
      expectedAmount: null,
      expectedDate: null,
      actualAmount: "25.00",
      actualDate: "2026-10-31",
      reviewStatus: "REVERSAL_PENDING",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selectSequence([[pendingEntry], [pendingEntry]]),
      insert: vi.fn(),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-pending-recurrence", () =>
        repository.saveEntryWithRecurrence(
          "refund",
          {
            kind: "EXPENSE",
            description: "Crédito recebido",
            categoryId: "category-id",
            recurrenceId: null,
            expectedAmount: null,
            expectedDate: null,
            actualAmount: "25.00",
            actualDate: "2026-10-31",
          },
          {
            amount: "25.00",
            categoryId: "category-id",
            description: "Crédito recebido",
            essential: false,
            firstDueDate: "2026-10-31",
            frequency: "MONTHLY",
            kind: "EXPENSE",
          },
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it.each([
    { field: "kind", update: { kind: "INCOME" } },
    { field: "expected amount", update: { expectedAmount: "26.00" } },
    { field: "expected date", update: { expectedDate: "2026-10-11" } },
    { field: "actual amount", update: { actualAmount: "26.00" } },
    { field: "actual date", update: { actualDate: "2026-11-01" } },
  ])("prevents changing a linked recurring entry %s", async ({ update }) => {
    const existingEntry = {
      id: "linked-entry",
      kind: "EXPENSE",
      expectedAmount: "25.00",
      expectedDate: "2026-10-10",
      actualAmount: "25.00",
      actualDate: "2026-10-31",
      reviewStatus: "NONE",
    };
    let entryQuery = 0;
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn(() => {
            if (getTableName(table) === "financial_entry_relations") {
              return {
                limit: vi.fn().mockResolvedValue([{ id: "relation" }]),
              };
            }
            const row = [existingEntry, existingEntry][entryQuery++];
            return {
              limit: vi.fn().mockResolvedValue([row]),
              for: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([row]),
              })),
            };
          }),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-linked-recurrence", () =>
        repository.saveEntryWithRecurrence(
          "linked-entry",
          {
            kind: "EXPENSE",
            description: "Luz atualizada",
            categoryId: "category-id",
            recurrenceId: null,
            expectedAmount: "25.00",
            expectedDate: "2026-10-10",
            actualAmount: "25.00",
            actualDate: "2026-10-31",
            ...update,
          },
          {
            amount: "25.00",
            categoryId: "category-id",
            description: "Luz",
            essential: true,
            firstDueDate: "2026-10-10",
            frequency: "MONTHLY",
            kind: "EXPENSE",
          },
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects recurrence saves when the linked entry is not owned", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit,
            for: vi.fn(() => ({ limit })),
          })),
        })),
      })),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.saveEntryWithRecurrence(
          "missing-entry",
          {
            kind: "EXPENSE",
            description: "Aluguel",
            categoryId: "category-id",
            recurrenceId: null,
            expectedAmount: "550.00",
            expectedDate: "2026-10-10",
            actualAmount: null,
            actualDate: null,
          },
          {
            amount: "550.00",
            categoryId: "category-id",
            description: "Aluguel",
            essential: true,
            firstDueDate: "2026-11-10",
            frequency: "MONTHLY",
            kind: "EXPENSE",
          },
        ),
      ),
    ).rejects.toThrow("The linked financial entry could not be found.");
    expect(limit).toHaveBeenCalledOnce();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects recurrence save if the linked entry disappears before its row lock", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selectSequence([
        [{ expectedDate: "2026-10-10", actualDate: null }],
        [],
      ]),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-recurrence-race", () =>
        repository.saveEntryWithRecurrence(
          "entry-id",
          {
            kind: "EXPENSE",
            description: "Aluguel",
            categoryId: "category-id",
            recurrenceId: null,
            expectedAmount: "550.00",
            expectedDate: "2026-10-10",
            actualAmount: null,
            actualDate: null,
          },
          {
            amount: "550.00",
            categoryId: "category-id",
            description: "Aluguel",
            essential: true,
            firstDueDate: "2026-11-10",
            frequency: "MONTHLY",
            kind: "EXPENSE",
          },
        ),
      ),
    ).rejects.toThrow("The linked financial entry could not be found.");
    expect(transaction.select).toHaveBeenCalledTimes(2);
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("deletes only an entry belonging to the active owner", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "entry-id" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const selected = vi
      .fn()
      .mockResolvedValue([{ expectedDate: "2026-10-10", actualDate: null }]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn(() =>
            getTableName(table) === "financial_entry_relations"
              ? Promise.resolve([])
              : {
                  limit: selected,
                  for: vi.fn(() => ({ limit: selected })),
                },
          ),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      delete: vi.fn((table) => {
        expect(getTableName(table)).toBe("financial_entries");
        return { where };
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    await expect(
      runWithDataOwner("owner-g", () => repository.deleteEntry("entry-id")),
    ).resolves.toEqual({ id: "entry-id" });
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.select.mock.invocationCallOrder[0],
    );
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "owner-g",
    );
    selected.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-g", () => repository.deleteEntry("missing")),
    ).resolves.toBeNull();
    selected.mockResolvedValueOnce([
      { expectedDate: "2026-10-10", actualDate: null },
    ]);
    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-g", () => repository.deleteEntry("entry-id")),
    ).resolves.toBeNull();
  });

  it("returns null without deleting when an entry disappears before its row lock", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selectSequence([
        [{ expectedDate: "2026-10-10", actualDate: null }],
        [],
      ]),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-delete-race", () =>
        repository.deleteEntry("entry-id"),
      ),
    ).resolves.toBeNull();
    expect(transaction.select).toHaveBeenCalledTimes(3);
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("restores reversal credits and marks both months when the expense is deleted", async () => {
    const deletedExpense = {
      id: "expense",
      kind: "EXPENSE",
      expectedDate: null,
      actualDate: "2026-10-31",
    };
    const reversalCredit = {
      id: "refund",
      kind: "INCOME",
      actualDate: "2026-11-01",
    };
    let financialEntryQuery = 0;
    const selects = vi.fn(() => ({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          const name = getTableName(table);
          if (name === "financial_entry_relations") {
            return Promise.resolve([
              {
                id: "relation",
                kind: "REVERSAL",
                entryId: "refund",
                relatedEntryId: "expense",
              },
            ]);
          }
          const query = financialEntryQuery++;
          const rows = query === 1 ? [reversalCredit] : [deletedExpense];
          return Object.assign(Promise.resolve(rows), {
            limit: async () => rows,
            for: () => ({ limit: async () => [deletedExpense] }),
          });
        }),
      })),
    }));
    const updates: Array<{ table: string; values: Record<string, unknown> }> =
      [];
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: selects,
      update: vi.fn((table) => ({
        set: vi.fn((values) => {
          updates.push({ table: getTableName(table), values });
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "expense" }]),
        })),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-delete-reversal", () =>
        repository.deleteEntry("expense"),
      ),
    ).resolves.toEqual({ id: "expense" });
    expect(updates).toContainEqual({
      table: "financial_entries",
      values: {
        reviewStatus: "REVERSAL_PENDING",
        updatedAt: expect.any(Date),
      },
    });
    expect(updates).toContainEqual({
      table: "financial_monthly_closures",
      values: { status: "NEEDS_REVIEW", updatedAt: expect.any(Date) },
    });
    const monthLockQueries = transaction.execute.mock.calls.map(
      ([query]) => new PgDialect().sqlToQuery(query as never).params,
    );
    expect(monthLockQueries).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["owner-delete-reversal", "2026-10"]),
        expect.arrayContaining(["owner-delete-reversal", "2026-11"]),
      ]),
    );
  });

  it("marks both months when deleting the linked reversal credit", async () => {
    const refund = {
      id: "refund",
      kind: "INCOME",
      expectedDate: null,
      actualDate: "2026-11-01",
    };
    const expense = {
      id: "expense",
      kind: "EXPENSE",
      actualDate: "2026-10-31",
    };
    const entryResults: unknown[][] = [[refund], [expense], [refund]];
    let entryIndex = 0;
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn(() => {
            if (getTableName(table) === "financial_entry_relations") {
              return Promise.resolve([
                {
                  id: "relation",
                  kind: "REVERSAL",
                  entryId: "refund",
                  relatedEntryId: "expense",
                },
              ]);
            }
            const rows = entryResults[entryIndex++];
            return Object.assign(Promise.resolve(rows), {
              limit: async () => rows,
              for: () => ({ limit: async () => rows }),
            });
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "refund" }]),
        })),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      runWithDataOwner("owner-delete-refund", () =>
        repository.deleteEntry("refund"),
      ),
    ).resolves.toEqual({ id: "refund" });

    const lockParams = transaction.execute.mock.calls.map(
      ([query]) => new PgDialect().sqlToQuery(query as never).params,
    );
    expect(lockParams).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["owner-delete-refund", "2026-10"]),
        expect.arrayContaining(["owner-delete-refund", "2026-11"]),
      ]),
    );
  });
});
