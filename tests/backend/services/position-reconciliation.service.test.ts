import { beforeEach, describe, expect, it, vi } from "vitest";
const events = vi.hoisted(() => ({ listEvents: vi.fn(), reverse: vi.fn() }));
const manual = vi.hoisted(() => ({ list: vi.fn() }));
const imported = vi.hoisted(() => ({ listLatestPositions: vi.fn() }));
vi.mock("@/backend/repositories/position-reconciliation.repository", () => ({
  positionReconciliationRepository: events,
}));
vi.mock("@/backend/repositories/manual-portfolio-position.repository", () => ({
  manualPortfolioPositionRepository: manual,
}));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: imported,
}));
import { positionReconciliationService as service } from "@/backend/services/position-reconciliation.service";
const key = "manual:00000000-0000-0000-0000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  imported.listLatestPositions.mockResolvedValue([]);
});
describe("position reconciliation management", () => {
  it("lists only the last linked state with deterministic audit ordering, without losing archived labels", async () => {
    events.listEvents.mockResolvedValue([
      {
        id: "a",
        manualAssetKey: key,
        status: "LINK",
        recordedAt: "2026-10-01T12:00:00Z",
        effectiveFrom: "2026-09-30",
        importedAssetKey: "b3",
      },
      {
        id: "b",
        manualAssetKey: key,
        status: "UNLINK",
        effectiveFrom: "2026-09-30",
        recordedAt: "2026-10-01T12:00:00Z",
      },
      {
        id: "c",
        manualAssetKey: "archived",
        status: "LINK",
        recordedAt: "2026-10-02T12:00:00Z",
        effectiveFrom: "2026-10-01",
        importedAssetKey: "other",
      },
      {
        id: "d",
        manualAssetKey: "present",
        status: "LINK",
        recordedAt: "2026-10-03T12:00:00Z",
        effectiveFrom: "2026-10-02",
        importedAssetKey: "third",
      },
    ]);
    manual.list.mockResolvedValue([{ assetKey: "present", product: "BBAS3" }]);
    expect(await service.list("request")).toEqual({
      links: [
        expect.objectContaining({
          manualAssetKey: "archived",
          manualProduct: "Posição manual arquivada",
        }),
        expect.objectContaining({
          manualAssetKey: "present",
          manualProduct: "BBAS3",
        }),
      ],
      separateDecisions: [],
    });
  });
  it("reverses with server São Paulo date and refuses invalid identities", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T01:00:00Z"));
    try {
      await expect(
        service.reverse({ manualAssetKey: key }, "r"),
      ).resolves.toHaveProperty("message");
      expect(events.reverse).toHaveBeenCalledWith(
        key,
        "2026-10-10",
        "r",
        undefined,
      );
      await expect(
        service.reverse({ manualAssetKey: "bad" }, "r"),
      ).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      vi.useRealTimers();
    }
  });
});
