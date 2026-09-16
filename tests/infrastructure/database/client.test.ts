import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  drizzle: vi.fn(),
  url: vi.fn(() => "postgresql://pooled"),
}));
vi.mock("pg", () => ({ Pool: mocks.pool }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
vi.mock("@/infrastructure/database/env", () => ({
  getDatabasePooledUrl: mocks.url,
}));

describe("database client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.pool.mockImplementation(function () {
      return { pool: true };
    });
    mocks.drizzle.mockReturnValue({ client: true });
    delete (globalThis as { investLabDatabaseClient?: unknown })
      .investLabDatabaseClient;
    delete (globalThis as { investLabDatabasePool?: unknown })
      .investLabDatabasePool;
  });
  it("creates and reuses a pooled Drizzle client", async () => {
    const { getDatabaseClient } =
      await import("@/infrastructure/database/client");
    expect(getDatabaseClient()).toEqual({ client: true });
    expect(getDatabaseClient()).toEqual({ client: true });
    expect(mocks.url).toHaveBeenCalledTimes(1);
    expect(mocks.pool).toHaveBeenCalledWith({
      connectionString: "postgresql://pooled",
    });
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
  });
  it("reuses an existing pool when rebuilding the client", async () => {
    const { getDatabaseClient } =
      await import("@/infrastructure/database/client");
    getDatabaseClient();
    delete (globalThis as { investLabDatabaseClient?: unknown })
      .investLabDatabaseClient;
    getDatabaseClient();
    expect(mocks.pool).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalledTimes(2);
  });
});
