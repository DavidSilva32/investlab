import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  closeRepository: {
    acquireFinancialWriteLock: vi.fn(),
    acquireMonthLocks: vi.fn(),
    markDatesForReview: vi.fn(),
  },
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => ({ transaction: mocks.transaction }),
}));
vi.mock("@/backend/repositories/financial-month-close.repository", () => ({
  financialMonthCloseRepository: mocks.closeRepository,
}));

import { FinancialRepository } from "@/backend/repositories/financial.repository";

const settlementId = "11111111-1111-4111-8111-111111111111";
const cardEntryId = "22222222-2222-4222-8222-222222222222";

function configureLinkedMutation(mode: "update" | "delete") {
  const selectedRows = [
    [{ expectedDate: null, actualDate: "2026-11-20" }],
    [{ settlementEntryId: settlementId }],
    [{ cardEntryId }],
    [
      { expectedDate: null, actualDate: "2026-11-20" },
      { expectedDate: null, actualDate: "2026-11-10" },
    ],
    [{ expectedDate: null, actualDate: "2026-11-20" }],
  ];
  let selectIndex = 0;
  const select = vi.fn(() => {
    const rows = selectedRows[selectIndex++] ?? [];
    const query: Record<string, unknown> = {
      from: () => query,
      where: (predicate: unknown) => {
        query.predicate = predicate;
        return query;
      },
      for: () => query,
      limit: async () => rows,
      then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
    };
    return query;
  });
  const writes: Array<{
    table: string;
    values?: Record<string, unknown>;
    where?: unknown;
  }> = [];
  const update = vi.fn((table) => ({
    set: (values: Record<string, unknown>) => ({
      where: (predicate: unknown) => {
        writes.push({ table: getTableName(table), values, where: predicate });
        return "cardSettlementStatus" in values
          ? Promise.resolve([])
          : { returning: async () => [{ id: "updated-entry" }] };
      },
    }),
  }));
  const deleteRows: Array<{ table: string; where?: unknown }> = [];
  const remove = vi.fn((table) => ({
    where: (predicate: unknown) => {
      deleteRows.push({ table: getTableName(table), where: predicate });
      return mode === "delete" && getTableName(table) === "financial_entries"
        ? { returning: async () => [{ id: "deleted-entry" }] }
        : Promise.resolve(undefined);
    },
  }));
  const transaction = {
    execute: vi.fn().mockResolvedValue(undefined),
    select,
    update,
    delete: remove,
  };
  mocks.transaction.mockImplementation(async (callback) =>
    callback(transaction),
  );
  return { transaction, writes, deleteRows, select };
}

describe("FinancialRepository linked card settlement invalidation", () => {
  const repository = new FinancialRepository();

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.closeRepository.acquireFinancialWriteLock.mockResolvedValue(
      undefined,
    );
    mocks.closeRepository.acquireMonthLocks.mockResolvedValue(undefined);
    mocks.closeRepository.markDatesForReview.mockResolvedValue(undefined);
  });

  const entryInput = {
    kind: "EXPENSE",
    description: "Compra corrigida",
    categoryId: "category-id",
    expectedAmount: null,
    expectedDate: null,
    actualAmount: "40.00",
    actualDate: "2026-11-11",
  };

  it("resets a linked invoice before editing a linked card purchase", async () => {
    const { writes, deleteRows, select } = configureLinkedMutation("update");

    await expect(
      runWithDataOwner("owner-settlement-edit", () =>
        repository.updateEntry(cardEntryId, entryInput),
      ),
    ).resolves.toEqual({ id: "updated-entry" });

    expect(
      writes.map(({ table, values }) => ({
        table,
        values: values && { ...values, updatedAt: "timestamp" },
      })),
    ).toEqual([
      {
        table: "financial_entries",
        values: { cardSettlementStatus: "AGGREGATE", updatedAt: "timestamp" },
      },
      {
        table: "financial_entries",
        values: { ...entryInput, updatedAt: "timestamp" },
      },
    ]);
    expect(deleteRows.map((row) => row.table)).toEqual([
      "financial_card_settlement_links",
    ]);
    expect(select).toHaveBeenCalledTimes(5);
    expect(mocks.closeRepository.acquireMonthLocks).toHaveBeenCalledWith(
      expect.anything(),
      "owner-settlement-edit",
      ["2026-11", "2026-11", "2026-11", "2026-11"],
    );
    expect(mocks.closeRepository.markDatesForReview).toHaveBeenCalledWith(
      expect.anything(),
      "owner-settlement-edit",
      [
        null,
        "2026-11-20",
        null,
        "2026-11-11",
        null,
        "2026-11-20",
        null,
        "2026-11-10",
      ],
    );
    const linkQuery = select.mock.results[1].value as { predicate: unknown };
    expect(
      new PgDialect().sqlToQuery(linkQuery.predicate as never).params,
    ).toContain("owner-settlement-edit");
  });

  it("resets a linked invoice before editing the invoice payment", async () => {
    const { writes, deleteRows } = configureLinkedMutation("update");

    await expect(
      runWithDataOwner("owner-invoice-edit", () =>
        repository.updateEntry(settlementId, entryInput),
      ),
    ).resolves.toEqual({ id: "updated-entry" });
    expect(writes[0]).toMatchObject({
      table: "financial_entries",
      values: { cardSettlementStatus: "AGGREGATE" },
    });
    expect(deleteRows.map((row) => row.table)).toEqual([
      "financial_card_settlement_links",
    ]);
    expect(mocks.closeRepository.markDatesForReview).toHaveBeenCalledWith(
      expect.anything(),
      "owner-invoice-edit",
      expect.arrayContaining(["2026-11-20", "2026-11-10", "2026-11-11"]),
    );
  });

  it("resets a linked invoice before deleting the linked settlement payment", async () => {
    const { writes, deleteRows } = configureLinkedMutation("delete");

    await expect(
      runWithDataOwner("owner-settlement-delete", () =>
        repository.deleteEntry(settlementId),
      ),
    ).resolves.toEqual({ id: "deleted-entry" });

    expect(writes[0]).toMatchObject({
      table: "financial_entries",
      values: { cardSettlementStatus: "AGGREGATE" },
    });
    expect(deleteRows.map((row) => row.table)).toEqual([
      "financial_card_settlement_links",
      "financial_entries",
    ]);
    expect(mocks.closeRepository.markDatesForReview).toHaveBeenCalledWith(
      expect.anything(),
      "owner-settlement-delete",
      [null, "2026-11-20", null, "2026-11-20", null, "2026-11-10"],
    );
  });

  it("resets a linked invoice before deleting a card purchase", async () => {
    const { writes, deleteRows } = configureLinkedMutation("delete");

    await expect(
      runWithDataOwner("owner-card-delete", () =>
        repository.deleteEntry(cardEntryId),
      ),
    ).resolves.toEqual({ id: "deleted-entry" });
    expect(writes[0]).toMatchObject({
      table: "financial_entries",
      values: { cardSettlementStatus: "AGGREGATE" },
    });
    expect(deleteRows.map((row) => row.table)).toEqual([
      "financial_card_settlement_links",
      "financial_entries",
    ]);
    expect(mocks.closeRepository.markDatesForReview).toHaveBeenCalledWith(
      expect.anything(),
      "owner-card-delete",
      expect.arrayContaining(["2026-11-20", "2026-11-10"]),
    );
  });
});
