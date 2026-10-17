import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  getTermsAcceptances: vi.fn(),
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
});
