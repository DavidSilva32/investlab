import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateOwnProfile: vi.fn(),
}));

vi.mock("@/backend/controllers/auth.controller", () => ({
  authController: {
    updateOwnProfile: mocks.updateOwnProfile,
  },
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));

import { PATCH } from "@/app/api/auth/profile/route";

describe("profile routes", () => {
  beforeEach(() => {
    mocks.updateOwnProfile
      .mockReset()
      .mockResolvedValue(Response.json({ ok: true }));
  });

  it("delegates profile name updates to the controller", async () => {
    const request = new Request("https://test/api/auth/profile", {
      method: "PATCH",
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith(request);
  });
});
