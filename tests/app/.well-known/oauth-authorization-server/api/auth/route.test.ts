import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { handler: mocks.handler },
}));

import { GET } from "@/app/.well-known/oauth-authorization-server/api/auth/route";

describe("OAuth authorization server discovery alias", () => {
  it("forwards metadata discovery to Better Auth and preserves request headers", async () => {
    const request = new Request(
      "https://investlab.example/.well-known/oauth-authorization-server",
      { headers: { "x-forwarded-host": "investlab.example" } },
    );
    const response = new Response("{}", { status: 200 });
    mocks.handler.mockImplementation(async (forwarded: Request) => {
      expect(new URL(forwarded.url).pathname).toBe(
        "/api/auth/.well-known/oauth-authorization-server",
      );
      expect(forwarded.headers.get("x-forwarded-host")).toBe(
        "investlab.example",
      );
      return response;
    });

    await expect(GET(request)).resolves.toBe(response);
  });
});
