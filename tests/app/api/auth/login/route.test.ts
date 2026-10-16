import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  checkLoginRateLimit: vi.fn(),
  canAttemptLogin: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
}));

vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { api: { signInEmail: mocks.signInEmail } },
}));
vi.mock("@/backend/services/auth.service", () => ({
  authService: {
    checkLoginRateLimit: mocks.checkLoginRateLimit,
    canAttemptLogin: mocks.canAttemptLogin,
    recordSuccessfulLogin: mocks.recordSuccessfulLogin,
  },
}));

import { POST } from "@/app/api/auth/login/route";

const request = (body: unknown) =>
  new Request("http://investlab.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "192.0.2.1" },
    body: JSON.stringify(body),
  });

describe("login route", () => {
  beforeEach(() => {
    mocks.signInEmail.mockReset();
    mocks.checkLoginRateLimit.mockReset().mockResolvedValue(null);
    mocks.canAttemptLogin.mockReset().mockResolvedValue(true);
    mocks.recordSuccessfulLogin.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns one generic invalid-credential response for unknown e-mails and bad passwords", async () => {
    mocks.signInEmail.mockResolvedValue(new Response("{}", { status: 401 }));
    const response = await POST(
      request({ email: "unknown@example.com", password: "incorrect" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "E-mail ou senha incorretos.",
    });
  });

  it("passes normalized credentials to Better Auth and preserves the HttpOnly cookie", async () => {
    mocks.signInEmail.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Set-Cookie":
            "better-auth.session_token=value; HttpOnly; SameSite=Lax",
        },
      }),
    );
    const response = await POST(
      request({ email: "  USER@Example.com ", password: "a-long-password" }),
    );
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: "user@example.com", password: "a-long-password" },
        asResponse: true,
      }),
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("returns Retry-After for distributed throttling before credential verification", async () => {
    mocks.checkLoginRateLimit.mockResolvedValue(42);
    const response = await POST(
      request({ email: "user@example.com", password: "incorrect" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("fails closed when the PostgreSQL rate limiter is unavailable", async () => {
    mocks.checkLoginRateLimit.mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await POST(
      request({ email: "user@example.com", password: "incorrect" }),
    );
    expect(response.status).toBe(503);
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("does not create or promote an account when Better Auth rejects credentials", async () => {
    mocks.signInEmail.mockResolvedValue(new Response("{}", { status: 401 }));
    const response = await POST(
      request({ email: "legacy@example.com", password: "legacy-password" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "E-mail ou senha incorretos.",
    });
    expect(mocks.signInEmail).toHaveBeenCalledOnce();
  });

  it("rejects malformed JSON and credentials", async () => {
    expect(
      (await POST(new Request("http://test", { method: "POST", body: "{" })))
        .status,
    ).toBe(401);
    expect((await POST(request({ email: "bad", password: "x" }))).status).toBe(
      401,
    );
  });
});
