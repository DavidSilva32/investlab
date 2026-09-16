import { describe, expect, it } from "vitest";

import {
  getDatabaseEnvironment,
  getDatabasePooledUrl,
  getDatabaseUrl,
} from "@/infrastructure/database/env";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/investlab",
  DATABASE_URL_POOLED:
    "postgresql://user:password@localhost:5432/investlab?pgbouncer=true",
};

describe("database environment", () => {
  it("returns the direct URL for administrative database tools", () => {
    expect(getDatabaseUrl(validEnvironment)).toBe(
      validEnvironment.DATABASE_URL,
    );
  });

  it("returns the pooled URL for application runtime", () => {
    expect(getDatabasePooledUrl(validEnvironment)).toBe(
      validEnvironment.DATABASE_URL_POOLED,
    );
  });

  it("validates both required database URLs", () => {
    expect(getDatabaseEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects a missing direct URL without exposing a connection string", () => {
    expect(() =>
      getDatabaseUrl({ DATABASE_URL_POOLED: "postgresql://localhost" }),
    ).toThrow("DATABASE_URL is required.");
  });

  it("rejects a missing pooled URL without exposing a connection string", () => {
    expect(() =>
      getDatabasePooledUrl({ DATABASE_URL: "postgresql://localhost" }),
    ).toThrow("DATABASE_URL_POOLED is required.");
  });
});
