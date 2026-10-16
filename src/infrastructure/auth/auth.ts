import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { getAuthSecret } from "@/infrastructure/auth/auth-configuration";

export const auth = betterAuth({
  database: drizzleAdapter(getDatabaseClient(), {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
      rateLimit: schema.authRateLimits,
    },
  }),
  secret: getAuthSecret(),
  emailAndPassword: {
    enabled: true,
    // No public sign-up endpoint is mounted. Accounts are created only after
    // a server-verified invitation token is consumed.
    disableSignUp: false,
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
          },
        }),
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
