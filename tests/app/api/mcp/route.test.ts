import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  authenticatedHandler: undefined as
    | ((
        request: Request,
        claims: { sub?: unknown; scope?: unknown; scp?: unknown },
      ) => Promise<Response>)
    | undefined,
  claims: { sub: "user-1", scope: "mcp:read" } as {
    sub?: unknown;
    scope?: unknown;
    scp?: unknown;
  },
  createInsufficientScopeError: vi.fn((scopes: string[]) =>
    Object.assign(new Error("insufficient_scope"), { scopes }),
  ),
  handle: vi.fn(),
}));

vi.mock("better-auth/oauth2", () => ({
  createInsufficientScopeError: mocks.createInsufficientScopeError,
}));
vi.mock("@better-auth/mcp", () => ({
  requireMcpAuth: vi.fn(
    (
      _auth: unknown,
      handler: typeof mocks.authenticatedHandler,
      options: Record<string, unknown>,
    ) => {
      mocks.options = options;
      mocks.authenticatedHandler = handler as NonNullable<
        typeof mocks.authenticatedHandler
      >;
      return (request: Request) =>
        mocks.authenticatedHandler!(request, mocks.claims);
    },
  ),
}));
vi.mock("@/infrastructure/auth/auth", () => ({ auth: {} }));
vi.mock("@/backend/controllers/mcp.controller", () => ({
  mcpController: { handle: mocks.handle },
}));

import { POST } from "@/app/api/mcp/route";

describe("MCP POST route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claims = { sub: "user-1", scope: "mcp:read" };
  });

  it("requires OAuth read scope and the canonical protected resource", async () => {
    await POST(
      new Request("https://investlab.example/api/mcp", {
        method: "POST",
        body: JSON.stringify({ method: "tools/list" }),
      }),
    );
    expect(mocks.options).toMatchObject({
      resource: "http://localhost:3000/api/mcp",
      requiredScopes: ["mcp:read"],
      challengeScopes: ["mcp:read"],
    });
  });

  it("returns RFC insufficient-scope errors for admin tool calls without grant", async () => {
    const adminRequest = new Request("https://investlab.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        method: "tools/call",
        params: { name: "admin_search_users" },
      }),
    });
    await expect(POST(adminRequest)).rejects.toMatchObject({
      scopes: ["mcp:admin:read"],
    });
  });

  it("forwards authorized read calls and verified claims to the controller", async () => {
    const response = new Response(null, { status: 202 });
    mocks.handle.mockResolvedValue(response);
    const request = new Request("https://investlab.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" }),
    });

    await expect(POST(request)).resolves.toBe(response);
    expect(mocks.handle).toHaveBeenCalledWith(request, mocks.claims);
  });

  it("accepts admin calls when the grant is represented by the scp array claim", async () => {
    mocks.claims = { sub: "admin-1", scp: ["mcp:read", 7, "mcp:admin:read"] };
    const response = new Response(null, { status: 202 });
    mocks.handle.mockResolvedValue(response);
    const request = new Request("https://investlab.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        method: "tools/call",
        params: { name: "admin_list_users" },
      }),
    });

    await expect(POST(request)).resolves.toBe(response);
    expect(mocks.handle).toHaveBeenCalledWith(request, mocks.claims);
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "notification without a method",
      JSON.stringify({ params: { name: "admin_list_users" } }),
    ],
    [
      "non-tool method",
      JSON.stringify({
        method: "tools/list",
        params: { name: "admin_list_users" },
      }),
    ],
    ["missing params", JSON.stringify({ method: "tools/call" })],
    [
      "non-object params",
      JSON.stringify({ method: "tools/call", params: null }),
    ],
    ["missing tool name", JSON.stringify({ method: "tools/call", params: {} })],
    [
      "non-string tool name",
      JSON.stringify({ method: "tools/call", params: { name: 3 } }),
    ],
  ])(
    "does not mistake %s for an admin tool call",
    async (_description, body) => {
      const request = new Request("https://investlab.example/api/mcp", {
        method: "POST",
        body,
      });
      mocks.handle.mockResolvedValue(new Response(null, { status: 202 }));

      await expect(POST(request)).resolves.toMatchObject({ status: 202 });
      expect(mocks.handle).toHaveBeenCalledWith(request, mocks.claims);
    },
  );

  it("uses an empty scope set for unsupported claim representations", async () => {
    mocks.claims = { sub: "user-1", scope: 4 };
    mocks.handle.mockResolvedValue(new Response(null, { status: 202 }));
    const request = new Request("https://investlab.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        method: "tools/call",
        params: { name: "admin_search_users" },
      }),
    });

    await expect(POST(request)).rejects.toMatchObject({
      scopes: ["mcp:admin:read"],
    });
    expect(mocks.handle).not.toHaveBeenCalled();
  });
});
