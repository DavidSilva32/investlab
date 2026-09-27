import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/investor-context.service", () => ({
  investorContextService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { InvestorContextController } from "@/backend/controllers/investor-context.controller";

describe("InvestorContextController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current context", async () => {
    const context = { objective: null, targetMonth: null, updatedAt: null };
    service.get.mockResolvedValue(context);

    await expect(new InvestorContextController().get("req-1")).resolves.toEqual(
      {
        context,
      },
    );
    expect(service.get).toHaveBeenCalledWith("req-1");
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "investor_context_requested",
      {
        requestId: "req-1",
      },
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "investor_context_responded",
      {
        requestId: "req-1",
      },
    );
  });

  it("saves a supplied context without logging its content", async () => {
    const body = { objective: "Aposentadoria", targetMonth: "2040-06" };
    const context = {
      objective: body.objective,
      targetMonth: body.targetMonth,
      updatedAt: "2026-09-27T12:00:00.000Z",
    };
    service.save.mockResolvedValue(context);

    await expect(
      new InvestorContextController().update(body, "req-2"),
    ).resolves.toEqual({
      message: "Objetivo e prazo salvos.",
      context,
    });
    expect(service.save).toHaveBeenCalledWith(body, "req-2");
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "investor_context_update_requested",
      { requestId: "req-2" },
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "investor_context_update_responded",
      { requestId: "req-2" },
    );
  });
});
