import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { StockOpportunityAnalysisSettingsRepository } from "@/backend/repositories/stock-opportunity-analysis-settings.repository";

describe("StockOpportunityAnalysisSettingsRepository", () => {
  const repository = new StockOpportunityAnalysisSettingsRepository();
  beforeEach(() => vi.clearAllMocks());

  it("returns persisted settings", async () => {
    const settings = {
      id: "owner-a",
      bazinTargetYield: "7.5",
      updatedAt: new Date(),
    };
    const limit = vi.fn().mockResolvedValue([settings]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const ownerA = runWithDataOwner("owner-a", () => repository.get());
    const ownerB = runWithDataOwner("owner-b", () => repository.get());
    await expect(ownerA).resolves.toBe(settings);
    await expect(ownerB).resolves.toBe(settings);
    expect(where).toHaveBeenCalledTimes(2);
    const ownerParameters = where.mock.calls.map(
      ([condition]) => new PgDialect().sqlToQuery(condition as SQL).params,
    );
    expect(ownerParameters).toEqual([
      expect.arrayContaining(["owner-a"]),
      expect.arrayContaining(["owner-b"]),
    ]);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("uses the default yield when settings have not been saved", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(
      runWithDataOwner("owner-a", () => repository.get()),
    ).resolves.toEqual({
      id: "owner-a",
      bazinTargetYield: "6",
      updatedAt: null,
    });
  });

  it("inserts or updates the configured yield at fixed precision", async () => {
    const saved = {
      id: "owner-a",
      bazinTargetYield: "7.2500",
      updatedAt: new Date(),
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });
    await expect(
      runWithDataOwner("owner-a", () => repository.saveBazinTargetYield(7.25)),
    ).resolves.toBe(saved);
    expect(values).toHaveBeenCalledWith({
      userId: "owner-a",
      id: "owner-a",
      bazinTargetYield: "7.2500",
    });
    const conflictConfig = onConflictDoUpdate.mock.calls[0][0];
    expect(
      conflictConfig.target.map((column: { name: string }) => column.name),
    ).toEqual(["userId", "id"]);
    expect(conflictConfig).toEqual(
      expect.objectContaining({
        set: expect.objectContaining({
          bazinTargetYield: "7.2500",
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("stores the singleton settings independently for different owners", async () => {
    const returning = vi.fn().mockResolvedValue([{}]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });

    await runWithDataOwner("owner-a", () => repository.saveBazinTargetYield(5));
    await runWithDataOwner("owner-b", () => repository.saveBazinTargetYield(8));

    expect(values.mock.calls.map(([row]) => row)).toEqual([
      { userId: "owner-a", id: "owner-a", bazinTargetYield: "5.0000" },
      { userId: "owner-b", id: "owner-b", bazinTargetYield: "8.0000" },
    ]);
    expect(
      onConflictDoUpdate.mock.calls.map(([config]) =>
        config.target.map((column: { name: string }) => column.name),
      ),
    ).toEqual([
      ["userId", "id"],
      ["userId", "id"],
    ]);
  });
});
