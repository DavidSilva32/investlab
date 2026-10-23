import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    listUsers: vi.fn(),
    listInvitations: vi.fn(),
    listPasswordResets: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createInvitation: vi.fn(),
    createPublicBetaAccount: vi.fn(),
    revokeInvitation: vi.fn(),
    activateInvitation: vi.fn(),
    claimInvitationExistsUnused: vi.fn(),
    createPasswordReset: vi.fn(),
    revokePasswordReset: vi.fn(),
    applyPasswordReset: vi.fn(),
    checkAuthenticationRateLimits: vi.fn(),
    getLoginEligibility: vi.fn(),
    recordSuccessfulLogin: vi.fn(),
    updateManagedUser: vi.fn(),
    deleteManagedUser: vi.fn(),
    updateOwnProfile: vi.fn(),
  },
  signUpEmail: vi.fn(),
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  hashPassword: vi.fn(),
  getCurrentTermsVersion: vi.fn(),
}));

vi.mock("@/backend/repositories/auth.repository", () => ({
  authRepository: mocks.repository,
}));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: {
    api: {
      signUpEmail: mocks.signUpEmail,
      updateUser: mocks.updateUser,
      changePassword: mocks.changePassword,
    },
    $context: Promise.resolve({ password: { hash: mocks.hashPassword } }),
  },
}));
vi.mock("@/lib/privacy-policy", () => ({
  getCurrentTermsVersion: mocks.getCurrentTermsVersion,
}));
import { authService } from "@/backend/services/auth.service";
import { ApplicationError } from "@/backend/errors/application-error";

