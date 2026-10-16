import { timingSafeEqual } from "node:crypto";

export function hasValidCronAuthorization(
  request: Request,
  configuredSecret: string | undefined,
) {
  if (!configuredSecret || configuredSecret.length < 32) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const providedSecret = Buffer.from(authorization.slice("Bearer ".length));
  const expectedSecret = Buffer.from(configuredSecret);
  return (
    providedSecret.length === expectedSecret.length &&
    timingSafeEqual(providedSecret, expectedSecret)
  );
}
