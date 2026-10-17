import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

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
  const secret = "unit-test-secret-with-at-least-32-characters";

  function signedPayload(payload: unknown) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_SECRET", secret);
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
    expect(
      readAdminSupportViewToken(
        new Headers({ cookie: "other=ignored; investlab-support-view=bad" }),
      ),
    ).toBeNull();
    const validToken = "a".repeat(43);
    expect(
      readAdminSupportViewToken(
        new Headers({ cookie: `${ADMIN_SUPPORT_VIEW_COOKIE}=${validToken}` }),
      ),
    ).toBe(validToken);
  });

  it("lists current targets only for an authorized administrator", async () => {
    const targets = [target];
    mocks.repository.listTargets.mockResolvedValue({ kind: "listed", targets });
    await expect(service.listTargets(new Headers())).resolves.toBe(targets);
    expect(mocks.repository.listTargets).toHaveBeenCalledWith(admin.id);
    mocks.repository.listTargets.mockResolvedValueOnce({
      kind: "actor-not-authorized",
    });
    await expect(service.listTargets()).rejects.toMatchObject({
      statusCode: 403,
    });
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

  it("rejects malformed, unverifiable, and structurally invalid signed tokens", async () => {
    await expect(service.getActive(null, admin.id)).resolves.toBeNull();
    await expect(
      service.getActive("missing-separator", admin.id),
    ).resolves.toBeNull();
    await expect(
      service.getActive("one.two.three", admin.id),
    ).resolves.toBeNull();

    vi.stubEnv("AUTH_SECRET", "short");
    await expect(
      service.getActive("payload.signature", admin.id),
    ).resolves.toBeNull();
    vi.stubEnv("AUTH_SECRET", secret);

    const invalidJson = Buffer.from("not-json").toString("base64url");
    const invalidJsonToken = `${invalidJson}.${createHmac("sha256", secret)
      .update(invalidJson)
      .digest("base64url")}`;
    await expect(
      service.getActive(invalidJsonToken, admin.id),
    ).resolves.toBeNull();

    for (const payload of [
      {
        actorUserId: "admin-1",
        targetUserId: "customer-1",
        expiresAt: "later",
      },
      { actorUserId: "admin-1", targetUserId: 2, expiresAt: Date.now() + 1000 },
    ]) {
      await expect(
        service.getActive(signedPayload(payload), admin.id),
      ).resolves.toBeNull();
    }
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
