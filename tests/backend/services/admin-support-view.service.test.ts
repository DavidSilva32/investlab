import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: { listTargets: vi.fn(), getActiveTarget: vi.fn() },
  requireRole: vi.fn(),
}));
vi.mock("@/backend/repositories/admin-support-view.repository", () => ({
  adminSupportViewRepository: mocks.repository,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  requireRole: mocks.requireRole,
}));

import {
  ADMIN_SUPPORT_VIEW_COOKIE,
  ADMIN_SUPPORT_VIEW_DURATION_MS,
  AdminSupportViewService,
  hasAdminSupportViewCookie,
  readAdminSupportViewToken,
} from "@/backend/services/admin-support-view.service";

describe("AdminSupportViewService", () => {
  const service = new AdminSupportViewService();
  const admin = { id: "admin-1", role: "ADMIN" as const };
  const target = { id: "customer-1", name: "Marcos", email: "m@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_SECRET", "unit-test-secret-with-at-least-32-characters");
    mocks.requireRole.mockResolvedValue(admin);
    mocks.repository.getActiveTarget.mockResolvedValue({
      kind: "found",
      target,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("reads only the configured support cookie and detects malformed cookie presence", () => {
    expect(readAdminSupportViewToken(undefined)).toBeNull();
    expect(readAdminSupportViewToken(new Headers())).toBeNull();
    expect(
      readAdminSupportViewToken(
        new Headers({ cookie: `${ADMIN_SUPPORT_VIEW_COOKIE}=malformed.token` }),
      ),
    ).toBeNull();
    expect(
      hasAdminSupportViewCookie(
        new Headers({ cookie: `${ADMIN_SUPPORT_VIEW_COOKIE}=malformed.token` }),
      ),
    ).toBe(true);
    expect(hasAdminSupportViewCookie(new Headers())).toBe(false);
  });

  it("issues an expiring signed cookie bound to the active admin and target", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T13:00:00.000Z"));
    const result = await service.start("customer-1", new Headers());
    expect(result.target).toEqual(target);
    expect(result.expiresAt.getTime()).toBe(
      Date.now() + ADMIN_SUPPORT_VIEW_DURATION_MS,
    );
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(result.token).not.toContain(admin.id);
    expect(result.token).not.toContain(target.id);
    expect(mocks.repository.getActiveTarget).toHaveBeenCalledWith(
      admin.id,
      target.id,
    );

    await expect(
      service.getActive(result.token, admin.id),
    ).resolves.toMatchObject({
      actorUserId: admin.id,
      targetUserId: target.id,
      targetName: target.name,
      targetEmail: target.email,
      expiresAt: result.expiresAt,
    });
  });

  it("rejects signature tampering, expiration, another actor, and unavailable targets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T13:00:00.000Z"));
    const { token } = await service.start("customer-1");
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    await expect(service.getActive(tampered, admin.id)).resolves.toBeNull();
    await expect(service.getActive(token, "other-admin")).resolves.toBeNull();

    vi.setSystemTime(new Date(Date.now() + ADMIN_SUPPORT_VIEW_DURATION_MS));
    await expect(service.getActive(token, admin.id)).resolves.toBeNull();

    vi.setSystemTime(new Date("2026-10-16T13:00:00.000Z"));
    const fresh = await service.start("customer-1");
    mocks.repository.getActiveTarget.mockResolvedValueOnce({
      kind: "actor-not-authorized",
    });
    await expect(service.getActive(fresh.token, admin.id)).resolves.toBeNull();
  });

  it("rejects inactive administrators or targets before issuing a cookie", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("not admin"));
    await expect(service.start("customer-1")).rejects.toThrow("not admin");
    mocks.repository.getActiveTarget.mockResolvedValueOnce({
      kind: "actor-not-authorized",
    });
    await expect(service.start("customer-1")).rejects.toMatchObject({
      statusCode: 403,
    });
    mocks.repository.getActiveTarget.mockResolvedValueOnce({
      kind: "target-not-found",
    });
    await expect(service.start("disabled-user")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
