import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  checkLoginRateLimit: vi.fn(),
  canAttemptLogin: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
  verify: vi.fn(),
  bootstrap: vi.fn(),
}));

vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { api: { signInEmail: mocks.signInEmail } },
}));
vi.mock("@/infrastructure/auth/credentials.service", () => ({
  credentialsService: { verify: mocks.verify },
}));
vi.mock("@/infrastructure/auth/auth-configuration", () => ({
  getCredentialsConfiguration: () => ({ email: "legacy@example.com" }),
}));
vi.mock("@/backend/services/auth.service", () => ({
  authService: {
    checkLoginRateLimit: mocks.checkLoginRateLimit,
    canAttemptLogin: mocks.canAttemptLogin,
    recordSuccessfulLogin: mocks.recordSuccessfulLogin,
    bootstrapLegacyAdministrator: mocks.bootstrap,
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
    mocks.verify.mockReset();
    mocks.bootstrap.mockReset();
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
    expect(mocks.verify).not.toHaveBeenCalled();
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

  it("migrates the configured legacy credential only when no Better Auth user exists", async () => {
    mocks.signInEmail
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    mocks.verify.mockResolvedValue(true);
    mocks.bootstrap.mockResolvedValue(true);
    const response = await POST(
      request({ email: "LEGACY@example.com", password: "legacy-password" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.bootstrap).toHaveBeenCalledWith(
      "legacy@example.com",
      "legacy-password",
    );
  });

  it("does not promote or create legacy admin when users already exist", async () => {
    mocks.signInEmail.mockResolvedValue(new Response("{}", { status: 401 }));
    mocks.verify.mockResolvedValue(true);
    mocks.bootstrap.mockResolvedValue(false);
    const response = await POST(
      request({ email: "legacy@example.com", password: "legacy-password" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
  });

  it("retries legacy ADMIN promotion on a later successful sign-in", async () => {
    mocks.signInEmail.mockResolvedValue(new Response("{}", { status: 200 }));
    mocks.verify.mockResolvedValue(true);
    mocks.bootstrap.mockResolvedValue(true);
    const response = await POST(
      request({ email: "legacy@example.com", password: "legacy-password" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.bootstrap).toHaveBeenCalledWith(
      "legacy@example.com",
      "legacy-password",
    );
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
