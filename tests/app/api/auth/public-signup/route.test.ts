import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicSignup: vi.fn(),
}));

vi.mock("@/backend/controllers/auth.controller", () => ({
  authController: { publicSignup: mocks.publicSignup },
}));
import { POST } from "@/app/api/auth/public-signup/route";

describe("public signup route", () => {
  beforeEach(() => {
    mocks.publicSignup
      .mockReset()
      .mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
  });

  it("delegates the public POST to the controller", async () => {
    const request = new Request(
      "https://investlab.test/api/auth/public-signup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "person@example.com" }),
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.publicSignup).toHaveBeenCalledWith(request);
  });
});
