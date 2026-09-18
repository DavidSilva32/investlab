import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  configureOne: vi.fn(),
  configureMany: vi.fn(),
}));
vi.mock("@/backend/services/cdb-rate.service", () => ({
  cdbRateService: service,
}));

import { CdbRateController } from "@/backend/controllers/cdb-rate.controller";

describe("CdbRateController", () => {
  it("serializes configuration service results for individual and array contracts", async () => {
    service.configureOne.mockResolvedValue({ assetCode: "CDB1" });
    service.configureMany.mockResolvedValue({ configured: 2 });
    const controller = new CdbRateController();

    await expect(
      (await controller.update({ assetCode: "CDB1" }, "request-1")).json(),
    ).resolves.toEqual({ assetCode: "CDB1" });
    await expect(
      (await controller.create({ assetCodes: ["CDB1"] }, "request-1")).json(),
    ).resolves.toEqual({ configured: 2 });
    await expect(
      (await controller.create({}, "request-1")).json(),
    ).resolves.toEqual({ configured: 2 });
  });
});
