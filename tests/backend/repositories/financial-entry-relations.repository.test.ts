import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  userId: "owner-a",
  selectedRows: [] as unknown[][],
  selects: [] as unknown[],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  transaction: {} as Record<string, ReturnType<typeof vi.fn>>,
  database: {} as Record<string, ReturnType<typeof vi.fn>>,
  acquireWriteLock: vi.fn(),
  acquireMonthLocks: vi.fn(),
  markDatesForReview: vi.fn(),
}));

vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => state.userId,
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => state.database,
}));
vi.mock("@/backend/repositories/financial-month-close.repository", () => ({
  financialMonthCloseRepository: {
    acquireFinancialWriteLock: state.acquireWriteLock,
    acquireMonthLocks: state.acquireMonthLocks,
    markDatesForReview: state.markDatesForReview,
  },
}));

import { FinancialEntryRelationsRepository } from "@/backend/repositories/financial-entry-relations.repository";

const ids = {
  expense: "11111111-1111-4111-8111-111111111111",
  income: "22222222-2222-4222-8222-222222222222",
  otherExpense: "33333333-3333-4333-8333-333333333333",
  refund: "44444444-4444-4444-8444-444444444444",
  priorRefund: "55555555-5555-4555-8555-555555555555",
};

function financialEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: state.userId,
    channel: "ACCOUNT",
    kind: "EXPENSE",
    actualAmount: "100.00",
    actualDate: "2026-10-31",
    accountAlias: "Inter",
    reviewStatus: "NONE",
    ...overrides,
  };
}

function selectBuilder() {
  return {
    from: vi.fn(() => ({
      where: vi.fn((condition: unknown) => {
        state.selects.push(condition);
        return Promise.resolve(state.selectedRows.shift() ?? []);
      }),
    })),
  };
}

