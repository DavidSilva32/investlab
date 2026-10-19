vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn(async () => true) },
}));

import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "USER" })),
  isLegacyPortfolioOwner: vi.fn(async () => false),
}));

const mocks = vi.hoisted(() => ({
  saveReconciliationDecisions: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  importController: {
    saveReconciliationDecisions: mocks.saveReconciliationDecisions,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { POST } from "@/app/api/imports/reconciliation/route";
import { ApplicationError } from "@/backend/errors/application-error";

describe("B3 reconciliation decisions route", () => {
  it("delegates a valid decision body to the controller", async () => {
    mocks.saveReconciliationDecisions.mockResolvedValue(
      Response.json({ confirmed: [] }),
    );
    const request = new Request("http://test/api/imports/reconciliation", {
      method: "POST",
      body: JSON.stringify({ decisions: [] }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    await expect(response.json()).resolves.toEqual({ confirmed: [] });
    expect(mocks.saveReconciliationDecisions).toHaveBeenCalledWith(
      request,
      expect.any(String),
    );
  });

  it("returns expected and unexpected failures without exposing internal detail", async () => {
    mocks.saveReconciliationDecisions.mockRejectedValueOnce(
      new ApplicationError("Decisão desatualizada.", 409),
    );
    const expected = await POST(
      new Request("http://test/api/imports/reconciliation", { method: "POST" }),
    );
    expect(expected.status).toBe(409);
    await expect(expected.json()).resolves.toEqual({
      message: "Decisão desatualizada.",
    });
    mocks.saveReconciliationDecisions.mockRejectedValueOnce(
      new Error("private detail"),
    );
    const failed = await POST(
      new Request("http://test/api/imports/reconciliation", { method: "POST" }),
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível atualizar a reconciliação.",
    });
  });
});