describe("AuthService", () => {
  beforeEach(() => {
    Object.values(mocks.repository).forEach((mock) => mock.mockReset());
    mocks.signUpEmail.mockReset();
    mocks.updateUser.mockReset();
    mocks.changePassword.mockReset();
    mocks.hashPassword.mockReset();
    mocks.getCurrentTermsVersion.mockReturnValue("terms-2026-10-19.1");
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
    expect(
      input.keys.map((entry: { maximum: number }) => entry.maximum),
    ).toEqual([10, 10]);
    expect(input.windowMs).toBe(60_000);
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

  it("uses separate signup throttling buckets and a shared fallback when trusted IP is absent", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValue(null);
    await authService.checkPublicSignupRateLimit(
      new Request("https://test", {
        headers: { "x-forwarded-for": "198.51.100.99" },
      }),
      " Person@Example.com ",
    );
    const input =
      mocks.repository.checkAuthenticationRateLimits.mock.calls[0][0];
    expect(input.keys).toHaveLength(2);
    expect(input.keys[0]).toEqual({
      key: createHmac("sha256", "s".repeat(40))
        .update("signup-ip:shared-no-trusted-ip")
        .digest("hex"),
      maximum: 5,
    });
    expect(input.keys[1]).toEqual({
      key: createHmac("sha256", "s".repeat(40))
        .update("signup-email:person@example.com")
        .digest("hex"),
      maximum: 5,
    });
    expect(input.windowMs).toBe(60_000);

    await authService.checkPublicSignupRateLimit(
      new Request("https://test", {
        headers: { "x-forwarded-for": "192.0.2.100" },
      }),
      "another@example.com",
    );
    const withoutTrustedIpAgain =
      mocks.repository.checkAuthenticationRateLimits.mock.calls[1][0];
    expect(withoutTrustedIpAgain.keys[0]).toEqual(input.keys[0]);
    expect(withoutTrustedIpAgain.keys[1].key).not.toBe(input.keys[1].key);

    await authService.checkPublicSignupRateLimit(
      new Request("https://test", { headers: { "x-real-ip": "203.0.113.8" } }),
      "person@example.com",
    );
    const withTrustedIp =
      mocks.repository.checkAuthenticationRateLimits.mock.calls[2][0];
    expect(withTrustedIp.keys).toHaveLength(2);
    expect(
      withTrustedIp.keys.map((entry: { maximum: number }) => entry.maximum),
    ).toEqual([5, 5]);
    expect(JSON.stringify(withTrustedIp.keys)).not.toContain("203.0.113.8");
  });

  it("creates a public beta account with normalized identity, hashed credentials and current terms", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValue(null);
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue("credential-hash");
    mocks.repository.createPublicBetaAccount.mockResolvedValue(true);
    await expect(
      authService.createPublicBetaAccount({
        request: new Request("https://test", {
          headers: { "x-real-ip": "203.0.113.8" },
        }),
        email: " Person@Example.com ",
        name: "  New Person  ",
        password: "A-long-safe-password-123",
        acceptTerms: true,
        termsVersion: "terms-2026-10-19.1",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.hashPassword).toHaveBeenCalledWith("A-long-safe-password-123");
    expect(mocks.repository.findUserByEmail).toHaveBeenCalledWith(
      "person@example.com",
    );
    expect(mocks.repository.createPublicBetaAccount).toHaveBeenCalledWith({
      email: "person@example.com",
      name: "New Person",
      passwordHash: "credential-hash",
      termsVersion: "terms-2026-10-19.1",
    });
  });

  it("rejects signup without terms, with stale terms, or with a short password before rate limiting", async () => {
    const input = {
      request: new Request("https://test"),
      email: "person@example.com",
      name: "Person",
      password: "A-long-safe-password-123",
      acceptTerms: false,
      termsVersion: "terms-2026-10-19.1",
    };
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.createPublicBetaAccount({
        ...input,
        acceptTerms: true,
        termsVersion: "old-version",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.createPublicBetaAccount({
        ...input,
        acceptTerms: true,
        password: "short",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(
      mocks.repository.checkAuthenticationRateLimits,
    ).not.toHaveBeenCalled();
    expect(mocks.repository.createPublicBetaAccount).not.toHaveBeenCalled();
  });

  it("fails closed for signup throttling errors and returns retry guidance when limited", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    const input = {
      request: new Request("https://test"),
      email: "person@example.com",
      name: "Person",
      password: "A-long-safe-password-123",
      acceptTerms: true,
      termsVersion: "terms-2026-10-19.1",
    };
    mocks.repository.checkAuthenticationRateLimits.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({ statusCode: 503 });
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValueOnce(25);
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({ statusCode: 429, retryAfterSeconds: 25 });
    mocks.repository.checkAuthenticationRateLimits.mockReset();
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      authService.checkPublicSignupRateLimit(
        new Request("https://test"),
        "person@example.com",
      ),
    ).rejects.toThrow("rate limiter");
  });

  it("keeps duplicate and concurrent signup conflicts indistinguishable", async () => {
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    mocks.repository.checkAuthenticationRateLimits.mockResolvedValue(null);
    const input = {
      request: new Request("https://test"),
      email: "person@example.com",
      name: "Person",
      password: "A-long-safe-password-123",
      acceptTerms: true,
      termsVersion: "terms-2026-10-19.1",
    };
    mocks.repository.findUserByEmail.mockResolvedValueOnce({ id: "existing" });
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Não foi possível criar a conta com esses dados. Confira o e-mail e tente novamente.",
    });
    mocks.repository.findUserByEmail.mockResolvedValueOnce(null);
    mocks.hashPassword.mockResolvedValue("credential-hash");
    mocks.repository.createPublicBetaAccount.mockRejectedValueOnce(
      Object.assign(new Error("duplicate"), { code: "23505" }),
    );
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Não foi possível criar a conta com esses dados. Confira o e-mail e tente novamente.",
    });
    mocks.repository.findUserByEmail.mockResolvedValueOnce(null);
    mocks.repository.createPublicBetaAccount.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(
      authService.createPublicBetaAccount(input),
    ).rejects.toMatchObject({
      statusCode: 500,
      message:
        "Não foi possível criar a conta. Confira os dados e tente novamente.",
    });
  });

  it("allows new, active, and pending accounts to log in but rejects disabled accounts", async () => {
    mocks.repository.getLoginEligibility
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-1", accountStatus: "ACTIVE" })
      .mockResolvedValueOnce({ id: "user-2", accountStatus: "PENDING" })
      .mockResolvedValueOnce({ id: "user-3", accountStatus: "DISABLED" });
    await expect(authService.canAttemptLogin("new@example.com")).resolves.toBe(
      true,
    );
    await expect(
      authService.canAttemptLogin("active@example.com"),
    ).resolves.toBe(true);
    await expect(
      authService.canAttemptLogin("pending@example.com"),
    ).resolves.toBe(true);
    await expect(
      authService.canAttemptLogin("disabled@example.com"),
    ).resolves.toBe(false);
  });

  it("records a successful login through the repository", async () => {
    mocks.repository.recordSuccessfulLogin.mockResolvedValue(true);
    await expect(
      authService.recordSuccessfulLogin("person@example.com"),
    ).resolves.toBe(true);
    expect(mocks.repository.recordSuccessfulLogin).toHaveBeenCalledWith(
      "person@example.com",
    );
  });

  it("updates the authenticated profile with a canonical Brazilian phone", async () => {
    mocks.repository.updateOwnProfile.mockResolvedValue({
      name: "New Name",
      phone: "11987654321",
    });
    const response = await authService.updateOwnProfile(
      "user-1",
      "  New Name  ",
      "(11) 98765-4321",
    );
    expect(mocks.repository.updateOwnProfile).toHaveBeenCalledWith({
      id: "user-1",
      name: "New Name",
      phone: "11987654321",
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "New Name",
      phone: "11987654321",
    });
  });

  it("reports when the authenticated profile no longer exists", async () => {
    mocks.repository.updateOwnProfile.mockResolvedValue(null);
    await expect(
      authService.updateOwnProfile("user-1", "Name", "11987654321"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("leaves the saved telephone unchanged when the profile edit omits it", async () => {
    mocks.repository.updateOwnProfile.mockResolvedValue({
      name: "New Name",
      phone: "11987654321",
    });

    await authService.updateOwnProfile("user-1", "New Name");

    expect(mocks.repository.updateOwnProfile).toHaveBeenCalledWith({
      id: "user-1",
      name: "New Name",
    });
  });

  it("rejects invalid phones and hides repository errors", async () => {
    await expect(
      authService.updateOwnProfile("user-1", "Name", "123"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.repository.updateOwnProfile).not.toHaveBeenCalled();
    mocks.repository.updateOwnProfile.mockRejectedValueOnce(
      new Error("internal"),
    );
    await expect(
      authService.updateOwnProfile("user-1", "Name", null),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("changes the current password through Better Auth and hides the rotated bearer token", async () => {
    const headers = new Headers({ cookie: "session=old" });
    mocks.changePassword.mockResolvedValue(
      new Response(JSON.stringify({ token: "rotated-secret", user: {} }), {
        headers: { "set-cookie": "session=new; HttpOnly; SameSite=Lax" },
      }),
    );

    const response = await authService.changeOwnPassword(
      "current password",
      "a-new-password-value",
      headers,
    );

    expect(mocks.changePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "current password",
        newPassword: "a-new-password-value",
        revokeOtherSessions: true,
      },
      headers,
      asResponse: true,
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([
      "session=new; HttpOnly; SameSite=Lax",
    ]);
  });

  it("maps password validation and authorization errors without exposing Better Auth details", async () => {
    mocks.changePassword.mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      authService.changeOwnPassword(
        "wrong",
        "a-new-password-value",
        new Headers(),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Não foi possível validar a senha atual. Confira a senha e tente novamente.",
    });

    for (const status of [401, 403]) {
      mocks.changePassword.mockResolvedValueOnce(
        Response.json({ message: "internal detail" }, { status }),
      );
      await expect(
        authService.changeOwnPassword(
          "current",
          "a-new-password-value",
          new Headers(),
        ),
      ).rejects.toMatchObject({
        statusCode: status,
        message:
          status === 401
            ? "Sua sessão não pôde ser validada. Entre novamente."
            : "A alteração não foi autorizada.",
      });
    }

    mocks.changePassword.mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );
    await expect(
      authService.changeOwnPassword(
        "current",
        "a-new-password-value",
        new Headers(),
      ),
    ).rejects.toMatchObject({ statusCode: 500 });

    mocks.changePassword.mockRejectedValueOnce(new Error("internal"));
    await expect(
      authService.changeOwnPassword(
        "current",
        "a-new-password-value",
        new Headers(),
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("validates and maps managed-user lifecycle updates", async () => {
    await expect(
      authService.updateManagedUser({ id: "u1", actorId: "admin-1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const hashCallsBeforeInvalidToken = mocks.hashPassword.mock.calls.length;
    await expect(
      authService.updateManagedUser({
        id: "u1",
        actorId: "admin-1",
        name: "   ",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    mocks.repository.updateManagedUser
      .mockResolvedValueOnce({ kind: "updated" })
      .mockResolvedValueOnce({ kind: "not-found" })
      .mockResolvedValueOnce({ kind: "self-deactivation" })
      .mockResolvedValueOnce({ kind: "last-admin" })
      .mockResolvedValueOnce({ kind: "trial-not-extended" });
    await expect(
      authService.updateManagedUser({
        id: "u1",
        actorId: "admin-1",
        name: " User ",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.repository.updateManagedUser).toHaveBeenCalledWith({
      id: "u1",
      actorId: "admin-1",
      name: "User",
    });
    await expect(
      authService.updateManagedUser({
        id: "missing",
        actorId: "admin-1",
        role: "USER",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      authService.updateManagedUser({
        id: "admin-1",
        actorId: "admin-1",
        isActive: false,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.updateManagedUser({
        id: "u1",
        actorId: "admin-1",
        role: "USER",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.updateManagedUser({
        id: "u1",
        actorId: "admin-1",
        betaExpiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.updateManagedUser({
        id: "u1",
        actorId: "admin-1",
        betaExpiresAt: new Date(0),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("confirms managed account deletion and maps safety conflicts", async () => {
    mocks.repository.findUserById.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
    });
    mocks.repository.deleteManagedUser
      .mockResolvedValueOnce({ kind: "deleted" })
      .mockResolvedValueOnce({ kind: "self-delete" })
      .mockResolvedValueOnce({ kind: "last-admin" })
      .mockResolvedValueOnce({ kind: "not-found" });
    await expect(
      authService.deleteManagedUser(
        "user-1",
        "admin-1",
        " PERSON@example.com ",
      ),
    ).resolves.toBeUndefined();
    await expect(
      authService.deleteManagedUser("user-1", "admin-1", "wrong@example.com"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.deleteManagedUser("user-1", "user-1", "person@example.com"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.deleteManagedUser("user-1", "admin-1", "person@example.com"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      authService.deleteManagedUser("user-1", "admin-1", "person@example.com"),
    ).rejects.toMatchObject({ statusCode: 404 });
    mocks.repository.findUserById.mockResolvedValue(null);
    await expect(
      authService.deleteManagedUser("missing", "admin-1", "x@example.com"),
    ).rejects.toMatchObject({ statusCode: 404 });
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

  it("allows invitation issuance independently of Terms activation or acceptance", async () => {
    mocks.getCurrentTermsVersion.mockReturnValue("");
    mocks.repository.findUserByEmail.mockResolvedValue(null);
    mocks.repository.createInvitation.mockResolvedValue({ id: "invite-2" });

    await expect(
      authService.createInvitation("new-person@example.com", "admin-1"),
    ).resolves.toMatchObject({ url: expect.stringMatching(/^\/convite\//) });
    expect(mocks.repository.createInvitation).toHaveBeenCalledOnce();
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

  it("activates only after accepting the current terms and delegates atomic account creation", async () => {
    mocks.getCurrentTermsVersion.mockReturnValue("terms-2026-10-19.1");
    mocks.repository.claimInvitationExistsUnused.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("credential-hash");
    mocks.repository.activateInvitation.mockResolvedValue(true);
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        true,
        "terms-2026-10-19.1",
      ),
    ).resolves.toBeUndefined();
    expect(mocks.hashPassword).toHaveBeenCalledWith("A-long-safe-password-123");
    expect(mocks.repository.activateInvitation).toHaveBeenCalledWith({
      tokenHash: expect.any(String),
      name: "Invitee",
      passwordHash: "credential-hash",
      termsVersion: "terms-2026-10-19.1",
    });
    expect(mocks.repository.claimInvitationExistsUnused).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        false,
        "terms-2026-10-19.1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.activateInvitation(
        "short",
        "Invitee",
        "short",
        true,
        "terms-2026-10-19.1",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    const hashCallsBeforeInvalidToken = mocks.hashPassword.mock.calls.length;
    mocks.repository.claimInvitationExistsUnused.mockResolvedValue(false);
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        true,
        "terms-2026-10-19.1",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.hashPassword).toHaveBeenCalledTimes(
      hashCallsBeforeInvalidToken,
    );
    mocks.repository.claimInvitationExistsUnused.mockResolvedValue(true);
    mocks.repository.activateInvitation.mockResolvedValue(false);
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        true,
        "terms-2026-10-19.1",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("rejects an invitation acceptance for a different terms version", async () => {
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        true,
        "old-terms-version",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("A versão dos Termos mudou"),
    });

    expect(mocks.repository.claimInvitationExistsUnused).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.repository.activateInvitation).not.toHaveBeenCalled();
  });

  it("hides transaction failures without exposing database details", async () => {
    mocks.getCurrentTermsVersion.mockReturnValue("terms-2026-10-19.1");
    mocks.repository.claimInvitationExistsUnused.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("credential-hash");
    mocks.repository.activateInvitation.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      authService.activateInvitation(
        "t".repeat(43),
        "Invitee",
        "A-long-safe-password-123",
        true,
        "terms-2026-10-19.1",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Não foi possível ativar o convite. Solicite um novo link ao administrador.",
    });
  });

  it("lists users and token-free invite/reset statuses", async () => {
    const now = new Date();
    mocks.repository.listUsers.mockResolvedValue([
      {
        id: "u1",
        role: "USER",
        accountStatus: "ACTIVE",
        betaExpiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: "u2",
        role: "USER",
        accountStatus: "PENDING",
        betaExpiresAt: new Date(0),
      },
      {
        id: "u3",
        role: "USER",
        accountStatus: "DISABLED",
        betaExpiresAt: null,
      },
    ]);
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
    expect(result.stats).toEqual({
      totalUsers: 3,
      activeUsers: 1,
      pendingUsers: 1,
      disabledUsers: 1,
      expiringTrials: 1,
      expiredTrials: 1,
      invitationsPending: 1,
    });
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
});
