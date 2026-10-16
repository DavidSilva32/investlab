import { describe, expect, it } from "vitest";
import { hasValidCronAuthorization } from "@/infrastructure/auth/cron-authorization";

const secret = "a".repeat(64);

describe("hasValidCronAuthorization", () => {
  it("rejects missing or weakly configured secrets", () => {
    const request = new Request("http://localhost/api/cron");
    expect(hasValidCronAuthorization(request, undefined)).toBe(false);
    expect(hasValidCronAuthorization(request, "short-secret")).toBe(false);
  });

  it("requires a bearer token and compares equal-length tokens safely", () => {
    expect(
      hasValidCronAuthorization(
        new Request("http://localhost/api/cron"),
        secret,
      ),
    ).toBe(false);
    expect(
      hasValidCronAuthorization(
        new Request("http://localhost/api/cron", {
          headers: { authorization: `Basic ${secret}` },
        }),
        secret,
      ),
    ).toBe(false);
    expect(
      hasValidCronAuthorization(
        new Request("http://localhost/api/cron", {
          headers: { authorization: "Bearer short" },
        }),
        secret,
      ),
    ).toBe(false);
    expect(
      hasValidCronAuthorization(
        new Request("http://localhost/api/cron", {
          headers: { authorization: `Bearer ${"b".repeat(64)}` },
        }),
        secret,
      ),
    ).toBe(false);
  });

  it("accepts a matching bearer token", () => {
    expect(
      hasValidCronAuthorization(
        new Request("http://localhost/api/cron", {
          headers: { authorization: `Bearer ${secret}` },
        }),
        secret,
      ),
    ).toBe(true);
  });
});
