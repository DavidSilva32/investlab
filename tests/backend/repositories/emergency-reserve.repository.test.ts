import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn() }));
const objectiveAssignments = vi.hoisted(() => ({
  listReserveAssignments: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: objectiveAssignments,
}));

import { EmergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";

describe("EmergencyReserveRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectiveAssignments.listReserveAssignments.mockResolvedValue([]);
  });

  it("returns the singleton settings row or null when it is not configured", async () => {
    const limit = vi.fn().mockResolvedValue([{ monthlyExpenses: "1200.00" }]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new EmergencyReserveRepository();

    await expect(repository.getSettings()).resolves.toEqual({
      monthlyExpenses: "1200.00",
      targetMonths: null,
      selectedAssetKeys: [],
    });
    expect(limit).toHaveBeenCalledWith(1);

    limit.mockResolvedValueOnce([]);
    await expect(repository.getSettings()).resolves.toBeNull();

    limit.mockResolvedValueOnce([]);
    objectiveAssignments.listReserveAssignments.mockResolvedValueOnce([
      "v1:legacy-position",
    ]);
    await expect(repository.getSettings()).resolves.toEqual({
      monthlyExpenses: null,
      targetMonths: null,
      selectedAssetKeys: ["v1:legacy-position"],
    });
  });

  it("upserts the singleton settings and refreshes its update timestamp", async () => {
    const saved = {
      id: "default",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const settingsValues = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const assignmentValues = vi.fn().mockResolvedValue(undefined);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: settingsValues })
        .mockReturnValueOnce({ values: assignmentValues }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new EmergencyReserveRepository().saveSettings({
        monthlyExpenses: "1200.00",
        targetMonths: 6,
        selectedAssetKeys: ["v1:key"],
      }),
    ).resolves.toEqual({ ...saved, selectedAssetKeys: ["v1:key"] });
    expect(settingsValues).toHaveBeenCalledWith({
      id: "default",
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
    expect(transaction.delete).toHaveBeenCalledTimes(1);
    expect(assignmentValues).toHaveBeenCalledWith([
      {
        objectiveId: "00000000-0000-4000-8000-000000000010",
        assetKey: "v1:key",
      },
    ]);
  });

  it("keeps expense settings unchanged when replacing assignments fails", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "default" }]);
    const settingsValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: () => ({ returning }),
    });
    const assignmentError = new Error("duplicate assignment");
    const transaction = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: settingsValues })
        .mockReturnValueOnce({ values: () => Promise.reject(assignmentError) }),
      delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new EmergencyReserveRepository().saveSettings({
        monthlyExpenses: "2000.00",
        targetMonths: 6,
        selectedAssetKeys: ["asset-assigned-to-another-goal"],
      }),
    ).rejects.toBe(assignmentError);
    expect(client.transaction).toHaveBeenCalledTimes(1);
  });

  it("deletes old reserve assignments when the new selection is empty", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "default" }]);
    const transaction = {
      insert: vi.fn(() => ({
        values: () => ({ onConflictDoUpdate: () => ({ returning }) }),
      })),
      delete: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new EmergencyReserveRepository().saveSettings({
      monthlyExpenses: "2000.00",
      targetMonths: 6,
      selectedAssetKeys: [],
    });

    expect(transaction.delete).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(1);
  });
});
