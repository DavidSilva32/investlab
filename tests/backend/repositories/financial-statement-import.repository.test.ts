import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
}));
const { markDatesForReview, acquireMonthLocks, acquireFinancialWriteLock } =
  vi.hoisted(() => ({
    markDatesForReview: vi.fn(),
    acquireMonthLocks: vi.fn(async () => undefined),
    acquireFinancialWriteLock: vi.fn(async () => undefined),
  }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/backend/repositories/financial-month-close.repository", () => ({
  financialMonthCloseRepository: {
    markDatesForReview,
    acquireMonthLocks,
    acquireFinancialWriteLock,
  },
}));

import { FinancialStatementImportRepository } from "@/backend/repositories/financial-statement-import.repository";

function createConfirmSelectMock(options: {
  hasRows: boolean;
  imported?: Array<{ id: string }>;
  later?: Array<{ id: string }>;
  signatures?: Array<{
    kind: string;
    description: string;
    actualDate: string;
    actualAmount: string | number;
  }>;
}) {
  let signaturePending = options.hasRows;
  let limitedQueryCount = 0;
  return vi.fn(() => ({
    from: () => ({
      where: () => {
        if (signaturePending) {
          signaturePending = false;
          return Promise.resolve(options.signatures ?? []);
        }
        const queryIndex = limitedQueryCount++;
        return {
          limit: async () =>
            queryIndex === 0 ? (options.imported ?? []) : (options.later ?? []),
        };
      },
    }),
  }));
}

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
          {
            sourceRow: 6,
            kind: "EXPENSE",
            description: "Mercado do Bairro",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          },
        ]),
      ),
    ).resolves.toEqual([3]);
    expect(where).toHaveBeenCalledOnce();
  });

  it("ignores historical card purchases when matching an account statement", async () => {
    const where = vi.fn().mockResolvedValue([]);
    database.select.mockReturnValue({ from: () => ({ where }) });
    const row = {
      sourceRow: 2,
      kind: "EXPENSE" as const,
      description: "Compra",
      actualDate: "2026-11-14",
      actualAmount: 10,
    };
    await runWithDataOwner("owner-account-dedupe", () =>
      repository.findPossibleDuplicateRows([row]),
    );
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining(["owner-account-dedupe", "CARD"]),
    );
  });

  it("stores account statement coverage and creates only account entries", async () => {
    const insertedImports: Array<Record<string, unknown>> = [];
    const insertedEntries: Array<Record<string, unknown>> = [];
    let selectIndex = 0;
    const select = vi.fn(() => {
      const current = selectIndex++;
      return {
        from: () => ({
          where: () =>
            current === 0 ? Promise.resolve([]) : { limit: async () => [] },
        }),
      };
    });
    let insertIndex = 0;
    const insert = vi.fn(() => {
      const current = insertIndex++;
      return {
        values: (value: Record<string, unknown>) => {
          if (current === 0) insertedImports.push(value);
          if (current === 2) insertedEntries.push(value);
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                current === 0
                  ? [{ id: "card-import" }]
                  : [{ id: "import-row" }],
            }),
            returning: async () => [{ id: "card-entry" }],
          };
        },
      };
    });
    const update = vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    const transaction = { select, insert, update, execute: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    markDatesForReview.mockResolvedValue(undefined);

    await expect(
      runWithDataOwner("owner-card-import", () =>
        repository.confirm({
          fileHash: "c".repeat(64),
          source: "ACCOUNT",
          coverageStart: "2026-11-08",
          coverageEnd: "2026-11-14",
          rememberCategories: false,
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Pagamento fatura Inter",
              categoryId: "123e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-14",
              actualAmount: 100,
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      importedCount: 1,
      alreadyImportedCount: 0,
      duplicateCount: 0,
    });

    expect(insertedImports[0]).toMatchObject({
      source: "ACCOUNT",
      coverageStart: "2026-11-08",
      coverageEnd: "2026-11-14",
    });
    expect(insertedEntries[0]).toMatchObject({
      channel: "ACCOUNT",
      sourceCategory: null,
      cardSettlementStatus: null,
      actualDate: "2026-11-14",
    });
    expect(update).toHaveBeenCalledOnce();
    expect(markDatesForReview).toHaveBeenCalledWith(
      expect.any(Object),
      "owner-card-import",
      ["2026-11-14"],
    );
  });

  it("imports an account invoice as one ordinary expense", async () => {
    const insertedEntries: Array<Record<string, unknown>> = [];
    let selectIndex = 0;
    const select = vi.fn(() => {
      const current = selectIndex++;
      return {
        from: () => ({
          where: () =>
            current === 0 ? Promise.resolve([]) : { limit: async () => [] },
        }),
      };
    });
    let insertIndex = 0;
    const insert = vi.fn(() => {
      const current = insertIndex++;
      return {
        values: (value: Record<string, unknown>) => {
          if (current === 2) insertedEntries.push(value);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id: `row-${current}` }],
            }),
            returning: async () => [{ id: "account-invoice-entry" }],
          };
        },
      };
    });
    const update = vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert, update, execute: vi.fn() }),
    );

    await expect(
      runWithDataOwner("owner-account-invoice", () =>
        repository.confirm({
          fileHash: "e".repeat(64),
          rememberCategories: false,
          rows: [
            {
              sourceRow: 8,
              kind: "EXPENSE",
              description: "Pagamento fatura cartão",
              categoryId: "123e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-20",
              actualAmount: 100,
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({ importedCount: 1, duplicateCount: 0 });
    expect(insertedEntries[0]).toMatchObject({
      channel: "ACCOUNT",
      cardSettlementStatus: null,
      kind: "EXPENSE",
      actualAmount: "100.00",
    });
  });

  it("rejects reusing a file hash under a different source", async () => {
    let selectIndex = 0;
    const select = vi.fn(() => {
      const current = selectIndex++;
      return {
        from: () => ({
          where: () =>
            current === 0
              ? Promise.resolve([])
              : {
                  limit: async () => [{ id: "prior-import", source: "CARD" }],
                },
        }),
      };
    });
    const insert = vi.fn();
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert, execute: vi.fn() }),
    );

    await expect(
      runWithDataOwner("owner-cross-source", () =>
        repository.confirm({
          fileHash: "f".repeat(64),
          source: "ACCOUNT",
          rememberCategories: false,
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Conta de luz",
              categoryId: "123e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-20",
              actualAmount: 50,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(insert).not.toHaveBeenCalled();
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
      callback({ select, insert, execute: vi.fn().mockResolvedValue([]) }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "d".repeat(64),
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
            return selectCount === 1
              ? []
              : [{ id: "concurrent-import", source: "ACCOUNT" }];
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
      callback({ select, insert, execute: vi.fn().mockResolvedValue([]) }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "f".repeat(64),
          rememberCategories: false,
          rows: [],
        }),
      ),
    ).resolves.toEqual({
      importedCount: 0,
      alreadyImportedCount: 0,
      duplicateCount: 0,
    });
    expect(selectCount).toBe(2);
    expect(markDatesForReview).toHaveBeenCalledWith(
      expect.any(Object),
      "owner-a",
      [],
    );
  });

  it("rejects a concurrent file-hash reservation created for another source", async () => {
    let selectCount = 0;
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCount += 1;
            return selectCount === 1
              ? []
              : [{ id: "concurrent-card-import", source: "CARD" }];
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
      callback({ select, insert, execute: vi.fn().mockResolvedValue([]) }),
    );

    await expect(
      runWithDataOwner("owner-race", () =>
        repository.confirm({
          fileHash: "a".repeat(64),
          source: "ACCOUNT",
          rememberCategories: false,
          rows: [],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(selectCount).toBe(2);
  });

  it("fails the transaction when a reserved row cannot create its financial entry", async () => {
    const select = createConfirmSelectMock({ hasRows: true });
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
      callback({ select, insert, execute: vi.fn().mockResolvedValue([]) }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "e".repeat(64),
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

  it("rejects a genuinely new row without a category", async () => {
    const select = createConfirmSelectMock({ hasRows: true });
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [
            { id: `reserved-${insert.mock.calls.length}` },
          ],
        }),
        returning: async () => [{ id: "entry" }],
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert, execute: vi.fn() }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "e".repeat(64),
          rememberCategories: true,
          rows: [
            {
              sourceRow: 2,
              kind: "EXPENSE",
              description: "Mercado",
              categoryId: null,
              actualDate: "2026-11-14",
              actualAmount: 12.5,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      message: "Escolha uma categoria para cada lançamento novo.",
      statusCode: 400,
    });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("skips only the matching existing occurrences while importing excess identical rows", async () => {
    const existing = [
      {
        kind: "EXPENSE",
        description: "Mercado",
        actualDate: "2026-11-14",
        actualAmount: "12.50",
      },
      {
        kind: "EXPENSE",
        description: " MERCADO ",
        actualDate: "2026-11-14",
        actualAmount: "12.50",
      },
    ];
    const select = createConfirmSelectMock({
      hasRows: true,
      signatures: existing,
    });
    let insertIndex = 0;
    const insert = vi.fn(() => {
      const current = insertIndex++;
      return {
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: `row-${current}` }],
          }),
          returning: async () => [{ id: "entry-new" }],
        }),
      };
    });
    const execute = vi.fn().mockResolvedValue([]);
    database.transaction.mockImplementation(async (callback) =>
      callback({
        select,
        insert,
        execute,
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      }),
    );
    markDatesForReview.mockResolvedValue(undefined);

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "9".repeat(64),
          rememberCategories: false,
          rows: [1, 2, 3].map((sourceRow) => ({
            sourceRow,
            kind: "EXPENSE" as const,
            description: "Mercado",
            categoryId: "123e4567-e89b-42d3-a456-426614174000",
            actualDate: "2026-11-14",
            actualAmount: 12.5,
          })),
        }),
      ),
    ).resolves.toEqual({
      importedCount: 1,
      alreadyImportedCount: 0,
      duplicateCount: 2,
    });

    expect(acquireMonthLocks).toHaveBeenCalledWith(
      expect.any(Object),
      "owner-a",
      ["2026-11"],
    );
    expect(acquireFinancialWriteLock.mock.invocationCallOrder[0]).toBeLessThan(
      acquireMonthLocks.mock.invocationCallOrder[0],
    );
    expect(insert).toHaveBeenCalledTimes(5);
    expect(markDatesForReview).toHaveBeenCalledWith(
      expect.any(Object),
      "owner-a",
      ["2026-11-14"],
    );
  });

  it("remembers confirmed exact-description category choices per owner", async () => {
    const insertedChoices: Array<Record<string, unknown>> = [];
    const conflictConfigs: Array<Record<string, unknown>> = [];
    const select = createConfirmSelectMock({ hasRows: true });
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
    const transaction = {
      select,
      insert,
      update,
      execute: vi.fn().mockResolvedValue([]),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    markDatesForReview.mockResolvedValue(undefined);

    await runWithDataOwner("owner-a", () =>
      repository.confirm({
        fileHash: "a".repeat(64),
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
      select: createConfirmSelectMock({ hasRows: true }),
      insert,
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      execute: vi.fn().mockResolvedValue([]),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await runWithDataOwner("owner-b", () =>
      repository.confirm({
        fileHash: "b".repeat(64),
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

  it("does not recreate a previously imported row or remember its unreviewed category", async () => {
    const select = createConfirmSelectMock({
      hasRows: true,
      imported: [{ id: "existing-import" }],
    });
    const insert = vi.fn().mockImplementationOnce(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({
        select,
        insert,
        update: vi.fn(),
        execute: vi.fn().mockResolvedValue([]),
      }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "c".repeat(64),
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
    ).resolves.toEqual({
      importedCount: 0,
      alreadyImportedCount: 1,
      duplicateCount: 0,
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(markDatesForReview).toHaveBeenCalledOnce();
  });

  it("does not remember a category from a skipped duplicate row", async () => {
    const select = createConfirmSelectMock({
      hasRows: true,
      signatures: [
        {
          kind: "EXPENSE",
          description: "Mercado",
          actualDate: "2026-11-14",
          actualAmount: "12.50",
        },
      ],
    });
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [{ id: "row" }] }),
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({
        select,
        insert,
        execute: vi.fn(),
        update: vi.fn(),
      }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "c".repeat(64),
          rememberCategories: true,
          rows: [
            {
              sourceRow: 6,
              kind: "EXPENSE",
              description: "Mercado",
              categoryId: "223e4567-e89b-42d3-a456-426614174000",
              actualDate: "2026-11-14",
              actualAmount: 12.5,
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({ importedCount: 0, duplicateCount: 1 });

    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("asks for a fresh preview if a previously duplicated row disappears", async () => {
    const select = createConfirmSelectMock({ hasRows: true });
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [{ id: "row" }] }),
      }),
    }));
    database.transaction.mockImplementation(async (callback) =>
      callback({ select, insert, execute: vi.fn() }),
    );

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.confirm({
          fileHash: "b".repeat(64),
          rememberCategories: true,
          rows: [
            {
              sourceRow: 6,
              kind: "EXPENSE",
              description: "Mercado",
              categoryId: null,
              possibleDuplicate: true,
              actualDate: "2026-11-14",
              actualAmount: 12.5,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Os lançamentos repetidos mudaram desde a revisão. Confira o extrato novamente.",
    });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
