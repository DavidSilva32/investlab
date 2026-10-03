import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { StockOpportunityAnalysisSettingsRepository } from "@/backend/repositories/stock-opportunity-analysis-settings.repository";

describe("StockOpportunityAnalysisSettingsRepository", () => {
  const repository = new StockOpportunityAnalysisSettingsRepository();
  beforeEach(() => vi.clearAllMocks());

  it("returns persisted settings", async () => {
    const settings = { id: 1, bazinTargetYield: "7.5", updatedAt: new Date() };
    const limit = vi.fn().mockResolvedValue([settings]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(repository.get()).resolves.toBe(settings);
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("uses the default yield when settings have not been saved", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(repository.get()).resolves.toEqual({
      id: 1,
      bazinTargetYield: "6",
      updatedAt: null,
    });
  });

  it("inserts or updates the configured yield at fixed precision", async () => {
    const saved = { id: 1, bazinTargetYield: "7.2500", updatedAt: new Date() };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });
    await expect(repository.saveBazinTargetYield(7.25)).resolves.toBe(saved);
    expect(values).toHaveBeenCalledWith({ id: 1, bazinTargetYield: "7.2500" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          bazinTargetYield: "7.2500",
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
