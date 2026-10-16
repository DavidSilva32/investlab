import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

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
    await expect(
      runWithDataOwner("owner-a", () => repository.listByTickers([])),
    ).resolves.toEqual([]);
    expect(database.select).not.toHaveBeenCalled();
  });

  it("lists inputs for multiple tickers", async () => {
    const rows = [{ ticker: "ABCD3", value: "2" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const queryA = runWithDataOwner("owner-a", () =>
      repository.listByTickers(["ABCD3", "EFGH4"]),
    );
    const queryB = runWithDataOwner("owner-b", () =>
      repository.listByTickers(["ABCD3", "EFGH4"]),
    );
    await expect(queryA).resolves.toBe(rows);
    await expect(queryB).resolves.toBe(rows);
    expect(database.select).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledTimes(2);
    const dialect = new PgDialect();
    const ownerParameters = where.mock.calls.map(
      ([condition]) => dialect.sqlToQuery(condition as SQL).params,
    );
    expect(ownerParameters).toEqual([
      expect.arrayContaining(["owner-a", "ABCD3", "EFGH4"]),
      expect.arrayContaining(["owner-b", "ABCD3", "EFGH4"]),
    ]);
  });

  it("lists inputs for one ticker", async () => {
    const rows = [{ ticker: "ABCD3", inputKey: "graham_eps" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(
      runWithDataOwner("owner-a", () => repository.listByTicker("ABCD3")),
    ).resolves.toBe(rows);
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
      runWithDataOwner("owner-a", () =>
        repository.upsert({
          ticker: "ABCD3",
          inputKey: "graham_eps",
          value: 2.5,
          source: "Annual report",
          asOf: "2026-09-30",
        }),
      ),
    ).resolves.toBe(row);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-a",
        ticker: "ABCD3",
        value: "2.50000000",
      }),
    );
    const conflictConfig = onConflictDoUpdate.mock.calls[0][0];
    expect(
      conflictConfig.target.map((column: { name: string }) => column.name),
    ).toEqual(["userId", "ticker", "inputKey"]);
    expect(conflictConfig).toEqual(
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

  it("stores the same manual-input key independently for different owners", async () => {
    const returning = vi.fn().mockImplementation(async () => [{} as never]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });

    await runWithDataOwner("owner-a", () =>
      repository.upsert({
        ticker: "ABCD3",
        inputKey: "graham_eps",
        value: 1,
        source: "A",
        asOf: "2026-09-30",
      }),
    );
    await runWithDataOwner("owner-b", () =>
      repository.upsert({
        ticker: "ABCD3",
        inputKey: "graham_eps",
        value: 2,
        source: "B",
        asOf: "2026-09-30",
      }),
    );

    expect(values.mock.calls.map(([row]) => row)).toEqual([
      expect.objectContaining({
        userId: "owner-a",
        ticker: "ABCD3",
        inputKey: "graham_eps",
      }),
      expect.objectContaining({
        userId: "owner-b",
        ticker: "ABCD3",
        inputKey: "graham_eps",
      }),
    ]);
    const targets = onConflictDoUpdate.mock.calls.map(
      ([config]) => config.target,
    );
    expect(targets).toHaveLength(2);
    expect(
      targets.map((target) =>
        target.map((column: { name: string }) => column.name),
      ),
    ).toEqual([
      ["userId", "ticker", "inputKey"],
      ["userId", "ticker", "inputKey"],
    ]);
  });

  it("deletes and returns the record id or null", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    database.delete.mockReturnValue({ where });
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.delete("ABCD3", "graham_eps"),
      ),
    ).resolves.toEqual({
      id: "row-1",
    });
    expect(where).toHaveBeenCalledOnce();
    returning.mockResolvedValueOnce([]);
    await expect(
      runWithDataOwner("owner-a", () =>
        repository.delete("ABCD3", "graham_eps"),
      ),
    ).resolves.toBeNull();
  });
});
