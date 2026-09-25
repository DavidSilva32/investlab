import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getAllocation: vi.fn(),
  updateClassification: vi.fn(),
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

  it("validates edits and delegates accepted values", async () => {
    const controller = new PortfolioAllocationController();
    const valid = {
      positionId: "b8b74f5e-784e-4ef6-aa9e-3ad9b330ca1a",
      assetClass: "Renda fixa",
      subClass: "CDB CDI",
      geography: "Brasil",
    };
    await controller.update(request(JSON.stringify(valid)), "req-2");
    expect(service.updateClassification).toHaveBeenCalledWith(valid, "req-2");
    await expect(
      controller.update(request("{"), "req-3"),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      controller.update(
        request(JSON.stringify({ ...valid, geography: "Europa" })),
        "req-4",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
