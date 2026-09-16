import { z } from "zod";

const passwordHashPattern = /^[a-f\d]{32}:[a-f\d]{128}$/i;
const minimumAuthSecretLength = 32;

export class AuthenticationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

export function getCredentialsConfiguration(environment = process.env) {
  const email = z.email().safeParse(environment.AUTH_EMAIL);

  if (!email.success) {
    throw new AuthenticationConfigurationError(
      "AUTH_EMAIL must contain a valid e-mail address.",
    );
  }

  const passwordHash = environment.AUTH_PASSWORD_HASH;

  if (
    typeof passwordHash !== "string" ||
    !passwordHashPattern.test(passwordHash)
  ) {
    throw new AuthenticationConfigurationError(
      "AUTH_PASSWORD_HASH must use the expected scrypt format.",
    );
  }

  const [salt, hash] = passwordHash.split(":");

  return { email: email.data, salt, hash };
}

export function getAuthSecret(environment = process.env) {
  const secret = environment.AUTH_SECRET;

  if (typeof secret !== "string" || secret.length < minimumAuthSecretLength) {
    throw new AuthenticationConfigurationError(
      `AUTH_SECRET must contain at least ${minimumAuthSecretLength} characters.`,
    );
  }

  return secret;
}
