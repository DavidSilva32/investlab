import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handler: vi.fn(),
}));

vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { handler: mocks.handler },
}));

import { GET, HEAD } from "@/app/api/mcp/.well-known/[...metadata]/route";

describe("MCP OAuth metadata aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handler.mockResolvedValue(Response.json({ issuer: "investlab" }));
  });

  it.each([
    [
      "oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ],
    [
      "oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/auth",
    ],
  ])("forwards %s to Better Auth discovery", async (metadata, expectedPath) => {
    const response = await GET(
      new Request(`https://investlab.example/api/mcp/.well-known/${metadata}`),
      { params: Promise.resolve({ metadata: [metadata] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.handler).toHaveBeenCalledOnce();
    const forwardedRequest = mocks.handler.mock.calls[0][0] as Request;
    expect(new URL(forwardedRequest.url).pathname).toBe(expectedPath);
    expect(new URL(forwardedRequest.url).origin).toBe(
      "https://investlab.example",
    );
  });

  it("supports HEAD metadata discovery", async () => {
    const response = await HEAD(
      new Request(
        "https://investlab.example/api/mcp/.well-known/oauth-protected-resource",
        { method: "HEAD" },
      ),
      { params: Promise.resolve({ metadata: ["oauth-protected-resource"] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.handler.mock.calls[0][0].method).toBe("HEAD");
  });

  it("does not forward unknown discovery paths", async () => {
    const response = await GET(
      new Request("https://investlab.example/api/mcp/.well-known/other"),
      { params: Promise.resolve({ metadata: ["other"] }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.handler).not.toHaveBeenCalled();
  });
});
