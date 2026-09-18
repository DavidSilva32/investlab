import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ upsert: vi.fn(), upsertMany: vi.fn() }));
vi.mock("@/backend/repositories/cdb-rate.repository", () => ({
  cdbRateRepository: repository,
}));

import { CdbRateService } from "@/backend/services/cdb-rate.service";

describe("CdbRateService", () => {
  beforeEach(() => vi.clearAllMocks());
  it("normalizes individual and bulk configurations", async () => {
    repository.upsert.mockResolvedValue({ assetCode: "CDB1" });
    repository.upsertMany.mockResolvedValue(2);
    const service = new CdbRateService();
    await service.configureOne({ assetCode: " cdb1 ", cdiPercentage: 100 });
    await expect(
      service.configureMany({
        assetCodes: ["cdb1", "CDB1", "cdb2"],
        cdiPercentage: "110",
      }),
    ).resolves.toEqual({ configured: 2 });
    expect(repository.upsert).toHaveBeenCalledWith("CDB1", "100.0000");
    expect(repository.upsertMany).toHaveBeenCalledWith(
      ["CDB1", "CDB2"],
      "110.0000",
    );
  });
  it("rejects invalid codes and percentages", async () => {
    const service = new CdbRateService();
    await expect(
      service.configureOne({ assetCode: "", cdiPercentage: 100 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.configureOne({ assetCode: "CDB1", cdiPercentage: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.configureMany({ assetCodes: ["CDB1", 1], cdiPercentage: 100 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
