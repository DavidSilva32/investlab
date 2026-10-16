import { afterEach, describe, expect, it, vi } from "vitest";
import * as databaseSchema from "@/infrastructure/database/schema";

const mocks = vi.hoisted(() => ({
  authOptions: undefined as Record<string, unknown> | undefined,
  adapterOptions: undefined as Record<string, unknown> | undefined,
  database: { mocked: true },
}));

describe("Better Auth configuration", () => {
  afterEach(() => {
    vi.doUnmock("better-auth");
    vi.doUnmock("better-auth/adapters/drizzle");
    vi.doUnmock("@/infrastructure/database/client");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadAuth() {
    mocks.authOptions = undefined;
    mocks.adapterOptions = undefined;
    vi.doMock("better-auth", () => ({
      betterAuth: (options: Record<string, unknown>) => {
        mocks.authOptions = options;
        return { api: {} };
      },
    }));
    vi.doMock("better-auth/adapters/drizzle", () => ({
      drizzleAdapter: (database: unknown, options: Record<string, unknown>) => {
        mocks.adapterOptions = { database, ...options };
        return { adapter: "drizzle" };
      },
    }));
    vi.doMock("@/infrastructure/database/client", () => ({
      getDatabaseClient: () => mocks.database,
    }));
    return import("@/infrastructure/auth/auth");
  }

  it("uses persistent Drizzle models and keeps public sign-up unmounted", async () => {
    vi.stubEnv("AUTH_SECRET", "a-secure-auth-secret-with-at-least-32-chars");
    vi.stubEnv("NODE_ENV", "development");
    const { auth } = await loadAuth();
    const options = mocks.authOptions as {
      database: unknown;
      emailAndPassword: { enabled: boolean; disableSignUp: boolean };
      rateLimit: { enabled: boolean; storage: string; modelName: string };
      user: { modelName: string; additionalFields: Record<string, unknown> };
      session: { modelName: string };
      account: { modelName: string };
      verification: { modelName: string };
      advanced: { defaultCookieAttributes: Record<string, unknown> };
    };
    expect(auth).toBeTruthy();
    expect(options.database).toEqual({ adapter: "drizzle" });
    expect(mocks.adapterOptions).toMatchObject({
      database: mocks.database,
      provider: "pg",
      schema: expect.objectContaining({
        auth_users: expect.any(Object),
        auth_sessions: expect.any(Object),
        auth_accounts: expect.any(Object),
        auth_verifications: expect.any(Object),
        auth_rate_limits: expect.any(Object),
        user: expect.any(Object),
        session: expect.any(Object),
        account: expect.any(Object),
        verification: expect.any(Object),
        rateLimit: expect.any(Object),
      }),
    });
    const adapterSchema = mocks.adapterOptions?.schema as Record<
      string,
      unknown
    >;
    expect(adapterSchema).toMatchObject({
      auth_users: databaseSchema.authUsers,
      auth_sessions: databaseSchema.authSessions,
      auth_accounts: databaseSchema.authAccounts,
      auth_verifications: databaseSchema.authVerifications,
      auth_rate_limits: databaseSchema.authRateLimits,
    });
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      disableSignUp: false,
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limits",
    });
    expect(options.user.modelName).toBe("auth_users");
    expect(options.session.modelName).toBe("auth_sessions");
    expect(options.account.modelName).toBe("auth_accounts");
    expect(options.verification.modelName).toBe("auth_verifications");
    expect(options.advanced.defaultCookieAttributes).toEqual({
      sameSite: "lax",
      httpOnly: true,
      secure: false,
    });
  });

  it("sets Secure cookies in production and forces normalized USER creation", async () => {
    vi.stubEnv("AUTH_SECRET", "a-secure-auth-secret-with-at-least-32-chars");
    vi.stubEnv("NODE_ENV", "production");
    await loadAuth();
    const options = mocks.authOptions as {
      advanced: {
        useSecureCookies: boolean;
        defaultCookieAttributes: Record<string, unknown>;
      };
      databaseHooks: {
        user: {
          create: {
            before: (
              user: Record<string, unknown>,
            ) => Promise<{ data: Record<string, unknown> }>;
          };
        };
      };
    };
    expect(options.advanced.useSecureCookies).toBe(true);
    expect(options.advanced.defaultCookieAttributes.secure).toBe(true);
    await expect(
      options.databaseHooks.user.create.before({
        email: " Person@Example.com ",
        role: "ADMIN",
      }),
    ).resolves.toEqual({
      data: {
        email: "person@example.com",
        role: "USER",
        accountStatus: "PENDING",
      },
    });
  });

  it("keeps account lifecycle fields server-controlled", async () => {
    vi.stubEnv("AUTH_SECRET", "a-secure-auth-secret-with-at-least-32-chars");
    vi.stubEnv("NODE_ENV", "development");
    await loadAuth();
    const options = mocks.authOptions as {
      user: { additionalFields: Record<string, { input?: boolean }> };
    };
    expect(options.user.additionalFields).toMatchObject({
      accountStatus: { input: false },
      lastLoginAt: { input: false },
    });
  });
});
