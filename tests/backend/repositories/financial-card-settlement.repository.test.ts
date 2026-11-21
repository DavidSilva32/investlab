import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const { database, transaction, closeRepository } = vi.hoisted(() => {
  const transaction = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    database: { select: vi.fn(), transaction: vi.fn() },
    transaction,
    closeRepository: {
      acquireFinancialWriteLock: vi.fn(),
      acquireMonthLocks: vi.fn(),
      markDatesForReview: vi.fn(),
    },
  };
});

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/backend/repositories/financial-month-close.repository", () => ({
  financialMonthCloseRepository: closeRepository,
}));

import { FinancialCardSettlementRepository } from "@/backend/repositories/financial-card-settlement.repository";

const settlementId = "11111111-1111-4111-8111-111111111111";
const firstCardId = "22222222-2222-4222-8222-222222222222";
const secondCardId = "33333333-3333-4333-8333-333333333333";

function configureTransaction(selectRows: unknown[][]) {
  let index = 0;
  transaction.select.mockImplementation(() => {
    const rows = selectRows[index++] ?? [];
    const query: Record<string, unknown> = {
      from: () => query,
      innerJoin: () => query,
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
  transaction.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  transaction.update.mockReturnValue({
    set: () => ({ where: vi.fn().mockResolvedValue([]) }),
  });
  database.transaction.mockImplementation(
    async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
  );
}

describe("FinancialCardSettlementRepository", () => {
  const repository = new FinancialCardSettlementRepository();

  beforeEach(() => {
    vi.resetAllMocks();
    closeRepository.acquireFinancialWriteLock.mockResolvedValue(undefined);
    closeRepository.acquireMonthLocks.mockResolvedValue(undefined);
    closeRepository.markDatesForReview.mockResolvedValue(undefined);
  });

  it("lists account invoices and unlinked card purchases for the active owner", async () => {
    const settlements = [{ id: settlementId, actualAmount: "100.00" }];
    const cardEntries = [{ id: firstCardId, actualAmount: "100.00" }];
    const predicates: unknown[] = [];
    let selectIndex = 0;
    database.select.mockImplementation(() => {
      const rows = selectIndex++ === 0 ? settlements : cardEntries;
      const query: Record<string, unknown> = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: (predicate: unknown) => {
          predicates.push(predicate);
          return query;
        },
        orderBy: async () => rows,
      };
      return query;
    });

    await expect(
      runWithDataOwner("owner-review", () => repository.listReview()),
    ).resolves.toEqual({ settlements, cardEntries });
    expect(predicates).toHaveLength(2);
    for (const predicate of predicates) {
      expect(new PgDialect().sqlToQuery(predicate as never).params).toContain(
        "owner-review",
      );
    }
  });

  it.each([
    ["one cent less", "59.99"],
    ["one cent more", "60.01"],
  ])("rejects a linked selection that is %s", async (_label, amount) => {
    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: "100.00" }],
      [
        { id: firstCardId, actualDate: "2026-11-10", actualAmount: "40.00" },
        { id: secondCardId, actualDate: "2026-11-12", actualAmount: amount },
      ],
    ]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "LINKED",
          cardEntryIds: [firstCardId, secondCardId],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing settlement amount", null],
    ["an amount that cannot be represented in cents", "not-a-number"],
  ])("rejects %s without creating a link", async (_label, amount) => {
    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: amount }],
      [{ id: firstCardId, actualDate: "2026-11-10", actualAmount: "100.00" }],
    ]);

    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "LINKED",
          cardEntryIds: [firstCardId],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("persists only the exact amount link for the current owner", async () => {
    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: "100" }],
      [
        { id: firstCardId, actualDate: "2026-11-10", actualAmount: "40" },
        {
          id: secondCardId,
          actualDate: "2026-11-12",
          actualAmount: "60",
        },
      ],
      [],
    ]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "LINKED",
          cardEntryIds: [firstCardId, secondCardId],
        }),
      ),
    ).resolves.toEqual({ resolution: "LINKED" });
    expect(transaction.insert).toHaveBeenCalledOnce();
    expect(transaction.update).toHaveBeenCalledOnce();
    const settlementQuery = transaction.select.mock.results[0].value;
    const predicate = settlementQuery.predicate;
    expect(new PgDialect().sqlToQuery(predicate).params).toContain("owner-a");
    expect(closeRepository.markDatesForReview).toHaveBeenCalledWith(
      transaction,
      "owner-a",
      ["2026-11-20", "2026-11-10", "2026-11-12"],
    );
  });

  it("rejects stale settlements, cross-owner card IDs, and already-linked purchases", async () => {
    configureTransaction([[]]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "NOT_RELATED",
          cardEntryIds: [],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: "100.00" }],
      [],
    ]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "LINKED",
          cardEntryIds: [firstCardId],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();

    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: "40.00" }],
      [{ id: firstCardId, actualDate: "2026-11-10", actualAmount: "40.00" }],
      [{ cardEntryId: firstCardId }],
    ]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "LINKED",
          cardEntryIds: [firstCardId],
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("allows an explicit no-match decision without hiding the account outflow", async () => {
    configureTransaction([
      [{ actualDate: "2026-11-20", actualAmount: "100.00" }],
    ]);
    await expect(
      runWithDataOwner("owner-b", () =>
        repository.resolve({
          settlementEntryId: settlementId,
          resolution: "NOT_RELATED",
          cardEntryIds: [],
        }),
      ),
    ).resolves.toEqual({ resolution: "NOT_RELATED" });
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalledOnce();
  });
});
