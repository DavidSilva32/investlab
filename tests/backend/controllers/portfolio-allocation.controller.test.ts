import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getAllocation: vi.fn(),
  updateClassifications: vi.fn(),
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn() },
}));
import { PortfolioAllocationController } from "@/backend/controllers/portfolio-allocation.controller";

const request = (body: string) =>
  new Request("http://test/api/portfolio/allocation", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });

const firstId = "b8b74f5e-784e-4ef6-aa9e-3ad9b330ca1a";
const secondId = "a98bde34-1730-42ab-8c9c-97a88b52a7df";

describe("PortfolioAllocationController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns allocation positions", async () => {
    service.getAllocation.mockResolvedValue([{ id: "position-1" }]);
    const response = await new PortfolioAllocationController().get("req-1");
    expect(await response.json()).toEqual({
      positions: [{ id: "position-1" }],
    });
    expect(service.getAllocation).toHaveBeenCalledWith("req-1");
  });

  it("keeps single-position updates and allows partial field updates", async () => {
    service.updateClassifications.mockResolvedValue({ count: 1 });
    const controller = new PortfolioAllocationController();
    const valid = { positionId: firstId, assetClass: "Renda fixa" };
    const response = await controller.update(
      request(JSON.stringify(valid)),
      "req-2",
    );
    expect(await response.json()).toMatchObject({ count: 1 });
    expect(service.updateClassifications).toHaveBeenCalledWith(
      { positionIds: [firstId], assetClass: "Renda fixa" },
      "req-2",
    );
  });

  it("accepts multiple IDs and explicit null clearing", async () => {
    const controller = new PortfolioAllocationController();
    const body = { positionIds: [firstId, secondId], geography: null };
    await controller.update(request(JSON.stringify(body)), "req-3");
    expect(service.updateClassifications).toHaveBeenCalledWith(
      { positionIds: [firstId, secondId], geography: null },
      "req-3",
    );
  });

  it("rejects malformed, empty, duplicated, and conflicting updates", async () => {
    const controller = new PortfolioAllocationController();
    const invalidBodies = [
      "{",
      JSON.stringify({ positionId: firstId }),
      JSON.stringify({ positionIds: [] as string[], assetClass: null }),
      JSON.stringify({ positionIds: [firstId, firstId], assetClass: null }),
      JSON.stringify({ positionIds: ["invalid"], geography: null }),
      JSON.stringify({
        positionId: firstId,
        positionIds: [secondId],
        subClass: null,
      }),
      JSON.stringify({ positionId: firstId, geography: "Europa" }),
    ];
    for (const [index, body] of invalidBodies.entries()) {
      await expect(
        controller.update(request(body), `req-${index}`),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(service.updateClassifications).not.toHaveBeenCalled();
  });

  it("forwards an explicitly cleared subclasse without changing other fields", async () => {
    const controller = new PortfolioAllocationController();
    await controller.update(
      request(JSON.stringify({ positionId: firstId, subClass: null })),
      "req-subclass",
    );
    expect(service.updateClassifications).toHaveBeenCalledWith(
      { positionIds: [firstId], subClass: null },
      "req-subclass",
    );
  });
});
