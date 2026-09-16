import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  session: vi.fn(),
  logger: vi.fn(),
}));

vi.mock("@/infrastructure/auth/credentials.service", () => ({
  credentialsService: { verify: mocks.verify },
}));
vi.mock("@/infrastructure/auth/session", () => ({
  createSession: mocks.session,
  sessionCookieName: "session",
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.logger },
}));

import { POST } from "@/app/api/auth/login/route";

const request = (body: unknown) =>
  new Request("http://test", { method: "POST", body: JSON.stringify(body) });

describe("login route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects malformed JSON, an invalid e-mail and a non-string password", async () => {
    let response = await POST(
      new Request("http://test", { method: "POST", body: "{" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Informe um e-mail válido.",
    });

    response = await POST(request(null));
    expect(response.status).toBe(400);

    response = await POST(request({ email: "invalido", password: "senha" }));
    expect(response.status).toBe(400);

    response = await POST(request({ email: "usuario@exemplo.com" }));
    expect(response.status).toBe(401);
  });

  it("rejects credentials that do not correspond", async () => {
    mocks.verify.mockResolvedValue(false);

    const response = await POST(
      request({ email: "usuario@exemplo.com", password: "senha" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "E-mail ou senha incorretos.",
    });
  });

  it("returns a safe server error when authentication configuration fails", async () => {
    mocks.verify.mockRejectedValue(new Error("configuration is invalid"));

    const response = await POST(
      request({ email: "usuario@exemplo.com", password: "senha" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Não foi possível concluir o login.",
    });
    expect(mocks.logger).toHaveBeenCalledWith("auth_login_failed", {
      error: expect.any(Error),
    });
  });

  it("sets a session cookie after a successful login", async () => {
    mocks.verify.mockResolvedValue(true);
    mocks.session.mockResolvedValue("token");
    vi.stubEnv("NODE_ENV", "development");

    let response = await POST(
      request({ email: "usuario@exemplo.com", password: "senha" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=token");
    expect(response.headers.get("set-cookie")).not.toContain("; Secure");

    vi.stubEnv("NODE_ENV", "production");
    response = await POST(
      request({ email: "usuario@exemplo.com", password: "senha" }),
    );
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });
});
