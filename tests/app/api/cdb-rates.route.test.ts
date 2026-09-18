import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

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
    expect(controller.update).toHaveBeenCalledWith(
      { assetCode: "CDB1", cdiPercentage: 100 },
      "request-1",
    );
    expect(controller.create).toHaveBeenCalledWith(
      { assetCodes: ["CDB1"], cdiPercentage: 100 },
      "request-1",
    );
  });

  it("returns the expected application error to the client", async () => {
    controller.update.mockRejectedValue(
      new ApplicationError("Configuração inválida", 422),
    );

    const response = await PUT(request({}));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      message: "Configuração inválida",
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("hides unexpected controller errors", async () => {
    controller.update.mockRejectedValue(new Error("db"));

    expect((await PUT(request({}))).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
  it("creates a request id when the caller has not supplied one", async () => {
    controller.create.mockResolvedValue(Response.json({ configured: 1 }));
    const response = await POST(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetCodes: ["CDB1"], cdiPercentage: 100 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(controller.create).toHaveBeenCalledWith(
      { assetCodes: ["CDB1"], cdiPercentage: 100 },
      expect.any(String),
    );
  });
  it("handles POST controller failures", async () => {
    controller.create.mockRejectedValue(new Error("db"));
    expect((await POST(request({}))).status).toBe(500);
  });
  it("creates a request id for PUT without a caller header", async () => {
    controller.update.mockResolvedValue(Response.json({ assetCode: "CDB1" }));
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(200);
  });
});
