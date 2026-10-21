import { beforeEach, describe, expect, it, vi } from "vitest";

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

import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import { StockFundamentalsRepository } from "@/backend/repositories/stock-fundamentals.repository";

const period: FundamentalPeriod = {
  referenceDate: "2025-12-31",
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  filingReferenceDate: "2025-12-31",
  exerciseOrder: "last",
  periodBasis: "annual",
  revenueVersion: "1",
  revenueAccountLabel: "Receitas de venda de bens e serviços",
  netIncomeVersion: "1",
  netIncomeAccount: "3.11",
  netIncomeConcept: "consolidated_net_income",
  equityVersion: "1",
  equityAccount: "2.03",
  equityConcept: "consolidated_equity",
  periodType: "annual",
  sourceDocument: "DFP",
  revenue: "100",
  netIncome: "10",
  equity: "50",
  assets: "80",
  liabilities: "30",
  cash: "20",
  debt: "15",
};

describe("StockFundamentalsRepository", () => {
  const repository = new StockFundamentalsRepository();

  beforeEach(() => vi.clearAllMocks());

  it("lists fundamentals for a ticker", async () => {
    const rows = [{ ticker: "PETR4", referenceDate: "2025-12-31" }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(repository.listByTicker("PETR4")).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("lists refresh work due for the weekly cache refresh", async () => {
    const rows = [
      { ticker: "PETR4", cnpj: "12345678000190", sourceVersion: "v1" },
    ];
    const limit = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(repository.listDueRefreshes("v1", 5)).resolves.toEqual(rows);
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(5);
  });

  it("reports idle when a refresh lease does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.getRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toEqual({ status: "idle", retryAfter: null, errorCode: null });
  });

  it.each([
    ["expired running", { status: "RUNNING", activeLease: false }],
    ["retryable failure", { status: "FAILED", retryReady: true }],
    ["expired completion", { status: "COMPLETED", refreshDue: true }],
  ])("returns an idle state for %s", async (_label, row) => {
    const limit = vi.fn().mockResolvedValue([
      {
        retryAfter: null,
        errorCode: null,
        activeLease: false,
        retryReady: false,
        refreshDue: false,
        ...row,
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.getRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toEqual({ status: "idle", retryAfter: null, errorCode: null });
  });

  it("returns the active refresh status and safe retry metadata", async () => {
    const retryAfter = new Date("2026-10-20T15:00:00.000Z");
    const limit = vi.fn().mockResolvedValue([
      {
        status: "FAILED",
        retryAfter,
        errorCode: "PROVIDER_ERROR",
        activeLease: false,
        retryReady: false,
        refreshDue: false,
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.getRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toEqual({
      status: "failed",
      retryAfter: retryAfter.toISOString(),
      errorCode: "PROVIDER_ERROR",
    });
  });

  it("keeps a non-expired refresh lease in the running state", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        status: "RUNNING",
        retryAfter: null,
        errorCode: null,
        activeLease: true,
        retryReady: false,
        refreshDue: false,
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.getRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toMatchObject({ status: "running" });
  });

  it("returns a new fencing token only when the atomic claim succeeds", async () => {
    const returning = vi.fn().mockResolvedValue([{ leaseToken: "lease-1" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });

    await expect(
      repository.claimRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toBe("lease-1");
    expect(values).toHaveBeenCalledOnce();
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("returns null when another worker owns an unexpired lease", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });

    await expect(
      repository.claimRefresh("PETR4", "12345678000190", "v1"),
    ).resolves.toBeNull();
  });

  it("atomically completes cache replacement only for the current fencing token", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ticker: "PETR4" }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ where }),
      insert: vi.fn().mockReturnValue({ values }),
    };
    database.transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      repository.completeRefresh("PETR4", "12345678000190", "v1", "lease-1", [
        period,
      ]),
    ).resolves.toBe(true);
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(tx.delete).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledOnce();
  });

  it("does not replace cache after another worker takes the lease", async () => {
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      delete: vi.fn(),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      repository.completeRefresh("PETR4", "12345678000190", "v1", "old", [
        period,
      ]),
    ).resolves.toBe(false);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("preserves existing cache when the provider has no validated periods", async () => {
    await expect(
      repository.completeRefresh(
        "PETR4",
        "12345678000190",
        "v1",
        "lease-1",
        [],
      ),
    ).resolves.toBe(false);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("marks only the current lease failed", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockReturnValue({ set });

    await expect(
      repository.failRefresh(
        "PETR4",
        "12345678000190",
        "v1",
        "lease-1",
        "PROVIDER_ERROR",
      ),
    ).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });
});
