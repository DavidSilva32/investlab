import { describe, expect, it } from "vitest";

import { getDatabaseUrl } from "@/infrastructure/database/env";

describe("getDatabaseUrl", () => {
  it("returns a valid PostgreSQL connection URL", () => {
    expect(
      getDatabaseUrl({
        DATABASE_URL: "postgresql://user:password@localhost:5432/investlab",
      }),
    ).toBe("postgresql://user:password@localhost:5432/investlab");
  });

  it("rejects a missing connection URL", () => {
    expect(() => getDatabaseUrl({})).toThrow();
  });
});
