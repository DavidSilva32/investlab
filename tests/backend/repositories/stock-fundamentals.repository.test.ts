import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import { StockFundamentalsRepository } from "@/backend/repositories/stock-fundamentals.repository";

const period: FundamentalPeriod = {
  referenceDate: "2025-12-31",
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

  it("skips replacement when no periods are available", async () => {
    await expect(
      repository.save("PETR4", "12345678000190", "v1", []),
    ).resolves.toBeUndefined();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("replaces the ticker rows transactionally with normalized periods", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      delete: vi.fn().mockReturnValue({ where }),
      insert: vi.fn().mockReturnValue({ values }),
    };
    database.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );

    await repository.save("PETR4", "12345678000190", "dfp-2025", [period]);

    expect(transaction.delete).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(transaction.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith([
      {
        ticker: "PETR4",
        cnpj: "12345678000190",
        periodType: "annual",
        referenceDate: "2025-12-31",
        revenue: "100",
        netIncome: "10",
        equity: "50",
        assets: "80",
        liabilities: "30",
        cash: "20",
        debt: "15",
        sourceDocument: "DFP",
        sourceVersion: "dfp-2025",
      },
    ]);
  });
});
