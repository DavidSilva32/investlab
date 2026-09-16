import { scryptSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialsService } from "@/infrastructure/auth/credentials.service";

describe("CredentialsService", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("validates a scrypt password hash", async () => {
    const salt = "salt";
    const hash = scryptSync("secret", salt, 64).toString("hex");
    vi.stubEnv("AUTH_EMAIL", "user@test.com");
    vi.stubEnv("AUTH_PASSWORD_HASH", `${salt}:${hash}`);
    const service = new CredentialsService();
    await expect(service.verify("user@test.com", "secret")).resolves.toBe(true);
    await expect(service.verify("user@test.com", "wrong")).resolves.toBe(false);
  });
  it("rejects missing, different and malformed credentials", async () => {
    const service = new CredentialsService();
    vi.stubEnv("AUTH_EMAIL", "");
    vi.stubEnv("AUTH_PASSWORD_HASH", "");
    await expect(service.verify("user@test.com", "secret")).resolves.toBe(
      false,
    );
    vi.stubEnv("AUTH_EMAIL", "user@test.com");
    vi.stubEnv("AUTH_PASSWORD_HASH", "invalid");
    await expect(service.verify("other@test.com", "secret")).resolves.toBe(
      false,
    );
    await expect(service.verify("user@test.com", "secret")).resolves.toBe(
      false,
    );
  });
});