describe("FinancialEntryRelationsRepository", () => {
  const repository = new FinancialEntryRelationsRepository();

  beforeEach(() => {
    vi.resetAllMocks();
    state.userId = "owner-a";
    state.selectedRows = [];
    state.selects = [];
    state.inserts = [];
    state.updates = [];
    state.transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => selectBuilder()),
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          state.inserts.push(value);
          return {
            returning: vi.fn().mockResolvedValue([{ id: "relation-id" }]),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(() => {
            state.updates.push(value);
            return Promise.resolve(undefined);
          }),
        })),
      })),
    };
    state.database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([{ id: "visible-relation" }]),
            })),
          })),
        })),
      })),
      transaction: vi.fn((callback: (transaction: unknown) => unknown) =>
        callback(state.transaction),
      ),
    };
  });

  it("returns no relations when the entry list is empty", async () => {
    await expect(repository.listForEntries([])).resolves.toEqual([]);
    expect(state.database.select).not.toHaveBeenCalled();
  });

  it("lists owner-scoped relations for requested entries", async () => {
    await expect(repository.listForEntries([ids.expense])).resolves.toEqual([
      { id: "visible-relation" },
    ]);
    expect(state.database.select).toHaveBeenCalledOnce();
  });

  it("confirms a transfer explicitly and marks both months for review", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.expense, {
          actualAmount: "25.00",
          actualDate: "2026-10-31",
          accountAlias: "Inter",
        }),
        financialEntry(ids.income, {
          kind: "INCOME",
          actualAmount: "25.00",
          actualDate: "2026-11-01",
          accountAlias: "PagBank",
        }),
      ],
      [],
    ];

    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      }),
    ).resolves.toEqual({ id: "relation-id", kind: "TRANSFER" });
    expect(state.acquireWriteLock).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
    );
    expect(state.acquireMonthLocks).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
      ["2026-10", "2026-11"],
    );
    expect(state.markDatesForReview).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
      ["2026-10-31", "2026-11-01"],
    );
    expect(state.inserts).toEqual([
      {
        userId: "owner-a",
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      },
    ]);
  });

  it("does not relate another owner's rows", async () => {
    state.selectedRows = [[]];

    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const ownerScopedQuery = new PgDialect().sqlToQuery(
      state.selects[0] as never,
    );
    expect(ownerScopedQuery.params).toContain("owner-a");
    expect(state.inserts).toHaveLength(0);
  });

  it("explicitly dismisses a pending refund as income and marks its month", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          reviewStatus: "REVERSAL_PENDING",
          actualAmount: "8.91",
          actualDate: "2026-11-06",
        }),
      ],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL_DISMISSED",
        entryId: ids.refund,
      }),
    ).resolves.toEqual({ id: ids.refund, kind: "REVERSAL_DISMISSED" });
    expect(state.updates).toContainEqual({
      reviewStatus: "REVERSAL_DISMISSED",
      updatedAt: expect.any(Date),
    });
    expect(state.acquireMonthLocks).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
      ["2026-11"],
    );
    expect(state.markDatesForReview).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
      ["2026-11-06"],
    );
    expect(state.inserts).toHaveLength(0);
  });

  it.each([
    { entries: [] as unknown[], expectedStatus: 404 },
    {
      entries: [financialEntry(ids.refund, { kind: "EXPENSE" })],
      expectedStatus: 409,
    },
  ])(
    "rejects dismissing a missing or non-pending entry",
    async ({ entries, expectedStatus }) => {
      state.selectedRows = [entries];
      await expect(
        repository.create({
          kind: "REVERSAL_DISMISSED",
          entryId: ids.refund,
        }),
      ).rejects.toMatchObject({ statusCode: expectedStatus });
      expect(state.updates).toHaveLength(0);
    },
  );

  it("rejects an entry already used by another transfer", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.expense),
        financialEntry(ids.income, {
          kind: "INCOME",
          accountAlias: "PagBank",
        }),
      ],
      [
        {
          kind: "TRANSFER",
          entryId: ids.expense,
          relatedEntryId: ids.otherExpense,
        },
      ],
    ];

    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects using either side of a reversal in a transfer", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.expense),
        financialEntry(ids.refund, {
          kind: "INCOME",
          accountAlias: "PagBank",
        }),
      ],
      [
        {
          kind: "REVERSAL",
          entryId: ids.refund,
          relatedEntryId: ids.otherExpense,
        },
      ],
    ];

    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.refund,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.inserts).toHaveLength(0);
  });

  it("does not treat a pending reversal credit as the receiving side of a transfer", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.expense, { accountAlias: "Inter" }),
        financialEntry(ids.income, {
          kind: "INCOME",
          accountAlias: "PagBank",
          reviewStatus: "REVERSAL_PENDING",
        }),
      ],
      [],
    ];

    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(state.inserts).toHaveLength(0);
  });

  it("requires both related entries to have actual values and dates", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.expense, { actualDate: null }),
        financialEntry(ids.income, {
          kind: "INCOME",
          accountAlias: "PagBank",
        }),
      ],
    ];
    await expect(
      repository.create({
        kind: "TRANSFER",
        entryId: ids.expense,
        relatedEntryId: ids.income,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a refund linked to an expense that is already a transfer", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualAmount: "20.00",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, { actualDate: "2026-10-31" }),
      ],
      [
        {
          kind: "TRANSFER",
          entryId: ids.expense,
          relatedEntryId: ids.otherExpense,
        },
      ],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a refund credit that is already part of a transfer", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualAmount: "20.00",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, { actualDate: "2026-10-31" }),
      ],
      [
        {
          kind: "TRANSFER",
          entryId: ids.refund,
          relatedEntryId: ids.otherExpense,
        },
      ],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects non-income or non-expense reversal pairs", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, {
          kind: "INCOME",
          actualDate: "2026-10-31",
        }),
      ],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects linking a reversal credit that is already linked", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, { actualDate: "2026-10-31" }),
      ],
      [
        {
          kind: "REVERSAL",
          entryId: ids.refund,
          relatedEntryId: ids.otherExpense,
        },
      ],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a refund that would exceed the expense after previous partial refunds", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualAmount: "31.00",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, {
          actualAmount: "100.00",
          actualDate: "2026-10-31",
        }),
      ],
      [
        {
          kind: "REVERSAL",
          entryId: ids.priorRefund,
          relatedEntryId: ids.expense,
        },
      ],
      [{ actualAmount: "70.00" }],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(state.inserts).toHaveLength(0);
  });

  it("treats a null legacy refund amount as zero when checking the remaining expense", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualAmount: "20.00",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, {
          actualAmount: "100.00",
          actualDate: "2026-10-31",
        }),
      ],
      [
        {
          kind: "REVERSAL",
          entryId: ids.priorRefund,
          relatedEntryId: ids.expense,
        },
      ],
      [{ actualAmount: null }],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).resolves.toMatchObject({ kind: "REVERSAL" });
  });

  it("links a pending refund and clears its pending state after validation", async () => {
    state.selectedRows = [
      [
        financialEntry(ids.refund, {
          kind: "INCOME",
          actualAmount: "20.00",
          actualDate: "2026-11-05",
          reviewStatus: "REVERSAL_PENDING",
        }),
        financialEntry(ids.expense, {
          actualAmount: "100.00",
          actualDate: "2026-10-31",
        }),
      ],
      [],
    ];

    await expect(
      repository.create({
        kind: "REVERSAL",
        entryId: ids.refund,
        relatedEntryId: ids.expense,
      }),
    ).resolves.toMatchObject({ kind: "REVERSAL" });
    expect(state.updates).toEqual([
      { reviewStatus: "NONE", updatedAt: expect.any(Date) },
    ]);
    expect(state.markDatesForReview).toHaveBeenCalledWith(
      state.transaction,
      "owner-a",
      ["2026-11-05", "2026-10-31"],
    );
  });
});
