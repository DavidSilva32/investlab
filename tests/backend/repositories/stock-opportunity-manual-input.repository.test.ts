import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { StockOpportunityManualInputRepository } from "@/backend/repositories/stock-opportunity-manual-input.repository";

describe("StockOpportunityManualInputRepository", () => {
  const repository = new StockOpportunityManualInputRepository();
  beforeEach(() => vi.clearAllMocks());

  it("returns no rows for an empty ticker list", async () => {
    await expect(repository.listByTickers([])).resolves.toEqual([]);
    expect(database.select).not.toHaveBeenCalled();
  });

  it("lists inputs for multiple tickers", async () => {
    const rows = [{ ticker: "ABCD3", value: "2" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(repository.listByTickers(["ABCD3", "EFGH4"])).resolves.toBe(
      rows,
    );
    expect(database.select).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it("lists inputs for one ticker", async () => {
    const rows = [{ ticker: "ABCD3", inputKey: "graham_eps" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(repository.listByTicker("ABCD3")).resolves.toBe(rows);
    expect(where).toHaveBeenCalledOnce();
  });

  it("upserts a fixed-precision value and refreshes its metadata", async () => {
    const row = {
      ticker: "ABCD3",
      inputKey: "graham_eps",
      value: "2.50000000",
    };
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    database.insert.mockImplementation(insert);

    await expect(
      repository.upsert({
        ticker: "ABCD3",
        inputKey: "graham_eps",
        value: 2.5,
        source: "Annual report",
        asOf: "2026-09-30",
      }),
    ).resolves.toBe(row);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "ABCD3", value: "2.50000000" }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          value: "2.50000000",
          source: "Annual report",
          asOf: "2026-09-30",
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("deletes and returns the record id or null", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    database.delete.mockReturnValue({ where });
    await expect(repository.delete("ABCD3", "graham_eps")).resolves.toEqual({
      id: "row-1",
    });
    expect(where).toHaveBeenCalledOnce();
    returning.mockResolvedValueOnce([]);
    await expect(repository.delete("ABCD3", "graham_eps")).resolves.toBeNull();
  });
});
