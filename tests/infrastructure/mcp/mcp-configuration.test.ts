import { afterEach, describe, expect, it, vi } from "vitest";

describe("MCP resource configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the configured public auth base URL", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://investlab.example");
    vi.stubEnv("VERCEL_URL", "preview.example");
    const { mcpResource } =
      await import("@/infrastructure/mcp/mcp-configuration");
    expect(mcpResource).toBe("https://investlab.example/api/mcp");
  });

  it("uses the Vercel deployment URL when no explicit auth URL exists", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL_URL", "preview.example");
    const { mcpResource } =
      await import("@/infrastructure/mcp/mcp-configuration");
    expect(mcpResource).toBe("https://preview.example/api/mcp");
  });
});
