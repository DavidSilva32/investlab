import { describe, expect, it, vi } from "vitest";
const controller = vi.hoisted(() => ({ positions: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/backend/controllers/portfolio.controller", () => ({
  portfolioController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { GET } from "@/app/api/positions/route";
describe("positions route", () => {
  it("delegates to the portfolio controller", async () => {
    controller.positions.mockResolvedValue(
      Response.json([{ id: "position-1" }]),
    );
    expect(
      await (
        await GET(
          new Request("http://test", {
            headers: { "x-request-id": "request-1" },
          }),
        )
      ).json(),
    ).toEqual([{ id: "position-1" }]);
    expect(controller.positions).toHaveBeenCalledWith("request-1");
  });
  it("hides controller failures", async () => {
    controller.positions.mockRejectedValue(new Error("database"));
    expect((await GET(new Request("http://test"))).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
