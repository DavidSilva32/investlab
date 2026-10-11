import { describe, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ list: vi.fn(), reverse: vi.fn() }));
vi.mock("@/backend/services/position-reconciliation.service", () => ({
  positionReconciliationService: service,
}));
import { positionReconciliationController as controller } from "@/backend/controllers/position-reconciliation.controller";
describe("reconciliation controller", () => {
  it("delegates listing and explicit reversal", async () => {
    service.list.mockResolvedValue({ links: [] });
    expect(await (await controller.list("r")).json()).toEqual({ links: [] });
    service.reverse.mockResolvedValue({ message: "done" });
    const request = new Request("http://test", {
      method: "PATCH",
      body: JSON.stringify({ manualAssetKey: "key" }),
    });
    expect(await (await controller.reverse(request, "r")).json()).toEqual({
      message: "done",
    });
    expect(service.reverse).toHaveBeenCalledWith(
      { manualAssetKey: "key" },
      "r",
    );
  });
  it("rejects malformed JSON", async () => {
    await expect(
      controller.reverse(
        new Request("http://test", { method: "PATCH", body: "{" }),
        "r",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
