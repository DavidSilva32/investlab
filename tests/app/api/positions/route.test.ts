import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  logger: { error: vi.fn() },
}));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: mocks.list },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { GET } from "@/app/api/positions/route";

describe("positions route", () => {
  it("returns positions and propagates request id", async () => {
    mocks.list.mockResolvedValue([{ id: "position-1" }]);
    const response = await GET(
      new Request("http://test", { headers: { "x-request-id": "request-1" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "position-1" }]);
    expect(mocks.list).toHaveBeenCalledWith("request-1");
  });

  it("hides repository failures", async () => {
    mocks.list.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("http://test"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
