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
  it("forwards OAuth and other auth requests through the Better Auth handler", async () => {
    const request = new Request(
      "https://investlab.example/api/auth/oauth2/token",
    );
    const response = new Response(null, { status: 204 });
    mocks.POST.mockResolvedValue(response);

    await expect(POST(request)).resolves.toBe(response);
    expect(mocks.POST).toHaveBeenCalledWith(request);
    expect([GET, PATCH, PUT, DELETE]).toEqual([
      mocks.GET,
      mocks.PATCH,
      mocks.PUT,
      mocks.DELETE,
    ]);
  });
});
