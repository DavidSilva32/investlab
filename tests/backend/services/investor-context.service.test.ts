import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/repositories/investor-context.repository", () => ({
  investorContextRepository: repository,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { InvestorContextService } from "@/backend/services/investor-context.service";

describe("InvestorContextService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the saved context", async () => {
    const context = {
      objective: "Comprar uma casa",
      targetMonth: "2031-04",
      updatedAt: "2026-09-27T12:00:00.000Z",
    };
    repository.get.mockResolvedValue(context);

    await expect(new InvestorContextService().get("req-1")).resolves.toBe(
      context,
    );
    expect(repository.get).toHaveBeenCalledWith("req-1");
  });

  it("trims the objective and saves only the explicit optional fields", async () => {
    const saved = { objective: "Comprar uma casa", targetMonth: "2031-04" };
    repository.save.mockResolvedValue(saved);

    await expect(
      new InvestorContextService().save(
        { objective: "  Comprar uma casa  ", targetMonth: "2031-04" },
        "req-save",
      ),
    ).resolves.toBe(saved);
    expect(repository.save).toHaveBeenCalledWith(saved, "req-save");
    expect(logger.info).toHaveBeenCalledWith("investor_context_saving", {
      requestId: "req-save",
      hasObjective: true,
      hasTargetMonth: true,
    });
  });

  it("allows clearing both optional fields", async () => {
    repository.save.mockResolvedValue({
      objective: null,
      targetMonth: null,
      updatedAt: "2026-09-27T12:00:00.000Z",
    });

    await new InvestorContextService().save({
      objective: "   ",
      targetMonth: null,
    });

    expect(repository.save).toHaveBeenCalledWith(
      { objective: null, targetMonth: null },
      undefined,
    );
    expect(logger.info).toHaveBeenCalledWith("investor_context_saving", {
      requestId: undefined,
      hasObjective: false,
      hasTargetMonth: false,
    });
  });

  it("rejects invalid month, oversized objective, and unexpected fields", async () => {
    const service = new InvestorContextService();
    await expect(
      service.save({ objective: null, targetMonth: "2026-13" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.save({ objective: "x".repeat(161), targetMonth: null }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.save({
        objective: null,
        targetMonth: null,
        riskProfile: "moderate",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
