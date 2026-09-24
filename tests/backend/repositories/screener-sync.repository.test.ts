import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerSecurities,
} from "@/infrastructure/database/schema";
import type {
  CvmCompanyRecord,
  ScreenerFactRecord,
} from "@/backend/providers/screener-data.provider";

const mocks = vi.hoisted(() => ({ getDatabaseClient: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: mocks.getDatabaseClient,
}));

import { ScreenerSyncRepository } from "@/backend/repositories/screener-sync.repository";
import { logger } from "@/infrastructure/logging/logger";

function setup(
  runRows: { id: string }[] = [{ id: "run-1" }],
  failure?: { table: unknown; error: unknown },
  commitError?: unknown,
) {
  type Operation = {
    table: unknown;
    values?: unknown;
    conflict?: unknown;
    where?: boolean;
  };
  const inserts: Operation[] = [];
  const updates: Operation[] = [];
  const builder = (record: Operation) => {
    const query = {
      values(values: unknown[]) {
        record.values = values;
        return query;
      },
      onConflictDoUpdate(conflict: unknown) {
        record.conflict = conflict;
        return failure && failure.table === record.table
          ? Promise.reject(failure.error)
          : Promise.resolve();
      },
      set(values: unknown) {
        record.values = values;
        return query;
      },
      where() {
        record.where = true;
        return failure && failure.table === record.table
          ? Promise.reject(failure.error)
          : Promise.resolve();
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) {
        return Promise.resolve(undefined).then(resolve, reject);
      },
    };
    return query;
  };
  const tx = {
    insert(table: unknown) {
      const record: Operation = { table };
      inserts.push(record);
      return builder(record);
    },
    update(table: unknown) {
      const record: Operation = { table, where: false };
      updates.push(record);
      return builder(record);
    },
  };
  const database = {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(runRows),
    })),
    update: vi.fn((table: unknown) => builder({ table, where: false })),
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<void>) => {
        await callback(tx);
        if (commitError) throw commitError;
      },
    ),
  };
  mocks.getDatabaseClient.mockReturnValue(database);
  return { database, inserts, updates };
}

const issuer: CvmCompanyRecord = {
  cnpj: "111",
  cvmCode: "1",
  name: "Issuer",
  sector: "Industrial",
  quantitativeEligible: true,
};
const security = (ticker: string, baseTicker: string | null = null) => ({
  ticker,
  name: ticker,
  subtype: "stock",
  active: true,
  cnpj: "111",
  issuerCnpj: "111",
  baseTicker,
  changed: false,
});
const fact = (row: number): ScreenerFactRecord => ({
  issuerCnpj: "111",
  referenceDate: "2025-12-31",
  accountCode: "3.11",
  accountLabel: "Net income",
  value: "10",
  documentType: "DFP",
  statementScope: "CONSOLIDATED",
  exerciseOrder: "ULTIMO",
  version: 1,
  sourceFile: "dfp.zip#facts.csv",
  sourceRow: row,
});

