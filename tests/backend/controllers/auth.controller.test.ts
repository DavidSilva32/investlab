import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  service: {
    listAdministrationData: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    revokePasswordReset: vi.fn(),
    activateInvitation: vi.fn(),
    createPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    checkLoginRateLimit: vi.fn(),
    canAttemptLogin: vi.fn(),
    recordSuccessfulLogin: vi.fn(),
    updateManagedUser: vi.fn(),
    updateOwnProfile: vi.fn(),
    changeOwnPassword: vi.fn(),
  },
  requireAuthenticatedUser: vi.fn(),
  requireRole: vi.fn(),
  signInEmail: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/backend/services/auth.service", () => ({
  authService: mocks.service,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
  requireRole: mocks.requireRole,
}));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: {
    api: { signInEmail: mocks.signInEmail },
    $context: Promise.resolve({ password: { hash: vi.fn() } }),
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: mocks.logger,
}));

import { AuthController } from "@/backend/controllers/auth.controller";

const admin = { id: "admin-1", role: "ADMIN" };
const request = (body?: unknown) =>
  new Request("https://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("AuthController", () => {
  const controller = new AuthController();

  beforeEach(() => {
    Object.values(mocks.service).forEach((mock) => mock.mockReset());
    mocks.requireAuthenticatedUser.mockReset().mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      name: "Person",
    });
    mocks.service.checkLoginRateLimit.mockResolvedValue(null);
    mocks.service.canAttemptLogin.mockResolvedValue(true);
    mocks.service.recordSuccessfulLogin.mockResolvedValue(true);
    mocks.requireRole.mockReset().mockResolvedValue(admin);
    mocks.signInEmail
      .mockReset()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    mocks.logger.error.mockReset();
  });

  it("validates and updates only the current profile name", async () => {
    mocks.service.updateOwnProfile.mockResolvedValue(
      Response.json({ ok: true }),
    );
    const success = await controller.updateOwnProfile(
      request({ name: " New Person " }),
    );
    expect(success.status).toBe(200);
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(mocks.service.updateOwnProfile).toHaveBeenCalledWith(
      "New Person",
      expect.any(Headers),
    );

    expect(
      (await controller.updateOwnProfile(request({ name: " " }))).status,
    ).toBe(400);
    expect(
      (await controller.updateOwnProfile(request({ name: " " }))).headers.get(
        "cache-control",
      ),
    ).toBe("no-store");
    expect(
      (
        await controller.updateOwnProfile(
          request({ name: "New", email: "other@example.com" }),
        )
      ).status,
    ).toBe(400);
    mocks.requireAuthenticatedUser.mockRejectedValueOnce(
      new ApplicationError("Denied", 401),
    );
    expect(
      (await controller.updateOwnProfile(request({ name: "New" }))).status,
    ).toBe(401);
    expect(mocks.service.updateOwnProfile).toHaveBeenCalledOnce();
  });

  it("validates and changes only the current user's password", async () => {
    mocks.service.changeOwnPassword.mockResolvedValue(
      Response.json({ ok: true }),
    );
    const success = await controller.changeOwnPassword(
      request({
        currentPassword: "old-password",
        newPassword: "new-password-long",
        confirmPassword: "new-password-long",
      }),
    );
    expect(success.status).toBe(200);
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(mocks.service.changeOwnPassword).toHaveBeenCalledWith(
      "old-password",
      "new-password-long",
      expect.any(Headers),
    );

    expect(
      (
        await controller.changeOwnPassword(
          request({
            currentPassword: "old-password",
            newPassword: "short",
            confirmPassword: "short",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await controller.changeOwnPassword(
          request({
            currentPassword: "old-password",
            newPassword: "new-password-long",
            confirmPassword: "different-password",
          }),
        )
      ).status,
    ).toBe(400);
    mocks.requireAuthenticatedUser.mockRejectedValueOnce(
      new ApplicationError("Denied", 401),
    );
    expect(
      (
        await controller.changeOwnPassword(
          request({
            currentPassword: "old-password",
            newPassword: "new-password-long",
            confirmPassword: "new-password-long",
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("returns administrative data and maps service failures to safe responses", async () => {
    mocks.service.listAdministrationData.mockResolvedValueOnce({ users: [] });
    const success = await controller.adminData(new Request("https://test"));
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ users: [] });

    mocks.service.listAdministrationData.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (await controller.adminData(new Request("https://test"))).status,
    ).toBe(403);
    mocks.service.listAdministrationData.mockRejectedValueOnce(new Error("db"));
    const failure = await controller.adminData(new Request("https://test"));
    expect(failure.status).toBe(500);
    await expect(failure.json()).resolves.toEqual({
      message: "Não foi possível concluir a solicitação.",
    });
  });

  it("updates managed users only after administrator authorization and strict validation", async () => {
    const success = await controller.updateUser(
      request({ name: " New Name ", role: "USER", isActive: false }),
      "user-1",
    );
    expect(success.status).toBe(200);
    expect(mocks.service.updateManagedUser).toHaveBeenCalledWith({
      id: "user-1",
      actorId: "admin-1",
      name: "New Name",
      role: "USER",
      isActive: false,
    });

    expect(
      (
        await controller.updateUser(
          request({ email: "changed@example.com" }),
          "u1",
        )
      ).status,
    ).toBe(400);
    mocks.requireRole.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (await controller.updateUser(request({ name: "A" }), "u1")).status,
    ).toBe(403);
  });

  it("validates and creates invitations only for administrators", async () => {
    const invalid = await controller.createInvite(request({ email: "bad" }));
    expect(invalid.status).toBe(400);
    mocks.service.createInvitation.mockResolvedValueOnce({
      url: "/convite/one-time",
    });
    const success = await controller.createInvite(
      request({ email: "person@example.com" }),
    );
    expect(success.status).toBe(201);
    expect(mocks.service.createInvitation).toHaveBeenCalledWith(
      "person@example.com",
      "admin-1",
    );
    mocks.requireRole.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (await controller.createInvite(request({ email: "person@example.com" })))
        .status,
    ).toBe(403);
  });

  it("handles malformed invitation JSON and maps invitation service errors", async () => {
    const malformed = new Request("https://test", {
      method: "POST",
      body: "{",
    });
    expect((await controller.createInvite(malformed)).status).toBe(400);
    mocks.service.createInvitation.mockRejectedValueOnce(
      new ApplicationError("Conflict", 409),
    );
    expect(
      (await controller.createInvite(request({ email: "person@example.com" })))
        .status,
    ).toBe(409);
  });

  it("revokes invitation and reset links through administrator services", async () => {
    const inviteResult = await controller.revokeInvite(
      new Request("https://test"),
      "invite-1",
    );
    const resetResult = await controller.revokePasswordReset(
      new Request("https://test"),
      "reset-1",
    );
    expect(await inviteResult.json()).toEqual({ ok: true });
    expect(await resetResult.json()).toEqual({ ok: true });
    expect(mocks.service.revokeInvitation).toHaveBeenCalledWith("invite-1");
    expect(mocks.service.revokePasswordReset).toHaveBeenCalledWith("reset-1");
  });

  it("returns safe errors when revocation services or authorization fail", async () => {
    mocks.service.revokeInvitation.mockRejectedValueOnce(
      new ApplicationError("Conflict", 409),
    );
    expect(
      (await controller.revokeInvite(new Request("https://test"), "invite-1"))
        .status,
    ).toBe(409);

    mocks.service.revokePasswordReset.mockRejectedValueOnce(
      new Error("database detail"),
    );
    expect(
      (
        await controller.revokePasswordReset(
          new Request("https://test"),
          "reset-1",
        )
      ).status,
    ).toBe(500);

    mocks.requireRole.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (await controller.revokeInvite(new Request("https://test"), "invite-1"))
        .status,
    ).toBe(403);
  });

  it("validates invitation activation payloads and activates the bound invite", async () => {
    expect(
      (await controller.activateInvite(request({ token: "short" }))).status,
    ).toBe(400);
    const success = await controller.activateInvite(
      request({
        token: "i".repeat(40),
        name: "  New User  ",
        password: "A-long-password-123",
      }),
    );
    expect(await success.json()).toEqual({ ok: true });
    expect(mocks.service.activateInvitation).toHaveBeenCalledWith(
      "i".repeat(40),
      "New User",
      "A-long-password-123",
    );
  });

  it("maps activation failures without exposing unexpected details", async () => {
    mocks.service.activateInvitation.mockRejectedValueOnce(
      new ApplicationError("Invite unavailable", 400),
    );
    expect(
      (
        await controller.activateInvite(
          request({
            token: "i".repeat(40),
            name: "Invitee",
            password: "A-long-password-123",
          }),
        )
      ).status,
    ).toBe(400);
    mocks.service.activateInvitation.mockRejectedValueOnce(
      new Error("secret database detail"),
    );
    const response = await controller.activateInvite(
      request({
        token: "i".repeat(40),
        name: "Invitee",
        password: "A-long-password-123",
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret database detail");
  });

  it("issues assisted password resets only for administrators", async () => {
    expect(
      (await controller.createPasswordReset(request({ email: "invalid" })))
        .status,
    ).toBe(400);
    mocks.service.createPasswordReset.mockResolvedValueOnce({
      url: "/redefinir-senha/opaque",
    });
    const success = await controller.createPasswordReset(
      request({ email: "person@example.com" }),
    );
    expect(success.status).toBe(201);
    expect(mocks.service.createPasswordReset).toHaveBeenCalledWith(
      "person@example.com",
      "admin-1",
    );
    mocks.service.createPasswordReset.mockRejectedValueOnce(
      new ApplicationError("Unknown account", 404),
    );
    expect(
      (
        await controller.createPasswordReset(
          request({ email: "person@example.com" }),
        )
      ).status,
    ).toBe(404);
    mocks.requireRole.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (
        await controller.createPasswordReset(
          request({ email: "person@example.com" }),
        )
      ).status,
    ).toBe(403);
  });

  it("validates and consumes password reset tokens", async () => {
    expect(
      (await controller.resetPassword(request({ token: "short" }))).status,
    ).toBe(400);
    const success = await controller.resetPassword(
      request({ token: "r".repeat(40), password: "A-long-password-123" }),
    );
    expect(await success.json()).toEqual({ ok: true });
    expect(mocks.service.resetPassword).toHaveBeenCalledWith(
      "r".repeat(40),
      "A-long-password-123",
    );
    mocks.service.resetPassword.mockRejectedValueOnce(
      new ApplicationError("Invalid reset", 400),
    );
    expect(
      (
        await controller.resetPassword(
          request({ token: "r".repeat(40), password: "A-long-password-123" }),
        )
      ).status,
    ).toBe(400);
  });

  it("normalizes valid login input and returns a generic response for invalid credentials", async () => {
    expect((await controller.login(request({ email: "bad" }))).status).toBe(
      401,
    );
    const response = new Response("{}", { status: 401 });
    mocks.signInEmail.mockResolvedValueOnce(response);
    const invalid = await controller.login(
      request({ email: " User@Example.com ", password: "incorrect" }),
    );
    expect(invalid.status).toBe(401);
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: "user@example.com", password: "incorrect" },
      }),
    );
  });

  it("enforces rate limits and fails closed when the limiter is unavailable", async () => {
    mocks.service.checkLoginRateLimit.mockResolvedValueOnce(25);
    const limited = await controller.login(
      request({ email: "user@example.com", password: "password" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("25");
    mocks.service.checkLoginRateLimit.mockRejectedValueOnce(new Error("db"));
    expect(
      (
        await controller.login(
          request({ email: "user@example.com", password: "password" }),
        )
      ).status,
    ).toBe(503);
  });

  it("rejects disabled accounts with the generic credential response", async () => {
    mocks.service.canAttemptLogin.mockResolvedValueOnce(false);
    const response = await controller.login(
      request({ email: "disabled@example.com", password: "password" }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "E-mail ou senha incorretos.",
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("completes valid sign-ins without creating or promoting accounts", async () => {
    const success = new Response("signed-in", { status: 200 });
    mocks.signInEmail.mockResolvedValueOnce(success);
    await expect(
      controller.login(
        request({ email: "person@example.com", password: "password" }),
      ),
    ).resolves.toBe(success);
    expect(mocks.service.createInvitation).not.toHaveBeenCalled();
    expect(mocks.signInEmail).toHaveBeenCalledOnce();
  });

  it("does not return a session when account activation loses a concurrent race", async () => {
    const signedIn = new Response("signed-in", {
      status: 200,
      headers: { "Set-Cookie": "better-auth.session_token=opaque; HttpOnly" },
    });
    mocks.signInEmail.mockResolvedValueOnce(signedIn);
    mocks.service.recordSuccessfulLogin.mockResolvedValueOnce(false);

    const response = await controller.login(
      request({ email: "person@example.com", password: "password" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "E-mail ou senha incorretos.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("maps Better Auth throttling and hides unexpected sign-in failures", async () => {
    mocks.signInEmail.mockResolvedValueOnce(
      new Response("{}", {
        status: 429,
        headers: { "Retry-After": "80" },
      }),
    );
    const limited = await controller.login(
      request({ email: "person@example.com", password: "password" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("80");
    mocks.signInEmail.mockResolvedValueOnce(
      new Response("{}", { status: 429 }),
    );
    const fallbackLimit = await controller.login(
      request({ email: "person@example.com", password: "password" }),
    );
    expect(fallbackLimit.headers.get("retry-after")).toBe("60");
    mocks.signInEmail.mockRejectedValueOnce(new Error("secret database error"));
    const failed = await controller.login(
      request({ email: "person@example.com", password: "password" }),
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível concluir o login.",
    });
    expect(mocks.logger.error).toHaveBeenCalledWith("auth.login.failed", {
      errorType: "Error",
    });

    mocks.signInEmail.mockRejectedValueOnce("unknown failure");
    const unknownFailure = await controller.login(
      request({ email: "person@example.com", password: "password" }),
    );
    expect(unknownFailure.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenLastCalledWith("auth.login.failed", {
      errorType: "UnknownError",
    });
  });
});
