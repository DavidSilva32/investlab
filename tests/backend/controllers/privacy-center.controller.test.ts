import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  getTermsAcceptances: vi.fn(),
  acceptCurrentTerms: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
}));
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: mocks,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

import { PrivacyCenterController } from "@/backend/controllers/privacy-center.controller";

describe("PrivacyCenterController", () => {
  const controller = new PrivacyCenterController();
  const request = new Request("https://test/api/privacy/terms-acceptances");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns the authenticated user's terms history without caching", async () => {
    const data = {
      currentTermsVersion: "2026-10-17",
      termsAcceptances: [],
    };
    mocks.getTermsAcceptances.mockResolvedValue(data);

    const response = await controller.getTermsAcceptances(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(data);
    expect(mocks.getTermsAcceptances).toHaveBeenCalledWith("user-1");
  });

  it("returns client-safe authentication errors", async () => {
    mocks.requireAuthenticatedUser.mockRejectedValueOnce(
      new ApplicationError("Unauthenticated", 401),
    );

    const response = await controller.getTermsAcceptances(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      message: "Unauthenticated",
    });
  });

  it("hides unexpected failures", async () => {
    mocks.getTermsAcceptances.mockRejectedValueOnce(
      new Error("private database detail"),
    );

    const response = await controller.getTermsAcceptances(request);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain(
      "private database detail",
    );
  });

  it("records only the authenticated user's exact current-version acceptance", async () => {
    const body = new Request("https://test/api/privacy/terms-acceptances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ termsVersion: "terms-2026-10-19.1" }),
    });
    mocks.acceptCurrentTerms.mockResolvedValueOnce({ recorded: true });

    const response = await controller.acceptCurrentTerms(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.acceptCurrentTerms).toHaveBeenCalledWith(
      "user-1",
      "terms-2026-10-19.1",
    );
    await expect(response.json()).resolves.toEqual({ recorded: true });
  });

  it("rejects malformed terms acceptance payloads", async () => {
    const response = await controller.acceptCurrentTerms(
      new Request("https://test/api/privacy/terms-acceptances", {
        method: "POST",
        body: JSON.stringify({ termsVersion: "old", userId: "forged" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.acceptCurrentTerms).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies without calling the service", async () => {
    const response = await controller.acceptCurrentTerms(
      new Request("https://test/api/privacy/terms-acceptances", {
        method: "POST",
        body: "{invalid json",
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      message: "Leia e aceite a versão vigente dos Termos de Uso.",
    });
    expect(mocks.acceptCurrentTerms).not.toHaveBeenCalled();
  });

  it("returns stale-version conflicts without claiming acceptance", async () => {
    mocks.acceptCurrentTerms.mockRejectedValueOnce(
      new ApplicationError("Stale Terms version", 409),
    );
    const response = await controller.acceptCurrentTerms(
      new Request("https://test/api/privacy/terms-acceptances", {
        method: "POST",
        body: JSON.stringify({ termsVersion: "old-version" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Stale Terms version",
    });
  });

  it("hides unexpected acceptance failures", async () => {
    mocks.acceptCurrentTerms.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const response = await controller.acceptCurrentTerms(
      new Request("https://test/api/privacy/terms-acceptances", {
        method: "POST",
        body: JSON.stringify({ termsVersion: "terms-2026-10-19.1" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.not.toContain(
      "private database detail",
    );
  });
});
