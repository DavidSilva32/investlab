const minimumAuthSecretLength = 32;
type AuthenticationEnvironment = {
  AUTH_SECRET?: string;
};

export class AuthenticationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

export function getAuthSecret(
  environment: AuthenticationEnvironment = process.env as AuthenticationEnvironment,
) {
  const secret = environment.AUTH_SECRET;

  if (typeof secret !== "string" || secret.length < minimumAuthSecretLength) {
    throw new AuthenticationConfigurationError(
      `AUTH_SECRET must contain at least ${minimumAuthSecretLength} characters.`,
    );
  }

  return secret;
}
