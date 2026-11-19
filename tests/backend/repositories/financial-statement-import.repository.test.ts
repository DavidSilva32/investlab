import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
}));
const markDatesForReview = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/backend/repositories/financial-month-close.repository", () => ({
  financialMonthCloseRepository: { markDatesForReview },
}));

import { FinancialStatementImportRepository } from "@/backend/repositories/financial-statement-import.repository";

describe("FinancialStatementImportRepository", () => {
  const repository = new FinancialStatementImportRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no saved rules when there are no choices", async () => {
    await expect(repository.listSavedCategoryRules([])).resolves.toEqual([]);
  });

  it("lists only saved rules matching owner, kind, and normalized descriptions", async () => {
    const rules = [
      {
        kind: "EXPENSE" as const,
        descriptionKey: "mercado",
        categoryId: "category-a",
      },
    ];
    const where = vi.fn().mockResolvedValue(rules);
    const from = vi.fn(() => ({ where }));
    database.select = vi.fn(() => ({ from }));

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.listSavedCategoryRules([
          { kind: "EXPENSE", descriptionKey: "mercado" },
          { kind: "EXPENSE", descriptionKey: "mercado" },
        ]),
      ),
    ).resolves.toEqual(rules);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it("returns no imported source rows for an empty request", async () => {
    await expect(
      repository.listAlreadyImportedRows("hash", []),
    ).resolves.toEqual([]);
  });

  it("lists imported source rows for the requested file and owner", async () => {
    const imported = [{ sourceRow: 4 }, { sourceRow: 9 }];
    const where = vi.fn().mockResolvedValue(imported);
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    database.select = vi.fn(() => ({ from }));

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.listAlreadyImportedRows("a".repeat(64), [4, 9]),
      ),
    ).resolves.toEqual(imported);
    expect(innerJoin).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it("returns no possible duplicates when there are no candidate rows", async () => {
    await expect(repository.findPossibleDuplicateRows([])).resolves.toEqual([]);
  });

  it("finds duplicates using normalized descriptions and two-decimal amounts", async () => {
    const existing = [
      {
        kind: "EXPENSE",
        description: " MERCADO   do   Bairro ",
        actualDate: "2026-11-14",
        actualAmount: "12.50",
      },
    ];
    const where = vi.fn().mockResolvedValue(existing);
    const from = vi.fn(() => ({ where }));
    database.select = vi.fn(() => ({ from }));

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.findPossibleDuplicateRows([
          {
            sourceRow: 3,
            kind: "EXPENSE",
            description: "mercado do bairro",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          },
          {
            sourceRow: 4,
            kind: "INCOME",
            description: "Mercado do Bairro",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          },
          {
            sourceRow: 5,
            kind: "EXPENSE",
            description: "Mercado do Bairro",
            actualDate: "2026-11-15",
            actualAmount: 12.5,
          },
        ]),
      ),
    ).resolves.toEqual([3]);
    expect(where).toHaveBeenCalledOnce();
  });

  it("fails safely when an import reservation loses a race and cannot be found", async () => {
    let selectCount = 0;
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCount += 1;
            return [];
          },
        }),
      }),
    }));
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "d".repeat(64),
          allowPossibleDuplicates: false,
          rememberCategories: false,
          rows: [],
        }),
      ),
    ).rejects.toThrow("Statement import could not be reserved.");
    expect(selectCount).toBe(2);
  });

  it("uses the import row reserved by a concurrent request after a conflict", async () => {
    let selectCount = 0;
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCount += 1;
            return selectCount === 1 ? [] : [{ id: "concurrent-import" }];
          },
        }),
      }),
    }));
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "f".repeat(64),
          allowPossibleDuplicates: false,
          rememberCategories: false,
          rows: [],
        }),
      ),
    ).resolves.toEqual({ importedCount: 0, alreadyImportedCount: 0 });
    expect(selectCount).toBe(2);
    expect(markDatesForReview).toHaveBeenCalledWith(
      expect.any(Object),
      "owner-a",
      [],
    );
  });

  it("fails the transaction when a reserved row cannot create its financial entry", async () => {
    const select = vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));
    const insert = vi
      .fn()
      .mockImplementationOnce(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "import-id" }],
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "row-id" }],
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        values: () => ({ returning: async () => [] }),
      }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "e".repeat(64),
          allowPossibleDuplicates: false,
          rememberCategories: false,
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Mercado",
              categoryId: "123e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-14",
              actualAmount: 12.5,
            },
          ],
        }),
      ),
    ).rejects.toThrow("The financial entry could not be created.");
  });

  it("remembers confirmed exact-description category choices per owner", async () => {
    const insertedChoices: Array<Record<string, unknown>> = [];
    const conflictConfigs: Array<Record<string, unknown>> = [];
    const select = vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));
    let insertIndex = 0;
    const insert = vi.fn(() => {
      const current = insertIndex++;
      return {
        values: (value: Record<string, unknown>) => {
          if (current === 3) insertedChoices.push(value);
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                current === 0
                  ? [{ id: "import-id" }]
                  : [{ id: current === 1 ? "row-id" : "entry-id" }],
            }),
            returning: async () => [{ id: "entry-id" }],
            onConflictDoUpdate: (config: Record<string, unknown>) => {
              conflictConfigs.push(config);
              return Promise.resolve();
            },
          };
        },
      };
    });
    const update = vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    const transaction = { select, insert, update };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    markDatesForReview.mockResolvedValue(undefined);

    await runWithDataOwner("owner-a", () =>
      repository.confirm({
        fileHash: "a".repeat(64),
        allowPossibleDuplicates: false,
        rememberCategories: true,
        rows: [
          {
            sourceRow: 6,
            kind: "EXPENSE",
            description: "  Mercado   do Bairro ",
            categoryId: "123e4567-e89b-42d3-a456-426614174000",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          },
        ],
      }),
    );

    expect(insertedChoices).toEqual([
      expect.objectContaining({
        userId: "owner-a",
        kind: "EXPENSE",
        descriptionKey: "mercado do bairro",
        categoryId: "123e4567-e89b-42d3-a456-426614174000",
      }),
    ]);
    expect(conflictConfigs[0].target).toHaveLength(3);
    expect(markDatesForReview).toHaveBeenCalledOnce();
  });

  it("does not persist remembered categories when the user opts out", async () => {
    const insert = vi.fn(() => {
      const index = insert.mock.calls.length - 1;
      return {
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () =>
              index === 0
                ? [{ id: "import-id" }]
                : [{ id: index === 1 ? "row-id" : "entry-id" }],
          }),
          returning: async () => [{ id: "entry-id" }],
          onConflictDoUpdate: vi.fn(),
        }),
      };
    });
    const transaction = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
      insert,
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await runWithDataOwner("owner-b", () =>
      repository.confirm({
        fileHash: "b".repeat(64),
        allowPossibleDuplicates: false,
        rememberCategories: false,
        rows: [
          {
            sourceRow: 6,
            kind: "EXPENSE",
            description: "Café",
            categoryId: "123e4567-e89b-42d3-a456-426614174000",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          },
        ],
      }),
    );

    expect(insert).toHaveBeenCalledTimes(3);
    expect(markDatesForReview).toHaveBeenCalledOnce();
  });

  it("does not recreate a previously imported row and upserts its category rule", async () => {
    const ruleValues: Array<Record<string, unknown>> = [];
    const conflictUpdates: Array<Record<string, unknown>> = [];
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => [{ id: "existing-import" }] }),
      }),
    }));
    const insert = vi
      .fn()
      .mockImplementationOnce(() => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      }))
      .mockImplementationOnce(() => ({
        values: (value: Record<string, unknown>) => {
          ruleValues.push(value);
          return {
            onConflictDoUpdate: (config: Record<string, unknown>) => {
              conflictUpdates.push(config);
              return Promise.resolve();
            },
          };
        },
      }));
    database.transaction.mockImplementation(async (callback) =>
      callback({
        select,
        insert,
        update: vi.fn(),
      }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "c".repeat(64),
          allowPossibleDuplicates: false,
          rememberCategories: true,
          rows: [
            {
              sourceRow: 6,
              kind: "EXPENSE",
              description: "Mercado do Bairro",
              categoryId: "223e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-14",
              actualAmount: 12.5,
            },
          ],
        }),
      ),
    ).resolves.toEqual({ importedCount: 0, alreadyImportedCount: 1 });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(ruleValues[0]).toMatchObject({
      userId: "owner-a",
      kind: "EXPENSE",
      descriptionKey: "mercado do bairro",
      categoryId: "223e4567-e89b-42d3-a456-426614174000",
    });
    expect(conflictUpdates[0].set).toMatchObject({
      categoryId: "223e4567-e89b-42d3-a456-426614174000",
    });
    expect(markDatesForReview).toHaveBeenCalledOnce();
  });
});
