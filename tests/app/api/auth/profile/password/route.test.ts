import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ changeOwnPassword: vi.fn() }));

vi.mock("@/backend/controllers/auth.controller", () => ({
  authController: { changeOwnPassword: mocks.changeOwnPassword },
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));

import { POST } from "@/app/api/auth/profile/password/route";

describe("profile password route", () => {
  beforeEach(() => {
    mocks.changeOwnPassword
      .mockReset()
      .mockResolvedValue(Response.json({ ok: true }));
  });

  it("delegates password changes to the authenticated controller", async () => {
    const request = new Request("https://test/api/auth/profile/password", {
      method: "POST",
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.changeOwnPassword).toHaveBeenCalledWith(request);
  });
});
