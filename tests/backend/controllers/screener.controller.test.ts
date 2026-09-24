import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("@/backend/services/screener.service", () => ({
  screenerService: { search: mocks.search },
  filtersFromSearchParams: mocks.parse,
}));

import { ScreenerController } from "@/backend/controllers/screener.controller";

describe("ScreenerController", () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.parse.mockReset().mockReturnValue({ maximumPe: 20 });
  });

  it("adapts query filters and adds the request id to the JSON response", async () => {
    const result = { results: [], counts: {}, filters: { maximumPe: 20 } };
    mocks.search.mockResolvedValue(result);
    const response = await new ScreenerController().search(
      new URLSearchParams("maximumPe=20"),
      "request-1",
    );
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(mocks.search).toHaveBeenCalledWith({ maximumPe: 20 }, "request-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...result,
      requestId: "request-1",
    });
  });

  it("propagates service errors to the route boundary", async () => {
    const failure = new Error("local query failed");
    mocks.search.mockRejectedValue(failure);
    await expect(
      new ScreenerController().search(new URLSearchParams(), "request-2"),
    ).rejects.toBe(failure);
  });
});
