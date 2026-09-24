import { describe, expect, it, vi } from "vitest";
import type { ScreenerSyncService } from "@/backend/services/screener-sync.service";
import { ScreenerSyncController } from "@/backend/controllers/screener-sync.controller";

describe("ScreenerSyncController", () => {
  it("delegates synchronization without adding transport concerns", async () => {
    const sync = vi
      .fn()
      .mockResolvedValue({ issuers: 1, securities: 2, facts: 15 });
    const controller = new ScreenerSyncController({ sync } as unknown as Pick<
      ScreenerSyncService,
      "sync"
    >);
    await expect(controller.sync()).resolves.toEqual({
      issuers: 1,
      securities: 2,
      facts: 15,
    });
    expect(sync).toHaveBeenCalledOnce();
  });

  it("propagates service errors to the route boundary", async () => {
    const failure = new Error("sync failed");
    const sync = vi.fn().mockRejectedValue(failure);
    const controller = new ScreenerSyncController({ sync } as unknown as Pick<
      ScreenerSyncService,
      "sync"
    >);
    await expect(controller.sync()).rejects.toBe(failure);
  });
});
