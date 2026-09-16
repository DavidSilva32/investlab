import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, verifySession } from "@/infrastructure/auth/session";

describe("session", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("creates and verifies a signed session", async () => {
    vi.stubEnv("AUTH_SECRET", "a sufficiently long test secret");
    expect(await verifySession(await createSession("user@test.com"))).toBe(
      true,
    );
  });
  it("rejects absent, malformed and tampered sessions", async () => {
    vi.stubEnv("AUTH_SECRET", "a sufficiently long test secret");
    expect(await verifySession()).toBe(false);
    expect(await verifySession("invalid")).toBe(false);
    const token = await createSession("user@test.com");
    expect(await verifySession(`${token}x`)).toBe(false);
    expect(await verifySession(`x${token.slice(1)}`)).toBe(false);
  });
  it("requires a secret", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(createSession("user@test.com")).rejects.toThrow("AUTH_SECRET");
  });
  it("rejects an expired session", async () => {
    vi.stubEnv("AUTH_SECRET", "a sufficiently long test secret");
    vi.useFakeTimers();
    const token = await createSession("user@test.com");
    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 8);
    expect(await verifySession(token)).toBe(false);
    vi.useRealTimers();
  });
});
