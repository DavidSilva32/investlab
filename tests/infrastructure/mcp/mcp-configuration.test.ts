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

  it("uses the configured public resource in MCP setup documentation", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://investlab.example");
    const { mcpDocumentationResource } =
      await import("@/infrastructure/mcp/mcp-configuration");
    expect(mcpDocumentationResource).toBe("https://investlab.example/api/mcp");
  });

  it("shows the public deployment URL in MCP setup documentation locally", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_URL", "");
    const { mcpDocumentationResource } =
      await import("@/infrastructure/mcp/mcp-configuration");
    expect(mcpDocumentationResource).toBe(
      "https://investlab-amber.vercel.app/api/mcp",
    );
  });

  it("uses the Vercel URL in MCP setup documentation for a deployment", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL_URL", "preview.example");
    const { mcpDocumentationResource } =
      await import("@/infrastructure/mcp/mcp-configuration");
    expect(mcpDocumentationResource).toBe("https://preview.example/api/mcp");
  });
});
