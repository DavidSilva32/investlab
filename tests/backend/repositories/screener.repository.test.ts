import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
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
    expect(snapshotSql.params).toContain(true);
    expect(sqlFor(orderings.get(screenerMarketSnapshots)).sql).toContain(
      '"observedAt" desc',
    );
  });
});
