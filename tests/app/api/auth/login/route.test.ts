import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), session: vi.fn() }));
vi.mock("@/infrastructure/auth/credentials.service", () => ({
  credentialsService: { verify: mocks.verify },
}));
vi.mock("@/infrastructure/auth/session", () => ({
  createSession: mocks.session,
  sessionCookieName: "session",
}));
import { POST } from "@/app/api/auth/login/route";
const request = (body: unknown) =>
  new Request("http://test", { method: "POST", body: JSON.stringify(body) });
describe("login route", () => {
  it("rejects invalid payload and credentials", async () => {
    let response = await POST(request({}));
    expect(response.status).toBe(401);
    mocks.verify.mockResolvedValue(false);
    response = await POST(request({ email: "a", password: "b" }));
    expect(response.status).toBe(401);
  });
  it("sets an httpOnly session cookie after login", async () => {
    mocks.verify.mockResolvedValue(true);
    mocks.session.mockResolvedValue("token");
    const response = await POST(request({ email: "a", password: "b" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=token");
  });
});
