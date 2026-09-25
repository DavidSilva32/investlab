import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));

import { EmergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";

describe("EmergencyReserveRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the singleton settings row or null when it is not configured", async () => {
    const limit = vi.fn().mockResolvedValue([{ monthlyExpenses: "1200.00" }]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new EmergencyReserveRepository();

    await expect(repository.getSettings()).resolves.toEqual({
      monthlyExpenses: "1200.00",
    });
    expect(limit).toHaveBeenCalledWith(1);

    limit.mockResolvedValueOnce([]);
    await expect(repository.getSettings()).resolves.toBeNull();
  });

  it("upserts the singleton settings and refreshes its update timestamp", async () => {
    const saved = {
      id: "default",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
      selectedAssetKeys: ["v1:key"],
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new EmergencyReserveRepository().saveSettings({
        monthlyExpenses: "1200.00",
        targetMonths: 6,
        selectedAssetKeys: ["v1:key"],
      }),
    ).resolves.toEqual(saved);
    expect(values).toHaveBeenCalledWith({
      id: "default",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
      selectedAssetKeys: ["v1:key"],
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          monthlyExpenses: "1200.00",
          targetMonths: 6,
          selectedAssetKeys: ["v1:key"],
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
