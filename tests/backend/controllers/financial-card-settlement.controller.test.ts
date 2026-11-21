import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { service, logger } = vi.hoisted(() => ({
  service: { listReview: vi.fn(), resolve: vi.fn() },
  logger: { info: vi.fn() },
}));
vi.mock("@/backend/services/financial-card-settlement.service", () => ({
  financialCardSettlementService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { FinancialCardSettlementController } from "@/backend/controllers/financial-card-settlement.controller";

describe("FinancialCardSettlementController", () => {
  const controller = new FinancialCardSettlementController();

  beforeEach(() => vi.resetAllMocks());

  it("returns review data and logs counts", async () => {
    const data = {
      settlements: [{ id: "invoice" }],
      cardEntries: [{ id: "buy" }],
    };
    service.listReview.mockResolvedValue(data);
    const response = await controller.getReview("req-review");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
    expect(logger.info).toHaveBeenCalledWith(
      "financial_card_settlement_review_loaded",
      { requestId: "req-review", pendingCount: 1, availableCardEntryCount: 1 },
    );
  });

  it("resolves explicit decisions and logs the outcome", async () => {
    service.resolve.mockResolvedValue({ resolution: "LINKED" });
    const body = { resolution: "LINKED", cardEntryIds: ["buy"] };
    const response = await controller.resolve(body, "req-linked");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resolution: "LINKED",
      message: "Conferência salva.",
    });
    expect(service.resolve).toHaveBeenCalledWith(body);
    expect(logger.info).toHaveBeenCalledWith(
      "financial_card_settlement_resolved",
      { requestId: "req-linked", resolution: "LINKED" },
    );
  });

  it("lets the route convert service failures into client-safe responses", async () => {
    service.resolve.mockRejectedValue(
      new ApplicationError("A compra já está vinculada.", 409),
    );
    await expect(controller.resolve({}, "req-failure")).rejects.toMatchObject({
      statusCode: 409,
      message: "A compra já está vinculada.",
    });
  });
});
