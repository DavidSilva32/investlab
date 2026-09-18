import { beforeEach, describe, expect, it, vi } from "vitest";
const controller = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn() }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/cdb-rate.controller", () => ({
  cdbRateController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { POST, PUT } from "@/app/api/cdb-rates/route";
const request = (body: unknown) =>
  new Request("http://test", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-request-id": "request-1",
    },
    body: JSON.stringify(body),
  });
describe("cdb rates route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("delegates individual and bulk contracts to its controller", async () => {
    controller.update.mockResolvedValue(Response.json({ assetCode: "CDB1" }));
    controller.create.mockResolvedValue(Response.json({ configured: 2 }));
    expect(
      (await PUT(request({ assetCode: "CDB1", cdiPercentage: 100 }))).status,
    ).toBe(200);
    expect(
      (await POST(request({ assetCodes: ["CDB1"], cdiPercentage: 100 })))
        .status,
    ).toBe(200);
    expect(controller.update).toHaveBeenCalledWith({
      assetCode: "CDB1",
      cdiPercentage: 100,
    });
    expect(controller.create).toHaveBeenCalledWith({
      assetCodes: ["CDB1"],
      cdiPercentage: 100,
    });
  });
  it("hides expected and unexpected controller errors", async () => {
    controller.update
      .mockRejectedValueOnce({
        message: "Inválido",
        statusCode: 400,
        constructor: { name: "ApplicationError" },
      })
      .mockRejectedValueOnce(new Error("db"));
    const first = await PUT(request({}));
    const second = await PUT(request({}));
    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
