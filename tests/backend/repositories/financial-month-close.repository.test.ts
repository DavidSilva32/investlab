import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  userId: "owner-a",
  databaseSelectRows: [] as unknown[][],
  transactionSelectRows: [] as unknown[][],
  inserted: [] as Array<{ table: string; value: unknown }>,
  updated: [] as Array<{ table: string; value: unknown; where: unknown }>,
  transaction: {} as Record<string, ReturnType<typeof vi.fn>>,
  database: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

function selectBuilder(rows: unknown[][], transaction = false) {
  const limit = vi.fn().mockImplementation(async () => rows.shift() ?? []);
  const orderBy = vi.fn(() => {
    return {
      limit: vi.fn().mockImplementation(async () => rows.shift() ?? []),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows.shift() ?? []).then(resolve, reject),
    };
  });
  const forUpdate = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ for: forUpdate, limit, orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit, orderBy, forUpdate, transaction };
}

vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => state.userId,
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => state.database,
}));

import { FinancialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";

describe("FinancialMonthCloseRepository", () => {
  const repository = new FinancialMonthCloseRepository();
  const totals = {
    expectedIncome: "1000.00",
    realizedIncome: "950.00",
    expectedExpenses: "500.00",
    realizedExpenses: "525.00",
    expectedBalance: "500.00",
    recordedBalance: "425.00",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    state.databaseSelectRows = [];
    state.transactionSelectRows = [];
    state.inserted = [];
    state.updated = [];
    state.database = {
      select: vi.fn(() => selectBuilder(state.databaseSelectRows)),
      transaction: vi.fn(async (callback) => callback(state.transaction)),
    };
    state.transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => selectBuilder(state.transactionSelectRows, true)),
      update: vi.fn((table) => ({
        set: vi.fn((value) => ({
          where: vi.fn((condition) => {
            state.updated.push({
              table: getTableName(table),
              value,
              where: condition,
            });
            const result = Promise.resolve(undefined);
            return Object.assign(result, {
              returning: vi.fn().mockResolvedValue([
                {
                  id: "closure-id",
                  userId: state.userId,
                  month: "2026-10",
                  status: "CLOSED",
                  currentVersion: 2,
                  closedAt: new Date("2026-11-01T12:00:00Z"),
                  updatedAt: new Date("2026-11-01T12:00:00Z"),
                },
              ]),
            });
          }),
        })),
      })),
      insert: vi.fn((table) => ({
        values: vi.fn((value) => {
          state.inserted.push({ table: getTableName(table), value });
          const query = Promise.resolve(undefined);
          return Object.assign(query, {
            returning: vi.fn().mockResolvedValue([
              {
                id: "closure-id",
                userId: state.userId,
                month: "2026-10",
                status: "CLOSED",
                currentVersion: 1,
                closedAt: new Date("2026-11-01T12:00:00Z"),
                updatedAt: new Date("2026-11-01T12:00:00Z"),
              },
            ]),
          });
        }),
      })),
    };
  });

  it("locks each affected month and marks only existing owner closes for review", async () => {
    await repository.markDatesForReview(
      state.transaction as never,
      state.userId,
      ["2026-10-01", "2026-10-29", "2026-09-30", null],
    );
    expect(state.transaction.execute).toHaveBeenCalledTimes(2);
    expect(state.updated).toHaveLength(1);
    expect(state.updated[0].table).toBe("financial_monthly_closures");
    expect(state.updated[0].value).toMatchObject({ status: "NEEDS_REVIEW" });
    expect(
      new PgDialect().sqlToQuery(state.updated[0].where as never).params,
    ).toEqual(expect.arrayContaining([state.userId, "2026-09", "2026-10"]));
  });

  it("does not lock or update when a mutation has no dated amount", async () => {
    await repository.markDatesForReview(
      state.transaction as never,
      state.userId,
      [null, undefined],
    );
    expect(state.transaction.execute).not.toHaveBeenCalled();
    expect(state.transaction.update).not.toHaveBeenCalled();
  });

  it("creates a first close and appends an immutable version", async () => {
    state.transactionSelectRows = [[]];
    const result = await repository.closeMonth("2026-10", async () => totals);
    expect(result).toEqual({
      status: "closed",
      closedAt: expect.any(String),
      totals,
      history: [],
    });
    expect(state.transaction.execute).toHaveBeenCalledOnce();
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0]).toMatchObject({
      table: "financial_monthly_closures",
      value: {
        userId: state.userId,
        month: "2026-10",
        status: "CLOSED",
        currentVersion: 1,
      },
    });
    expect(state.inserted[1]).toMatchObject({
      table: "financial_monthly_closure_versions",
      value: { closureId: "closure-id", version: 1, totals },
    });
  });

  it("re-closes by appending the next version after a transaction lock", async () => {
    state.transactionSelectRows = [
      [
        {
          id: "closure-id",
          userId: state.userId,
          month: "2026-10",
          status: "NEEDS_REVIEW",
          currentVersion: 1,
          closedAt: new Date("2026-11-01T12:00:00Z"),
          updatedAt: new Date("2026-11-01T12:00:00Z"),
        },
      ],
    ];
    await repository.closeMonth("2026-10", async () => totals);
    expect(state.transaction.update).toHaveBeenCalledOnce();
    expect(state.updated[0].table).toBe("financial_monthly_closures");
    expect(state.updated[0].value).toMatchObject({
      status: "CLOSED",
      currentVersion: 2,
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      table: "financial_monthly_closure_versions",
      value: { closureId: "closure-id", version: 2, totals },
    });
  });

  it("returns null when no close or current version exists", async () => {
    state.databaseSelectRows = [[]];
    await expect(repository.getCurrent("2026-10")).resolves.toBeNull();
    state.databaseSelectRows = [
      [
        {
          id: "closure-id",
          month: "2026-10",
          status: "CLOSED",
          currentVersion: 1,
          closedAt: new Date("2026-11-01T12:00:00Z"),
        },
      ],
      [],
    ];
    await expect(repository.getCurrent("2026-10")).resolves.toBeNull();
  });

  it("loads the current close status and lists all saved versions", async () => {
    const closedAt = new Date("2026-11-01T12:00:00Z");
    const previousClosedAt = new Date("2026-10-31T12:00:00Z");
    const versionRow = { totals, version: 1 };
    state.databaseSelectRows = [
      [
        {
          id: "closure-id",
          month: "2026-10",
          status: "NEEDS_REVIEW",
          currentVersion: 1,
          closedAt,
        },
      ],
      [{ totals }],
      [{ closedAt: previousClosedAt, totals }],
      [{ id: "closure-id" }],
      [versionRow],
    ];
    await expect(repository.getCurrent("2026-10")).resolves.toEqual({
      status: "needs_review",
      closedAt: closedAt.toISOString(),
      totals,
      history: [{ closedAt: previousClosedAt.toISOString(), totals }],
    });
    await expect(repository.listVersions("2026-10")).resolves.toEqual([
      versionRow,
    ]);
  });

  it("returns an empty history if the month has never been closed", async () => {
    state.databaseSelectRows = [[]];
    await expect(repository.listVersions("2026-10")).resolves.toEqual([]);
  });
});
