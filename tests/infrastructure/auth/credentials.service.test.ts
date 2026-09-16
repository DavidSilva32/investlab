import { scryptSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CredentialsService } from "@/infrastructure/auth/credentials.service";

const secret = "s".repeat(32);

describe("CredentialsService", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the normal password generated into a scrypt hash", async () => {
    const salt = "a".repeat(32);
    const hash = scryptSync("MinhaSenha123", salt, 64).toString("hex");
    vi.stubEnv("AUTH_EMAIL", "usuario@exemplo.com");
    vi.stubEnv("AUTH_PASSWORD_HASH", `${salt}:${hash}`);
    vi.stubEnv("AUTH_SECRET", secret);

    const service = new CredentialsService();

    await expect(
      service.verify("usuario@exemplo.com", "MinhaSenha123"),
    ).resolves.toBe(true);
    await expect(
      service.verify("usuario@exemplo.com", "senha-incorreta"),
    ).resolves.toBe(false);
    await expect(
      service.verify("outro@exemplo.com", "MinhaSenha123"),
    ).resolves.toBe(false);
  });
});
