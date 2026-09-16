import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
const verify = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/auth/session", () => ({
  sessionCookieName: "session",
  verifySession: verify,
}));
import { proxy } from "../../proxy";
describe("proxy authentication", () => {
  it("redirects unauthenticated pages and rejects APIs", async () => {
    verify.mockResolvedValue(false);
    expect(
      (await proxy(new NextRequest("http://test/"))).headers.get("location"),
    ).toContain("/login");
    expect(
      (await proxy(new NextRequest("http://test/api/positions"))).status,
    ).toBe(401);
  });
  it("allows login and authenticated requests", async () => {
    verify.mockResolvedValue(false);
    expect((await proxy(new NextRequest("http://test/login"))).status).toBe(
      200,
    );
    verify.mockResolvedValue(true);
    expect((await proxy(new NextRequest("http://test/"))).status).toBe(200);
  });
});
