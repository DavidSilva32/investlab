import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { toNextJsHandler } from "better-auth/next-js";
import { mcp } from "@better-auth/mcp";
import * as schema from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { getAuthSecret } from "@/infrastructure/auth/auth-configuration";
import { mcpResource } from "@/infrastructure/mcp/mcp-configuration";

export const auth = betterAuth({
  database: drizzleAdapter(getDatabaseClient(), {
    provider: "pg",
    schema: {
      ...schema,
      auth_users: schema.authUsers,
      auth_sessions: schema.authSessions,
      auth_accounts: schema.authAccounts,
      auth_verifications: schema.authVerifications,
      auth_rate_limits: schema.authRateLimits,
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
      rateLimit: schema.authRateLimits,
      oauthClient: schema.oauthClients,
      oauthAccessToken: schema.oauthAccessTokens,
      oauthRefreshToken: schema.oauthRefreshTokens,
      oauthConsent: schema.oauthConsents,
      oauthClientAssertion: schema.oauthClientAssertions,
      oauthResource: schema.oauthResources,
      oauthClientResource: schema.oauthClientResources,
      jwks: schema.authJwks,
    },
  }),
  secret: getAuthSecret(),
  emailAndPassword: {
    enabled: true,
    // Keep Better Auth's generic sign-up endpoint closed. Public registration
    // uses the guarded application flow for beta dates, Terms and throttling.
    disableSignUp: true,
    autoSignIn: false,
  },
  user: {
    modelName: "auth_users",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
      accountStatus: {
        type: "string",
        required: false,
        defaultValue: "PENDING",
        input: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
        input: false,
      },
      phone: {
        type: "string",
        required: false,
        input: false,
      },
      betaActivatedAt: {
        type: "date",
        required: false,
        input: false,
      },
      betaExpiresAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    modelName: "auth_sessions",
  },
  account: {
    modelName: "auth_accounts",
  },
  verification: {
    modelName: "auth_verifications",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "auth_rate_limits",
    window: 60,
    max: 10,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            email: user.email.trim().toLowerCase(),
            role: "USER",
            accountStatus: "PENDING",
          },
        }),
      },
    },
  },
  plugins: [
    jwt(),
    mcp({
      loginPage: "/entrar",
      consentPage: "/mcp/consent",
      resource: mcpResource,
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "mcp:read",
        "mcp:admin:read",
      ],
      resources: [
        {
          identifier: mcpResource,
          name: "InvestLab MCP",
          allowedScopes: ["mcp:read", "mcp:admin:read"],
        },
      ],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: ["openid", "mcp:read"],
      clientRegistrationAllowedScopes: [
        "profile",
        "email",
        "offline_access",
        "mcp:admin:read",
      ],
    }),
  ],
});

export const authHandler = toNextJsHandler(auth.handler);

export type AuthUser = typeof auth.$Infer.Session.user;
