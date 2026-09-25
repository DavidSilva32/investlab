import { describe, expect, it, vi } from "vitest";
import type { ScreenerMarketService } from "@/backend/services/screener-market.service";
import { ScreenerMarketController } from "@/backend/controllers/screener-market.controller";

describe("ScreenerMarketController", () => {
  it("delegates a bounded market refresh with the request id", async () => {
    const refreshBatch = vi.fn().mockResolvedValue({ attemptedIssuers: 20 });
    const controller = new ScreenerMarketController({
      refreshBatch,
    } as unknown as Pick<ScreenerMarketService, "refreshBatch">);
    const response = await controller.refresh("request-1");
    expect(response).toEqual({
      attemptedIssuers: 20,
      requestId: "request-1",
    });
    expect(refreshBatch).toHaveBeenCalledExactlyOnceWith("request-1");
  });

  it("propagates market refresh service failures", async () => {
    const failure = new Error("market failure");
    const controller = new ScreenerMarketController({
      refreshBatch: vi.fn().mockRejectedValue(failure),
    } as unknown as Pick<ScreenerMarketService, "refreshBatch">);
    await expect(controller.refresh("request-2")).rejects.toBe(failure);
  });
});
