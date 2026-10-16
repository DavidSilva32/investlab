import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    listUsers: vi.fn(),
    listInvitations: vi.fn(),
    listPasswordResets: vi.fn(),
    findUserByEmail: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    claimInvitation: vi.fn(),
    releaseInvitationClaim: vi.fn(),
    createPasswordReset: vi.fn(),
    revokePasswordReset: vi.fn(),
    applyPasswordReset: vi.fn(),
    hasAnyUser: vi.fn(),
    promoteLegacyAdmin: vi.fn(),
    checkAuthenticationRateLimits: vi.fn(),
  },
  signUpEmail: vi.fn(),
  hashPassword: vi.fn(),
  verifyLegacyPassword: vi.fn(),
}));

vi.mock("@/backend/repositories/auth.repository", () => ({
  authRepository: mocks.repository,
}));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: {
    api: { signUpEmail: mocks.signUpEmail },
    $context: Promise.resolve({ password: { hash: mocks.hashPassword } }),
  },
}));
vi.mock("@/infrastructure/auth/credentials.service", () => ({
  credentialsService: { verify: mocks.verifyLegacyPassword },
}));

import { authService } from "@/backend/services/auth.service";
import { ApplicationError } from "@/backend/errors/application-error";

describe("AuthService", () => {
  beforeEach(() => {
    Object.values(mocks.repository).forEach((mock) => mock.mockReset());
    mocks.signUpEmail.mockReset();
    mocks.hashPassword.mockReset();
    mocks.verifyLegacyPassword.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses HMAC keys from trusted ingress and normalized identity, ignoring forwarded client headers", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValue(37);
    const retry = await authService.checkLoginRateLimit(
      new Request("https://test", {
        headers: {
          "x-real-ip": "203.0.113.8",
          "x-forwarded-for": "198.51.100.99",
        },
      }),
      " Person@Example.com ",
    );
    const input =
      mocks.repository.checkAuthenticationRateLimits.mock.calls[0][0];
    expect(retry).toBe(37);
    expect(input.keys).toHaveLength(2);
    expect(JSON.stringify(input.keys)).not.toContain("person@example.com");
    expect(JSON.stringify(input.keys)).not.toContain("203.0.113.8");
    expect(JSON.stringify(input.keys)).not.toContain("198.51.100.99");
    expect(
      input.keys.every((entry: { key: string }) =>
        /^[a-f0-9]{64}$/.test(entry.key),
      ),
    ).toBe(true);
    expect(input.keys.map((entry: { key: string }) => entry.key)).toEqual([
      createHmac("sha256", "s".repeat(40))
        .update("ip:203.0.113.8")
        .digest("hex"),
      createHmac("sha256", "s".repeat(40))
        .update("email:person@example.com")
        .digest("hex"),
    ]);
  });

  it("keeps identity throttling without an unknown or forwarded-IP bucket", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValue(null);
    await authService.checkLoginRateLimit(
      new Request("https://test", {
        headers: { "x-forwarded-for": "198.51.100.99" },
      }),
      "person@example.com",
    );
    const input =
      mocks.repository.checkAuthenticationRateLimits.mock.calls[0][0];
    expect(input.keys).toHaveLength(1);
    expect(input.keys[0].key).toBe(
      createHmac("sha256", "s".repeat(40))
        .update("email:person@example.com")
        .digest("hex"),
    );
  });

  it("fails closed when the rate-limit secret is missing", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      authService.checkLoginRateLimit(new Request("https://test"), "a@b.com"),
    ).rejects.toThrow("rate limiter");
    expect(
      mocks.repository.checkAuthenticationRateLimits,
    ).not.toHaveBeenCalled();
  });

  it("normalizes invitation e-mail and returns the raw token only in the issuance result", async () => {
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.repository.createInvitation.mockResolvedValue({ id: "invite-1" });
    const result = await authService.createInvitation(
      " Person@Example.com ",
      "admin-1",
    );
    const values = mocks.repository.createInvitation.mock.calls[0][0];
    const rawToken = result.url.split("/").at(-1);
    expect(values.email).toBe("person@example.com");
    expect(values.tokenHash).toHaveLength(64);
    expect(values.tokenHash).not.toBe(rawToken);
    expect(result.url).toMatch(/^\/convite\/[\w-]{40,}$/);
  });

  it("rejects duplicate account invitations and revokes only pending invitations", async () => {
    mocks.repository.findUserByEmail.mockResolvedValue({ id: "u1" });
    await expect(
      authService.createInvitation("person@example.com", "admin-1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    mocks.repository.revokeInvitation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      authService.revokeInvitation("invite-1"),
    ).resolves.toBeUndefined();
    await expect(
      authService.revokeInvitation("invite-2"),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("rejects malformed invite addresses before querying or creating records", async () => {
    await expect(
      authService.createInvitation("not-an-email", "admin-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.repository.findUserByEmail).not.toHaveBeenCalled();
    expect(mocks.repository.createInvitation).not.toHaveBeenCalled();
  });

  it("keeps invitation identity server-bound and marks a token spent before account creation", async () => {
    mocks.repository.claimInvitation.mockResolvedValue({
      id: "i1",
      email: "bound@example.com",
    });
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "u1", email: "bound@example.com" },
    });
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
      ),
    ).resolves.toBeUndefined();
    expect(mocks.repository.claimInvitation).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: "Invitee",
        email: "bound@example.com",
        password: "A-long-safe-password-123",
      },
    });
    await expect(
      authService.activateInvitation("short", "Invitee", "short"),
    ).rejects.toBeInstanceOf(ApplicationError);
    mocks.repository.claimInvitation.mockResolvedValue(null);
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("releases a claimed invitation after a definite account-creation failure", async () => {
    mocks.repository.claimInvitation.mockResolvedValue({
      id: "i1",
      email: "bound@example.com",
    });
    mocks.signUpEmail.mockRejectedValue(new Error("database unavailable"));
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.repository.releaseInvitationClaim).toHaveBeenCalledWith("i1");
  });

  it("keeps an invitation consumed when account creation committed before failing", async () => {
    mocks.repository.claimInvitation.mockResolvedValue({
      id: "i2",
      email: "bound@example.com",
    });
    mocks.signUpEmail.mockRejectedValue(new Error("response was interrupted"));
    mocks.repository.findUserByEmail.mockResolvedValue({ id: "u1" });

    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.repository.releaseInvitationClaim).not.toHaveBeenCalled();
  });

  it("lists users and token-free invite/reset statuses", async () => {
    const now = new Date();
    mocks.repository.listUsers.mockResolvedValue([{ id: "u1", role: "USER" }]);
    mocks.repository.listInvitations.mockResolvedValue([
      { id: "1", usedAt: now, revokedAt: null, expiresAt: now },
      { id: "2", usedAt: null, revokedAt: now, expiresAt: now },
      { id: "3", usedAt: null, revokedAt: null, expiresAt: new Date(0) },
      {
        id: "4",
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    mocks.repository.listPasswordResets.mockResolvedValue([
      {
        id: "r1",
        email: "user@example.com",
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const result = await authService.listAdministrationData();
    expect(result.invitations.map((item) => item.status)).toEqual([
      "used",
      "revoked",
      "expired",
      "pending",
    ]);
    expect(result.passwordResets[0].status).toBe("pending");
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });

  it("issues and revokes assisted password resets without returning existing tokens", async () => {
    mocks.repository.findUserByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u2" });
    await expect(
      authService.createPasswordReset("missing@example.com", "admin-1"),
    ).rejects.toBeInstanceOf(ApplicationError);
    mocks.repository.createPasswordReset.mockResolvedValue({ id: "reset-1" });
    const issued = await authService.createPasswordReset(
      " USER@example.com ",
      "admin-1",
    );
    expect(issued.url).toMatch(/^\/redefinir-senha\//);
    expect(mocks.repository.createPasswordReset.mock.calls[0][0].userId).toBe(
      "u2",
    );
    mocks.repository.revokePasswordReset
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      authService.revokePasswordReset("reset-1"),
    ).resolves.toBeUndefined();
    await expect(
      authService.revokePasswordReset("reset-1"),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("hashes new passwords through Better Auth and handles valid, invalid, expired, and revoked reset links", async () => {
    mocks.hashPassword.mockResolvedValue("library-hash");
    mocks.repository.applyPasswordReset
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      authService.resetPassword("r".repeat(43), "A-long-safe-password-123"),
    ).resolves.toBeUndefined();
    expect(mocks.hashPassword).toHaveBeenCalledWith("A-long-safe-password-123");
    expect(mocks.repository.applyPasswordReset).toHaveBeenCalledWith(
      expect.any(String),
      "library-hash",
    );
    await expect(
      authService.resetPassword("r".repeat(43), "short"),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      authService.resetPassword("r".repeat(43), "A-long-safe-password-123"),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("bootstraps only the first legacy account and assigns ADMIN after creation", async () => {
    mocks.repository.hasAnyUser
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(
      await authService.bootstrapLegacyAdministrator(
        "legacy@example.com",
        "password",
      ),
    ).toBe(false);
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "legacy-1", email: "legacy@example.com" },
    });
    mocks.repository.promoteLegacyAdmin.mockResolvedValue({ id: "legacy-1" });
    expect(
      await authService.bootstrapLegacyAdministrator(
        "legacy@example.com",
        "password",
      ),
    ).toBe(true);
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: "legacy",
        email: "legacy@example.com",
        password: "password",
      },
    });
    expect(mocks.repository.promoteLegacyAdmin).toHaveBeenCalledWith(
      "legacy@example.com",
    );
  });

  it("rejects invalid legacy credentials without reading or creating an account", async () => {
    mocks.verifyLegacyPassword.mockResolvedValue(false);
    await expect(
      authService.bootstrapLegacyAdministrator(
        "legacy@example.com",
        "incorrect",
      ),
    ).resolves.toBe(false);
    expect(mocks.repository.findUserByEmail).not.toHaveBeenCalled();
    expect(mocks.repository.hasAnyUser).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("fails explicitly when a legacy user cannot be promoted to ADMIN", async () => {
    mocks.repository.findUserByEmail.mockResolvedValue({ id: "legacy-1" });
    mocks.repository.promoteLegacyAdmin.mockResolvedValue(null);
    await expect(
      authService.bootstrapLegacyAdministrator(
        " LEGACY@example.com ",
        "password",
      ),
    ).rejects.toThrow("Legacy administrator promotion failed.");
    expect(mocks.repository.promoteLegacyAdmin).toHaveBeenCalledWith(
      "legacy@example.com",
    );
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("fails explicitly if the newly created legacy administrator cannot be promoted", async () => {
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.repository.hasAnyUser.mockResolvedValue(false);
    mocks.repository.promoteLegacyAdmin.mockResolvedValue(null);
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "legacy-1", email: "legacy@example.com" },
    });

    await expect(
      authService.bootstrapLegacyAdministrator(
        "legacy@example.com",
        "password",
      ),
    ).rejects.toThrow("Legacy administrator promotion failed.");
    expect(mocks.signUpEmail).toHaveBeenCalledOnce();
  });

  it("recovers legacy ADMIN promotion when account creation committed before promotion failed", async () => {
    mocks.repository.findUserByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "legacy-1", email: "legacy@example.com" });
    mocks.repository.hasAnyUser.mockResolvedValue(false);
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "legacy-1", email: "legacy@example.com" },
    });
    mocks.repository.promoteLegacyAdmin
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({ id: "legacy-1" });
    await expect(
      authService.bootstrapLegacyAdministrator(
        "LEGACY@example.com",
        "password",
      ),
    ).rejects.toThrow("write failed");

    await expect(
      authService.bootstrapLegacyAdministrator(
        "legacy@example.com",
        "password",
      ),
    ).resolves.toBe(true);
    expect(mocks.signUpEmail).toHaveBeenCalledOnce();
    expect(mocks.repository.promoteLegacyAdmin).toHaveBeenCalledTimes(2);
  });
});
