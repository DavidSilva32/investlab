import { describe, expect, it } from "vitest";

import {
  AuthenticationConfigurationError,
  getAuthSecret,
  getCredentialsConfiguration,
} from "@/infrastructure/auth/auth-configuration";

const validHash = `${"a".repeat(32)}:${"b".repeat(128)}`;
const validEnvironment = {
  AUTH_EMAIL: "usuario@exemplo.com",
  AUTH_PASSWORD_HASH: validHash,
  AUTH_SECRET: "s".repeat(32),
};

describe("authentication configuration", () => {
  it("reads a valid e-mail, scrypt hash and secret", () => {
    expect(getCredentialsConfiguration(validEnvironment)).toEqual({
      email: "usuario@exemplo.com",
      salt: "a".repeat(32),
      hash: "b".repeat(128),
    });
    expect(getAuthSecret(validEnvironment)).toBe("s".repeat(32));
  });

  it("rejects missing and invalid credential configuration without values", () => {
    expect(() => getCredentialsConfiguration({})).toThrow(
      AuthenticationConfigurationError,
    );
    expect(() =>
      getCredentialsConfiguration({
        AUTH_EMAIL: "invalido",
        AUTH_PASSWORD_HASH: validHash,
      }),
    ).toThrow(AuthenticationConfigurationError);
    expect(() =>
      getCredentialsConfiguration({
        AUTH_EMAIL: "usuario@exemplo.com",
        AUTH_PASSWORD_HASH: "hash-invalido",
      }),
    ).toThrow(AuthenticationConfigurationError);
  });

  it("rejects absent and short signing secrets", () => {
    expect(() => getAuthSecret({})).toThrow(AuthenticationConfigurationError);
    expect(() => getAuthSecret({ AUTH_SECRET: "curto" })).toThrow(
      AuthenticationConfigurationError,
    );
  });
});
