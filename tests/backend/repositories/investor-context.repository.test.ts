import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { InvestorContextRepository } from "@/backend/repositories/investor-context.repository";

describe("InvestorContextRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the saved context or an empty context", async () => {
    const limit = vi.fn().mockResolvedValueOnce([
      {
        objective: "Comprar uma casa",
        targetMonth: "2031-04",
        updatedAt: new Date("2026-09-27T12:00:00.000Z"),
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });

    await expect(
      new InvestorContextRepository().get("req-found"),
    ).resolves.toEqual({
      objective: "Comprar uma casa",
      targetMonth: "2031-04",
      updatedAt: "2026-09-27T12:00:00.000Z",
    });
    expect(limit).toHaveBeenCalledWith(1);

    limit.mockResolvedValueOnce([]);
    await expect(
      new InvestorContextRepository().get("req-empty"),
    ).resolves.toEqual({
      objective: null,
      targetMonth: null,
      updatedAt: null,
    });
  });

  it("logs and rethrows query errors", async () => {
    const error = new Error("database unavailable");
    const limit = vi.fn().mockRejectedValue(error);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });

    await expect(new InvestorContextRepository().get("req-query")).rejects.toBe(
      error,
    );
    expect(logger.error).toHaveBeenCalledWith("investor_context_query_failed", {
      requestId: "req-query",
      errorType: "Error",
    });
  });

  it("labels non-Error database failures as unknown", async () => {
    const limit = vi.fn().mockRejectedValue("opaque query failure");
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });
    await expect(new InvestorContextRepository().get()).rejects.toBe(
      "opaque query failure",
    );
    expect(logger.error).toHaveBeenCalledWith("investor_context_query_failed", {
      requestId: undefined,
      errorType: "unknown",
    });
  });

  it("upserts objective, target month, and update time", async () => {
    const saved = {
      objective: "Formar uma reserva",
      targetMonth: "2030-12",
      updatedAt: new Date("2026-09-27T12:00:00.000Z"),
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new InvestorContextRepository().save(
        { objective: saved.objective, targetMonth: saved.targetMonth },
        "req-save",
      ),
    ).resolves.toEqual({
      ...saved,
      updatedAt: "2026-09-27T12:00:00.000Z",
    });
    expect(values).toHaveBeenCalledWith({
      id: "default",
      objective: saved.objective,
      targetMonth: saved.targetMonth,
      updatedAt: expect.any(Date),
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: {
          objective: saved.objective,
          targetMonth: saved.targetMonth,
          updatedAt: expect.any(Date),
        },
      }),
    );
  });

  it("labels non-Error update failures as unknown", async () => {
    const returning = vi.fn().mockRejectedValue("opaque update failure");
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });
    await expect(
      new InvestorContextRepository().save({
        objective: null,
        targetMonth: null,
      }),
    ).rejects.toBe("opaque update failure");
    expect(logger.error).toHaveBeenCalledWith(
      "investor_context_update_failed",
      { requestId: undefined, errorType: "unknown" },
    );
  });

  it("logs and rethrows save errors", async () => {
    const error = new Error("database unavailable");
    const returning = vi.fn().mockRejectedValue(error);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values });

    await expect(
      new InvestorContextRepository().save(
        { objective: null, targetMonth: null },
        "req-update",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "investor_context_update_failed",
      { requestId: "req-update", errorType: "Error" },
    );
  });
});
