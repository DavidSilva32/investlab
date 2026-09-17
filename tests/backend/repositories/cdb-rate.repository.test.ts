import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));

import { CdbRateRepository } from "@/backend/repositories/cdb-rate.repository";

describe("CdbRateRepository", () => {
  beforeEach(() => vi.clearAllMocks());
  const repository = new CdbRateRepository();

  it("avoids a query when no asset code is provided", async () => {
    await expect(repository.listConfigurations([])).resolves.toEqual([]);
    expect(client.select).not.toHaveBeenCalled();
    await expect(repository.upsertMany([], "100")).resolves.toBe(0);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("queries configurations and cached rates", async () => {
    const where = vi.fn().mockResolvedValue([{ assetCode: "CDB1" }]);
    client.select.mockReturnValue({ from: () => ({ where }) });
    await expect(repository.listConfigurations(["CDB1"])).resolves.toEqual([
      { assetCode: "CDB1" },
    ]);
    await expect(
      repository.listRatesAfter("2026-09-16", "2026-09-20"),
    ).resolves.toEqual([{ assetCode: "CDB1" }]);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("upserts one configuration", async () => {
    const returning = vi.fn().mockResolvedValue([{ assetCode: "CDB1" }]);
    const conflict = vi.fn().mockReturnValue({ returning });
    client.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: conflict }),
    });
    await expect(repository.upsert("CDB1", "100")).resolves.toEqual({
      assetCode: "CDB1",
    });
    expect(conflict).toHaveBeenCalled();
  });

  it("inserts only configurations missing from the database", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ assetCode: "CDB1" }, { assetCode: "CDB2" }]);
    const conflict = vi.fn().mockReturnValue({ returning });
    client.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: conflict }),
    });
    await expect(repository.upsertMany(["CDB1", "CDB2"], "100")).resolves.toBe(
      2,
    );
  });

  it("caches rates when supplied and skips empty cache writes", async () => {
    const conflict = vi.fn().mockResolvedValue(undefined);
    client.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing: conflict }),
    });
    await repository.cacheRates([{ date: "2026-09-17", annualRate: "14.9" }]);
    expect(conflict).toHaveBeenCalled();
    client.insert.mockClear();
    await repository.cacheRates([]);
    expect(client.insert).not.toHaveBeenCalled();
  });
});
