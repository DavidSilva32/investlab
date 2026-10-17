vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  reconciliationSummary: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  importController: {
    delete: mocks.delete,
    reconciliationSummary: mocks.reconciliationSummary,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { DELETE, GET } from "@/app/api/imports/route";
import { ApplicationError } from "@/backend/errors/application-error";

describe("imports deletion route", () => {
  it("delegates the requested document type", async () => {
    mocks.delete.mockResolvedValue(
      new Response(JSON.stringify({ deletedImports: 1 })),
    );
    const response = await DELETE(
      new Request("http://test/api/imports?documentType=B3_POSITION_XLSX", {
        method: "DELETE",
      }),
    );
    await expect(response.json()).resolves.toEqual({ deletedImports: 1 });
    expect(mocks.delete).toHaveBeenCalledWith(
      "B3_POSITION_XLSX",
      expect.any(String),
      null,
    );
  });

  it("returns expected and unexpected deletion errors", async () => {
    mocks.delete.mockRejectedValueOnce(
      new ApplicationError("Tipo inválido.", 400),
    );
    const rejected = await DELETE(
      new Request("http://test/api/imports?documentType=x", {
        method: "DELETE",
        headers: { "x-request-id": "request-1" },
      }),
    );
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({
      message: "Tipo inválido.",
    });
    expect(mocks.logger.warn).toHaveBeenCalled();
    mocks.delete.mockRejectedValueOnce(new Error("secret"));
    const failed = await DELETE(
      new Request("http://test/api/imports?documentType=x", {
        method: "DELETE",
      }),
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível excluir os dados.",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

describe("imports reconciliation summary route", () => {
  it("returns the persisted reconciliation summary", async () => {
    mocks.reconciliationSummary.mockResolvedValue(
      Response.json({
        candidates: [],
        confirmed: [],
        ambiguous: [],
        separated: [],
      }),
    );
    const response = await GET(new Request("http://test/api/imports"));
    await expect(response.json()).resolves.toEqual({
      candidates: [],
      confirmed: [],
      ambiguous: [],
      separated: [],
    });
    expect(mocks.reconciliationSummary).toHaveBeenCalledWith(
      expect.any(String),
    );
  });

  it("returns expected and unexpected summary errors", async () => {
    mocks.reconciliationSummary.mockRejectedValueOnce(
      new ApplicationError("Não autorizado.", 403),
    );
    const expected = await GET(new Request("http://test/api/imports"));
    expect(expected.status).toBe(403);
    mocks.reconciliationSummary.mockRejectedValueOnce(new Error("secret"));
    const failed = await GET(new Request("http://test/api/imports"));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível consultar as reconciliações.",
    });
  });
});
