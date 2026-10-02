import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { PersonalInvestmentStrategyRepository } from "@/backend/repositories/personal-investment-strategy.repository";

describe("PersonalInvestmentStrategyRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the saved profile, or reports that the user has not chosen one", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ answers: { horizonYears: 5 } }]);
    database.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new PersonalInvestmentStrategyRepository();
    await expect(repository.get("req-found")).resolves.toEqual({
      answers: { horizonYears: 5 },
    });
    where.mockResolvedValueOnce([]);
    await expect(repository.get()).resolves.toBeNull();
  });

  it("logs and rethrows read errors with request context", async () => {
    const error = new Error("database unavailable");
    const where = vi.fn().mockRejectedValue(error);
    database.select.mockReturnValue({ from: () => ({ where }) });
    await expect(
      new PersonalInvestmentStrategyRepository().get("req-read"),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "personal_investment_strategy_query_failed",
      { requestId: "req-read", error },
    );
  });

  it("upserts answers and the chosen direction", async () => {
    const record = { selectedDirection: "review_horizon" };
    const returning = vi.fn().mockResolvedValue([record]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });
    const answers = {
      horizonYears: 4,
      internationalInterest: "interested" as const,
    };
    await expect(
      new PersonalInvestmentStrategyRepository().save(
        answers,
        "consider_international",
        "req-save",
      ),
    ).resolves.toEqual(record);
    expect(values).toHaveBeenCalledWith({
      id: "default",
      answers,
      selectedDirection: "consider_international",
      updatedAt: expect.any(Date),
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: {
          answers,
          selectedDirection: "consider_international",
          updatedAt: expect.any(Date),
        },
      }),
    );
  });

  it("logs and rethrows write errors with request context", async () => {
    const error = new Error("database unavailable");
    const returning = vi.fn().mockRejectedValue(error);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert.mockReturnValue({ values });
    await expect(
      new PersonalInvestmentStrategyRepository().save(
        { horizonYears: 2, internationalInterest: "unsure" },
        "review_horizon",
        "req-write",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "personal_investment_strategy_update_failed",
      { requestId: "req-write", error },
    );
  });
});
