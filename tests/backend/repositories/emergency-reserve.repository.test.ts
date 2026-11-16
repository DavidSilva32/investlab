import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "user-1",
}));

import { EmergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";

describe("EmergencyReserveRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only monthly expenses and target months", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ monthlyExpenses: "1200.00", targetMonths: 6 }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    client.select.mockReturnValue({ from });

    await expect(
      new EmergencyReserveRepository().getSettings(),
    ).resolves.toEqual({
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns null when the settings row does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });

    await expect(
      new EmergencyReserveRepository().getSettings(),
    ).resolves.toBeNull();
  });

  it("preserves nullable settings stored for the user", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ monthlyExpenses: null, targetMonths: null }]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });

    await expect(
      new EmergencyReserveRepository().getSettings(),
    ).resolves.toEqual({ monthlyExpenses: null, targetMonths: null });
  });

  it("upserts the singleton settings and refreshes its update timestamp", async () => {
    const saved = {
      id: "user-1",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new EmergencyReserveRepository().saveSettings({
        monthlyExpenses: "1200.00",
        targetMonths: 6,
      }),
    ).resolves.toEqual([saved]);
    expect(values).toHaveBeenCalledWith({
      id: "user-1",
      userId: "user-1",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          monthlyExpenses: "1200.00",
          targetMonths: 6,
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
