import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  upsert: vi.fn(),
  configureMissing: vi.fn(),
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/repositories/cdb-rate.repository", () => ({
  cdbRateRepository: repository,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST, PUT } from "@/app/api/cdb-rates/route";

describe("cdb rates route", () => {
  beforeEach(() => vi.clearAllMocks());
  const request = (method: string, body: unknown) =>
    new Request("http://localhost/api/cdb-rates", {
      method,
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-1",
      },
      body: JSON.stringify(body),
    });

  it("saves an individual normalized CDB rate", async () => {
    repository.upsert.mockResolvedValue({
      assetCode: "CDB1",
      cdiPercentage: "100.0000",
    });
    const response = await PUT(
      request("PUT", { assetCode: " cdb1 ", cdiPercentage: 100 }),
    );
    expect(response.status).toBe(200);
    expect(repository.upsert).toHaveBeenCalledWith("CDB1", "100.0000");
  });

  it("configures only the supplied distinct CDBs in bulk", async () => {
    repository.configureMissing.mockResolvedValue(2);
    const response = await POST(
      request("POST", {
        assetCodes: ["cdb1", "CDB1", "cdb2"],
        cdiPercentage: "110",
      }),
    );
    expect(await response.json()).toEqual({ configured: 2 });
    expect(repository.configureMissing).toHaveBeenCalledWith(
      ["CDB1", "CDB2"],
      "110.0000",
    );
  });

  it("rejects invalid configuration requests", async () => {
    const invalidPercentage = await PUT(
      request("PUT", { assetCode: "CDB1", cdiPercentage: 0 }),
    );
    const invalidCodes = await POST(
      request("POST", { assetCodes: "CDB1", cdiPercentage: 100 }),
    );
    expect(invalidPercentage.status).toBe(400);
    expect(invalidCodes.status).toBe(400);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("hides unexpected persistence errors", async () => {
    repository.upsert.mockRejectedValue(new Error("database"));
    const response = await PUT(
      request("PUT", { assetCode: "CDB1", cdiPercentage: 100 }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível salvar a configuração.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

it("rejects an empty individual code and uses a generated request id when missing", async () => {
  const response = await PUT(
    new Request("http://localhost/api/cdb-rates", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetCode: "  ", cdiPercentage: 1001 }),
    }),
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("x-request-id")).toBeTruthy();
});

it("rejects a non-string code in a bulk list", async () => {
  const response = await POST(
    new Request("http://localhost/api/cdb-rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetCodes: ["CDB1", 2], cdiPercentage: 100 }),
    }),
  );
  expect(response.status).toBe(400);
});
