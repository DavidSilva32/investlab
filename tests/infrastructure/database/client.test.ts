import { describe, expect, it } from "vitest";

import { getDatabasePooledUrl } from "@/infrastructure/database/env";

describe("database client configuration", () => {
  it("uses the pooled connection configuration for application runtime", () => {
    expect(
      getDatabasePooledUrl({
        DATABASE_URL: "postgresql://user:password@localhost:5432/investlab",
        DATABASE_URL_POOLED:
          "postgresql://user:password@localhost:5432/investlab?pgbouncer=true",
      }),
    ).toBe(
      "postgresql://user:password@localhost:5432/investlab?pgbouncer=true",
    );
  });
});
