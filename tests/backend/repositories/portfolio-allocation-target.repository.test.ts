import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { PortfolioAllocationTargetRepository } from "@/backend/repositories/portfolio-allocation-target.repository";

describe("PortfolioAllocationTargetRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stored percentages or an empty configuration when absent", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ percentages: { "Renda fixa": 100 } }]);
    client.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new PortfolioAllocationTargetRepository();

    await expect(repository.get("req-present")).resolves.toEqual({
      "Renda fixa": 100,
    });
    expect(where).toHaveBeenCalled();

    where.mockResolvedValueOnce([]);
    await expect(repository.get("req-absent")).resolves.toEqual({});
  });

  it("logs and rethrows query errors with request context", async () => {
    const error = new Error("database unavailable");
    const where = vi.fn().mockRejectedValue(error);
    client.select.mockReturnValue({ from: () => ({ where }) });

    await expect(
      new PortfolioAllocationTargetRepository().get("req-query"),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_allocation_targets_query_failed",
      { requestId: "req-query", error },
    );
  });

  it("upserts the singleton and returns saved percentages", async () => {
    const percentages = { "Renda fixa": 70, Fundos: 30 };
    const returning = vi.fn().mockResolvedValue([{ percentages }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new PortfolioAllocationTargetRepository().save(percentages, "req-save"),
    ).resolves.toEqual(percentages);
    expect(values).toHaveBeenCalledWith({
      id: "default",
      percentages,
      updatedAt: expect.any(Date),
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: { percentages, updatedAt: expect.any(Date) },
      }),
    );
  });

  it("logs and rethrows save errors with request context", async () => {
    const error = new Error("database unavailable");
    const returning = vi.fn().mockRejectedValue(error);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new PortfolioAllocationTargetRepository().save(
        { "Renda fixa": 100 },
        "req-update",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_allocation_targets_update_failed",
      { requestId: "req-update", error },
    );
  });
});