describe("ScreenerSyncRepository", () => {
  beforeEach(() => mocks.getDatabaseClient.mockReset());

  it("reads latest and successful run history for the settings summary", async () => {
    const latestRun = {
      status: "FAILED",
      startedAt: new Date("2026-09-24T10:00:00Z"),
      completedAt: new Date("2026-09-24T10:02:00Z"),
      issuerCount: null,
      securityCount: null,
      factCount: null,
      errorCode: "CVM_DFP",
    };
    const makeQuery = (rows: unknown[]) => {
      const query = {
        from: vi.fn(),
        orderBy: vi.fn(),
        where: vi.fn(),
        limit: vi.fn().mockResolvedValue(rows),
      };
      query.from.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    };
    const database = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeQuery([latestRun]))
        .mockReturnValueOnce(makeQuery([{ status: "COMPLETED" }])),
    };
    mocks.getDatabaseClient.mockReturnValue(database);
    await expect(new ScreenerSyncRepository().getStatus()).resolves.toEqual({
      hasSuccessfulSync: true,
      latestRun,
    });
    expect(database.select).toHaveBeenCalledTimes(2);
  });

  it("returns null latest history when no ingestion has started", async () => {
    const makeQuery = () => {
      const query = {
        from: vi.fn(),
        orderBy: vi.fn(),
        where: vi.fn(),
        limit: vi.fn().mockResolvedValue([]),
      };
      query.from.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    };
    mocks.getDatabaseClient.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(makeQuery())
        .mockReturnValueOnce(makeQuery()),
    });
    await expect(new ScreenerSyncRepository().getStatus()).resolves.toEqual({
      hasSuccessfulSync: false,
      latestRun: null,
    });
  });
  it("creates a run and reports a database error when insert returns no row", async () => {
    const { database } = setup();
    await expect(
      new ScreenerSyncRepository().startRun("sync-key"),
    ).resolves.toBe("run-1");
    expect(database.insert).toHaveBeenCalledWith(screenerIngestionRuns);

    setup([]);
    await expect(
      new ScreenerSyncRepository().startRun("sync-key"),
    ).rejects.toThrow("Could not create screener ingestion run");
  });

  it("upserts issuer, securities and fact chunks transactionally and marks the run complete", async () => {
    const { database, inserts, updates } = setup();
    const securities = Array.from({ length: 501 }, (_, index) =>
      security(`T${index}`),
    );
    securities[0] = security("T0F", "T0");
    const facts = Array.from({ length: 501 }, (_, index) => fact(index + 1));
    await new ScreenerSyncRepository().saveFullSync({
      runId: "run-1",
      catalogCount: 1000,
      profileCount: 370,
      issuers: [
        issuer,
        { ...issuer, cnpj: "222", quantitativeEligible: false },
      ],
      securities,
      facts,
    });

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(
      inserts.filter((entry) => entry.table === screenerIssuers),
    ).toHaveLength(1);
    expect(
      inserts
        .filter((entry) => entry.table === screenerSecurities)
        .map((entry) => (entry.values as unknown[] | undefined)?.length),
    ).toEqual([500, 1]);
    expect(
      inserts
        .filter((entry) => entry.table === screenerFinancialFacts)
        .map((entry) => (entry.values as unknown[] | undefined)?.length),
    ).toEqual([500, 1]);
    expect(
      (
        inserts.find((entry) => entry.table === screenerIssuers)?.values as
          unknown[] | undefined
      )?.[1],
    ).toMatchObject({
      eligibilityReason: "EXPLICIT_FINANCIAL_SECTOR_OR_UNCLASSIFIED",
    });
    const factConflict = inserts.find(
      (entry) => entry.table === screenerFinancialFacts,
    )?.conflict as { setWhere?: unknown };
    expect(factConflict.setWhere).toBeDefined();
    expect(
      updates.find((entry) => entry.table === screenerSecurities)?.values,
    ).toMatchObject({ isActive: false });
    expect(
      updates.find((entry) => entry.table === screenerIngestionRuns)?.values,
    ).toMatchObject({
      status: "COMPLETED",
      issuerCount: 2,
      securityCount: 501,
      factCount: 501,
      catalogCount: 1000,
      profileCount: 370,
    });
    expect(
      updates.find((entry) => entry.table === screenerIngestionRuns)?.where,
    ).toBe(true);
  });

  it("completes an empty sync without issuer, security or fact inserts", async () => {
    const { inserts, updates } = setup();
    await new ScreenerSyncRepository().saveFullSync({
      runId: "run-1",
      catalogCount: 0,
      profileCount: 0,
      issuers: [],
      securities: [],
      facts: [],
    });
    expect(inserts).toEqual([]);
    expect(
      updates.find((entry) => entry.table === screenerIngestionRuns)?.values,
    ).toMatchObject({
      status: "COMPLETED",
      issuerCount: 0,
      securityCount: 0,
      factCount: 0,
      catalogCount: 0,
      profileCount: 0,
    });
  });

  it("logs safe DB metadata for a failed persistence batch and rethrows the same error", async () => {
    const databaseError = Object.assign(new Error("sensitive row contents"), {
      code: "23505",
      constraint: "valid_constraint",
      table: "screener_securities",
      column: "ticker",
    });
    setup(undefined, { table: screenerSecurities, error: databaseError });
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(
        new ScreenerSyncRepository().saveFullSync({
          runId: "run-1",
          catalogCount: 1,
          profileCount: 1,
          issuers: [],
          securities: [security("ABC3")],
          facts: [],
        }),
      ).rejects.toBe(databaseError);
      expect(log).toHaveBeenCalledWith(
        "screener_sync_persistence_failed",
        expect.objectContaining({
          stage: "security_upsert",
          runId: "run-1",
          batchIndex: 1,
          batchSize: 1,
          securityCount: 1,
          databaseCode: "23505",
          constraint: "valid_constraint",
          table: "screener_securities",
          column: "ticker",
          durationMs: expect.any(Number),
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "sensitive row contents",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("extracts allowlisted database metadata from a wrapped cause without logging its details", async () => {
    const postgresError = Object.assign(
      new Error("sensitive database message"),
      {
        name: "PostgresError",
        code: "23505",
        constraint: "safe_constraint",
        table: "safe_table",
        column: "safe_column",
        query: "INSERT INTO user_data VALUES (...) secret-query",
        params: ["private-param"],
      },
    );
    const drizzleError = Object.assign(new Error("sensitive wrapper message"), {
      cause: postgresError,
    });
    postgresError.cause = postgresError;
    setup(undefined, { table: screenerSecurities, error: drizzleError });
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(
        new ScreenerSyncRepository().saveFullSync({
          runId: "run-1",
          catalogCount: 1,
          profileCount: 1,
          issuers: [],
          securities: [security("ABC3")],
          facts: [],
        }),
      ).rejects.toBe(drizzleError);
      expect(log).toHaveBeenCalledWith(
        "screener_sync_persistence_failed",
        expect.objectContaining({
          stage: "security_upsert",
          errorType: "Error",
          databaseErrorType: "PostgresError",
          databaseCode: "23505",
          constraint: "safe_constraint",
          table: "safe_table",
          column: "safe_column",
        }),
      );
      const serializedLog = JSON.stringify(log.mock.calls);
      expect(serializedLog).not.toContain("sensitive database message");
      expect(serializedLog).not.toContain("sensitive wrapper message");
      expect(serializedLog).not.toContain("secret-query");
      expect(serializedLog).not.toContain("private-param");
    } finally {
      log.mockRestore();
    }
  });
  it("omits untrusted database metadata and reports unknown non-object failures", async () => {
    const unsafeError = Object.assign(new Error("private detail"), {
      name: "invalid error type",
      code: "bad-code",
      constraint: "private detail",
      table: "bad table",
      column: "column value",
    });
    setup(undefined, { table: screenerIngestionRuns, error: unsafeError });
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(
        new ScreenerSyncRepository().markFailed("run-1", "CVM_REGISTRY"),
      ).rejects.toBe(unsafeError);
      expect(log).toHaveBeenCalledWith(
        "screener_sync_persistence_failed",
        expect.objectContaining({
          stage: "mark_failed",
          runId: "run-1",
          errorType: "unknown",
        }),
      );
      expect(log.mock.calls[0]?.[1]).not.toHaveProperty("databaseCode");
      expect(log.mock.calls[0]?.[1]).not.toHaveProperty("constraint");
      expect(log.mock.calls[0]?.[1]).not.toHaveProperty("table");
      expect(log.mock.calls[0]?.[1]).not.toHaveProperty("column");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private detail");
    } finally {
      log.mockRestore();
    }

    setup(undefined, { table: screenerIngestionRuns, error: "opaque failure" });
    const unknownLog = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    try {
      await expect(
        new ScreenerSyncRepository().markFailed("run-1", "CVM_REGISTRY"),
      ).rejects.toBe("opaque failure");
      expect(unknownLog).toHaveBeenCalledWith(
        "screener_sync_persistence_failed",
        expect.objectContaining({
          stage: "mark_failed",
          runId: "run-1",
          errorType: "unknown",
        }),
      );
    } finally {
      unknownLog.mockRestore();
    }
  });
  it("attributes failures after the completion update to transaction commit", async () => {
    const commitError = Object.assign(new Error("commit detail"), {
      code: "40001",
    });
    setup(undefined, undefined, commitError);
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(
        new ScreenerSyncRepository().saveFullSync({
          runId: "run-1",
          catalogCount: 0,
          profileCount: 0,
          issuers: [],
          securities: [],
          facts: [],
        }),
      ).rejects.toBe(commitError);
      expect(log).toHaveBeenCalledWith(
        "screener_sync_persistence_failed",
        expect.objectContaining({
          stage: "transaction_commit",
          runId: "run-1",
          issuerCount: 0,
          securityCount: 0,
          factCount: 0,
          databaseCode: "40001",
          durationMs: expect.any(Number),
        }),
      );
    } finally {
      log.mockRestore();
    }
  });
  it("marks a failed run with its sanitized error code", async () => {
    const { database } = setup();
    await new ScreenerSyncRepository().markFailed("run-1", "CVM_REGISTRY");
    expect(database.update).toHaveBeenCalledWith(screenerIngestionRuns);
  });
});
