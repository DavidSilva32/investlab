import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "better-auth.session_token=x" }),
}));

import {
  getAuthenticatedUser,
  requireAuthenticatedUser,
  requireRole,
} from "@/infrastructure/auth/authorization";

const user = {
  id: "user-1",
  email: "user@example.com",
  role: "USER",
  name: "User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  accountStatus: "ACTIVE",
};

describe("server authorization helpers", () => {
  beforeEach(() => mocks.getSession.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it("returns null for absent or expired persistent sessions", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await getAuthenticatedUser(new Headers())).toBeNull();
    await expect(requireAuthenticatedUser(new Headers())).rejects.toMatchObject(
      { statusCode: 401 },
    );
  });

  it("rejects an existing session when its account has been deactivated", async () => {
    mocks.getSession.mockResolvedValue({
      user: { ...user, accountStatus: "DISABLED" },
    });
    expect(await getAuthenticatedUser(new Headers())).toBeNull();
    await expect(requireAuthenticatedUser(new Headers())).rejects.toMatchObject(
      { statusCode: 401 },
    );
  });

  it("reads the session from request headers and exposes the authenticated user", async () => {
    mocks.getSession.mockResolvedValue({ user });
    const requestHeaders = new Headers({ cookie: "session=one" });
    expect(await getAuthenticatedUser(requestHeaders)).toEqual(user);
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(await requireAuthenticatedUser(requestHeaders)).toEqual(user);
  });

  it("uses the current Next request headers when none are supplied", async () => {
    mocks.getSession.mockResolvedValue({ user });
    await expect(getAuthenticatedUser()).resolves.toEqual(user);
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: new Headers({ cookie: "better-auth.session_token=x" }),
    });
  });

  it("allows USER and ADMIN where user permissions are required and rejects role escalation", async () => {
    mocks.getSession.mockResolvedValue({ user });
    await expect(requireRole("USER", new Headers())).resolves.toEqual(user);
    await expect(requireRole("ADMIN", new Headers())).rejects.toMatchObject({
      statusCode: 403,
    });
    mocks.getSession.mockResolvedValue({ user: { ...user, role: "ADMIN" } });
    await expect(requireRole("ADMIN", new Headers())).resolves.toMatchObject({
      role: "ADMIN",
    });
    await expect(requireRole("USER", new Headers())).resolves.toMatchObject({
      role: "ADMIN",
    });
  });
});
