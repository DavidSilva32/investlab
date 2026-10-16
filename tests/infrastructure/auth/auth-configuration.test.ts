import { describe, expect, it } from "vitest";

import {
  AuthenticationConfigurationError,
  getAuthSecret,
} from "@/infrastructure/auth/auth-configuration";

describe("authentication configuration", () => {
  it("accepts a sufficiently long signing secret", () => {
    expect(getAuthSecret({ AUTH_SECRET: "s".repeat(32) })).toBe("s".repeat(32));
  });

  it("rejects absent and short signing secrets", () => {
    expect(() => getAuthSecret({})).toThrow(AuthenticationConfigurationError);
    expect(() => getAuthSecret({ AUTH_SECRET: "curto" })).toThrow(
      AuthenticationConfigurationError,
    );
  });
});
