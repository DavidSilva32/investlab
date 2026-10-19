import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { handler: mocks.handler },
}));

import { GET } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

describe("MCP protected resource discovery alias", () => {
  it("forwards resource discovery to Better Auth", async () => {
    const request = new Request(
      "https://investlab.example/.well-known/oauth-protected-resource/api/mcp",
    );
    const response = new Response("{}", { status: 200 });
    mocks.handler.mockImplementation(async (forwarded: Request) => {
      expect(new URL(forwarded.url).pathname).toBe(
        "/api/auth/.well-known/oauth-protected-resource/api/mcp",
      );
      return response;
    });

    await expect(GET(request)).resolves.toBe(response);
  });
});
