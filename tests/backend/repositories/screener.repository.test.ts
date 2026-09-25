import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerMarketRefreshRuns,
  screenerMarketSnapshots,
  screenerSecurities,
} from "@/infrastructure/database/schema";

const mocks = vi.hoisted(() => ({ getDatabaseClient: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: mocks.getDatabaseClient,
}));

import { ScreenerRepository } from "@/backend/repositories/screener.repository";

function setup(results: Map<unknown, unknown[]>) {
  const predicates = new Map<unknown, unknown>();
  const orderings = new Map<unknown, unknown>();
  const database = {
    select: vi.fn(() => {
      let table: unknown;
      const builder = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where(condition: unknown) {
          predicates.set(table, condition);
          return builder;
        },
        limit() {
          return builder;
        },
        orderBy(condition: unknown) {
          orderings.set(table, condition);
          return builder;
        },
        then(
          resolve: (value: unknown[]) => unknown,
          reject: (error: unknown) => unknown,
        ) {
          return Promise.resolve(results.get(table) ?? []).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    }),
  };
  mocks.getDatabaseClient.mockReturnValue(database);
  return { database, predicates, orderings };
}

const sqlFor = (expression: unknown) =>
  new PgDialect().sqlToQuery(expression as SQL);

describe("ScreenerRepository", () => {
  beforeEach(() => mocks.getDatabaseClient.mockReset());

  it("reports whether any ingestion run completed successfully", async () => {
    const makeDatabase = (rows: unknown[]) => ({
      select: vi.fn(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      })),
    });
    mocks.getDatabaseClient.mockReturnValue(makeDatabase([{ id: "run-1" }]));
    await expect(new ScreenerRepository().hasSuccessfulSync()).resolves.toBe(
      true,
    );
    mocks.getDatabaseClient.mockReturnValue(makeDatabase([]));
    await expect(new ScreenerRepository().hasSuccessfulSync()).resolves.toBe(
      false,
    );
  });
  it("persists quote evidence atomically with its issuer snapshot and run provenance", async () => {
    const runReturning = vi.fn().mockResolvedValue([{ id: "market-run" }]);
    const snapshotReturning = vi.fn().mockResolvedValue([{ id: "snapshot-1" }]);
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({ returning: runReturning })
      .mockReturnValueOnce({ returning: snapshotReturning })
      .mockResolvedValueOnce(undefined);
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const transactionClient = {
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set })),
    };
    const database = {
      transaction: vi.fn(
        (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
      update: vi.fn(() => ({ set })),
    };
    mocks.getDatabaseClient.mockReturnValue(database);
    const repository = new ScreenerRepository();
    const startedAt = new Date("2026-09-24T22:00:00Z");
    const quoteTime = new Date("2026-09-24T21:31:30Z");
    await expect(repository.startMarketRefreshRun(startedAt)).resolves.toBe(
      "market-run",
    );
    await repository.saveMarketSnapshot({
      issuerCnpj: "111",
      observedAt: startedAt,
      quoteObservedAt: quoteTime,
      marketCap: 1000,
      price: 49.26,
      sourceTicker: "PETR3",
      classSemanticsValidated: true,
      marketRefreshRunId: "market-run",
      quoteEvidence: [
        {
          requestedTicker: "PETR3",
          returnedTicker: "PETR3",
          price: 54.12,
          marketCap: 1000,
          quoteObservedAt: quoteTime,
          validationResult: "VALIDATED",
        },
        {
          requestedTicker: "PETR4",
          returnedTicker: "PETR4",
          price: 49.26,
          marketCap: 1000,
          quoteObservedAt: quoteTime,
          validationResult: "VALIDATED",
        },
      ],
    });
    expect(database.transaction).toHaveBeenCalledTimes(2);
    expect(insertValues).toHaveBeenNthCalledWith(1, { startedAt });
    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        issuerCnpj: "111",
        marketCap: "1000",
        price: "49.26",
        marketRefreshRunId: "market-run",
      }),
    );
    expect(insertValues).toHaveBeenNthCalledWith(3, [
      {
        requestedTicker: "PETR3",
        returnedTicker: "PETR3",
        price: "54.12",
        marketCap: "1000",
        quoteObservedAt: quoteTime,
        validationResult: "VALIDATED",
        snapshotId: "snapshot-1",
      },
      {
        requestedTicker: "PETR4",
        returnedTicker: "PETR4",
        price: "49.26",
        marketCap: "1000",
        quoteObservedAt: quoteTime,
        validationResult: "VALIDATED",
        snapshotId: "snapshot-1",
      },
    ]);
    await repository.completeMarketRefreshRun({
      id: "market-run",
      completedAt: startedAt,
      attemptedIssuers: 1,
      updatedIssuers: 1,
      unavailableIssuers: 0,
      skippedFreshIssuers: 0,
      status: "COMPLETED",
    });
    expect(database.update).toHaveBeenCalledOnce();
  });

  it("returns a null lease when the insert does not return a run row", async () => {
    const transactionClient = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
      })),
    };
    mocks.getDatabaseClient.mockReturnValue({
      transaction: (
        operation: (client: typeof transactionClient) => Promise<unknown>,
      ) => operation(transactionClient),
    });

    await expect(
      new ScreenerRepository().startMarketRefreshRun(
        new Date("2026-09-24T22:00:00Z"),
      ),
    ).resolves.toBeNull();
  });

  it("stores null quote values as nulls in the evidence rows", async () => {
    const values = vi
      .fn()
      .mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{ id: "snapshot-1" }]),
      })
      .mockResolvedValueOnce(undefined);
    const transactionClient = {
      insert: vi.fn(() => ({ values })),
    };
    const database = {
      transaction: vi.fn(
        (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
    };
    mocks.getDatabaseClient.mockReturnValue(database);

    await expect(
      new ScreenerRepository().saveMarketSnapshot({
        issuerCnpj: "111",
        observedAt: new Date("2026-09-24T22:00:00Z"),
        quoteObservedAt: null,
        marketCap: null,
        price: null,
        sourceTicker: "PETR3",
        classSemanticsValidated: false,
        marketRefreshRunId: "market-run",
        quoteEvidence: [
          {
            requestedTicker: "PETR3",
            returnedTicker: "PETR3",
            price: null,
            marketCap: null,
            quoteObservedAt: null,
            validationResult: "MARKET_CAP_MISSING",
          },
        ],
      }),
    ).resolves.toBeUndefined();
    expect(values).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        price: null,
        marketCap: null,
        snapshotId: "snapshot-1",
      }),
    ]);
  });
  it("propagates non-conflict errors when acquiring the refresh lease", async () => {
    const databaseError = { code: "08006", message: "database unavailable" };
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockRejectedValue(databaseError),
      })),
    }));
    const transactionClient = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      insert,
    };
    mocks.getDatabaseClient.mockReturnValue({
      transaction: (
        operation: (client: typeof transactionClient) => Promise<unknown>,
      ) => operation(transactionClient),
    });

    await expect(
      new ScreenerRepository().startMarketRefreshRun(
        new Date("2026-09-24T22:00:00Z"),
      ),
    ).rejects.toBe(databaseError);
  });

  it("propagates a missing snapshot insert result instead of persisting evidence", async () => {
    const values = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([]),
    }));
    const transactionClient = {
      insert: vi.fn(() => ({ values })),
    };
    const database = {
      transaction: vi.fn(
        (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
    };
    mocks.getDatabaseClient.mockReturnValue(database);

    await expect(
      new ScreenerRepository().saveMarketSnapshot({
        issuerCnpj: "111",
        observedAt: new Date("2026-09-24T22:00:00Z"),
        quoteObservedAt: null,
        marketCap: null,
        price: null,
        sourceTicker: "PETR3",
        classSemanticsValidated: false,
        marketRefreshRunId: "market-run",
        quoteEvidence: [],
      }),
    ).rejects.toThrow("Market snapshot was not saved");
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it("does not insert quote evidence when a saved snapshot has no quote rows", async () => {
    const values = vi.fn().mockReturnValueOnce({
      returning: vi.fn().mockResolvedValue([{ id: "snapshot-1" }]),
    });
    const transactionClient = {
      insert: vi.fn(() => ({ values })),
    };
    const database = {
      transaction: vi.fn(
        (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
    };
    mocks.getDatabaseClient.mockReturnValue(database);

    await expect(
      new ScreenerRepository().saveMarketSnapshot({
        issuerCnpj: "111",
        observedAt: new Date("2026-09-24T22:00:00Z"),
        quoteObservedAt: null,
        marketCap: null,
        price: null,
        sourceTicker: "PETR3",
        classSemanticsValidated: false,
        marketRefreshRunId: "market-run",
        quoteEvidence: [],
      }),
    ).resolves.toBeUndefined();
    expect(transactionClient.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });
  it("recovers expired market leases and declines a concurrent run", async () => {
    const startedAt = new Date("2026-09-24T22:00:00Z");
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockRejectedValue({ code: "23505" }),
      })),
    }));
    const transactionClient = { update: vi.fn(() => ({ set })), insert };
    mocks.getDatabaseClient.mockReturnValue({
      transaction: (
        operation: (client: typeof transactionClient) => Promise<unknown>,
      ) => operation(transactionClient),
    });
    await expect(
      new ScreenerRepository().startMarketRefreshRun(startedAt),
    ).resolves.toBeNull();
    expect(set).toHaveBeenCalledWith({
      status: "PARTIAL",
      completedAt: startedAt,
    });
  });
  it("avoids follow-up reads when no quantitatively eligible issuers exist", async () => {
    const { database } = setup(new Map([[screenerIssuers, []]]));
    await expect(new ScreenerRepository().getUniverse()).resolves.toEqual([]);
    expect(database.select).toHaveBeenCalledOnce();
  });

  it("groups persisted stock classes, consolidated facts and the newest class-safe snapshot by issuer", async () => {
    const issuerA = {
      cnpj: "111",
      cvmCode: "1",
      name: "Issuer A",
      sector: "Industrial",
      quantitativeEligible: true,
    };
    const issuerB = {
      cnpj: "222",
      cvmCode: "2",
      name: "Issuer B",
      sector: "Bancos",
      quantitativeEligible: false,
    };
    const data = new Map<unknown, unknown[]>([
      [screenerIssuers, [issuerA, issuerB]],
      [
        screenerSecurities,
        [
          { issuerCnpj: "111", ticker: "AAA3", name: "Class A" },
          { issuerCnpj: "222", ticker: "BBB3", name: "Class B" },
          { issuerCnpj: "missing", ticker: "NOPE3", name: "Unmatched" },
        ],
      ],
      [
        screenerFinancialFacts,
        [
          {
            issuerCnpj: "111",
            accountCode: "3.11",
            value: "20",
            referenceDate: "2025-12-31",
            documentType: "DFP",
            statementScope: "CONSOLIDATED",
            exerciseOrder: "ULTIMO",
          },
          {
            issuerCnpj: "missing",
            accountCode: "3.11",
            value: "99",
            referenceDate: "2025-12-31",
            documentType: "DFP",
            statementScope: "CONSOLIDATED",
            exerciseOrder: "ULTIMO",
          },
        ],
      ],
      [
        screenerMarketSnapshots,
        [
          {
            issuerCnpj: "111",
            marketCap: "500",
            observedAt: new Date("2026-09-24T00:00:00Z"),
            classSemanticsValidated: true,
          },
          {
            issuerCnpj: "111",
            marketCap: "400",
            observedAt: new Date("2026-09-23T00:00:00Z"),
            classSemanticsValidated: true,
          },
          {
            issuerCnpj: "missing",
            marketCap: "900",
            observedAt: new Date(),
            classSemanticsValidated: true,
          },
        ],
      ],
    ]);
    const { predicates, orderings } = setup(data);
    const result = await new ScreenerRepository().getUniverse();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      ...issuerA,
      securities: [{ ticker: "AAA3", name: "Class A" }],
      facts: [{ issuerCnpj: "111", accountCode: "3.11", value: "20" }],
      marketSnapshot: { marketCap: "500", classSemanticsValidated: true },
    });
    expect(result[1]).toMatchObject({
      ...issuerB,
      securities: [{ ticker: "BBB3", name: "Class B" }],
      facts: [],
      marketSnapshot: null,
    });

    const securitySql = sqlFor(predicates.get(screenerSecurities));
    expect(securitySql.sql).toContain('"subType" =');
    expect(securitySql.sql).toContain('"isActive" =');
    expect(securitySql.sql).toContain('"baseTicker" is null');
    expect(securitySql.params).toContain("stock");
    expect(securitySql.params).toContain(true);
    const factSql = sqlFor(predicates.get(screenerFinancialFacts));
    expect(factSql.params).toEqual(
      expect.arrayContaining([
        "3.01",
        "3.11",
        "2.03",
        "DFP",
        "CONSOLIDATED",
        "ULTIMO",
      ]),
    );
    expect(factSql.sql).toContain('"referenceDate" >=');
    expect(predicates.has(screenerIssuers)).toBe(false);
    expect(factSql.params).toContain("111");
    expect(factSql.params).toContain("222");
    const snapshotSql = sqlFor(predicates.get(screenerMarketSnapshots));
    expect(snapshotSql.params).toEqual(expect.arrayContaining(["111", "222"]));
    expect(sqlFor(orderings.get(screenerMarketSnapshots)).sql).toContain(
      '"observedAt" desc',
    );
  });

  it("returns latest quote and refresh history, or nulls when no market data exists", async () => {
    const run = {
      status: "PARTIAL",
      startedAt: new Date("2026-09-24T10:00:00Z"),
      completedAt: null,
      attemptedIssuers: 4,
      updatedIssuers: 2,
      unavailableIssuers: 2,
      skippedFreshIssuers: 0,
    };
    const quote = {
      quoteObservedAt: new Date("2026-09-24T09:55:00Z"),
      sourceTicker: "AAA3",
    };
    const { orderings } = setup(
      new Map<unknown, unknown[]>([
        [screenerMarketRefreshRuns, [run]],
        [screenerMarketSnapshots, [quote]],
      ]),
    );
    await expect(
      new ScreenerRepository().getMarketDataStatus(),
    ).resolves.toEqual({ latestRun: run, latestQuote: quote });
    expect(orderings.size).toBe(2);

    setup(new Map());
    await expect(
      new ScreenerRepository().getMarketDataStatus(),
    ).resolves.toEqual({ latestRun: null, latestQuote: null });
  });
});
