import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
const verify = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/auth/session", () => ({
  sessionCookieName: "session",
  verifySession: verify,
}));
import { proxy } from "../src/proxy";
describe("proxy authentication", () => {
  it("redirects unauthenticated pages and rejects APIs", async () => {
    verify.mockResolvedValue(false);
    expect(
      (await proxy(new NextRequest("http://test/"))).headers.get("location"),
    ).toContain("/login");
    const response = await proxy(new NextRequest("http://test/api/screener"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires a session for the remaining screener API routes", async () => {
    verify.mockResolvedValue(false);
    expect(
      (
        await proxy(
          new NextRequest("http://test/api/screener", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await proxy(new NextRequest("http://test/api/settings/screener")))
        .status,
    ).toBe(401);
    expect(
      (
        await proxy(
          new NextRequest("http://test/api/settings/screener/sync", {
            method: "POST",
          }),
        )
      ).status,
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

  it("keeps login public and redirects an authenticated login without caching", async () => {
    verify.mockResolvedValue(true);
    const response = await proxy(new NextRequest("http://test/login"));
    expect(response.headers.get("location")).toBe("http://test/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
