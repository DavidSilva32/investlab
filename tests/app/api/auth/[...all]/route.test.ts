import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
}));

vi.mock("@/infrastructure/auth/auth", () => ({
  authHandler: mocks,
}));

import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/auth/[...all]/route";

describe("Better Auth catch-all route", () => {
  it("forwards each auth method to the Better Auth handler", async () => {
    const request = new Request(
      "https://investlab.example/api/auth/oauth2/token",
    );
    const response = new Response(null, { status: 204 });
    for (const method of [
      mocks.GET,
      mocks.POST,
      mocks.PATCH,
      mocks.PUT,
      mocks.DELETE,
    ]) {
      method.mockResolvedValue(response);
    }

    for (const [route, method] of [
      [GET, mocks.GET],
      [POST, mocks.POST],
      [PATCH, mocks.PATCH],
      [PUT, mocks.PUT],
      [DELETE, mocks.DELETE],
    ] as const) {
      await expect(route(request)).resolves.toBe(response);
      expect(method).toHaveBeenCalledWith(request);
    }
  });
});
