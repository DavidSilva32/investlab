import { describe, expect, it, vi } from "vitest";
const controller = vi.hoisted(() => ({ overview: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/backend/controllers/portfolio.controller", () => ({
  portfolioController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { GET } from "@/app/api/portfolio/route";
describe("portfolio route", () => {
  it("delegates the request id and hides failures", async () => {
    controller.overview
      .mockResolvedValueOnce(Response.json({ positions: [] }))
      .mockRejectedValueOnce(new Error("db"));
    expect(
      (
        await GET(
          new Request("http://test", { headers: { "x-request-id": "r1" } }),
        )
      ).status,
    ).toBe(200);
    expect(controller.overview).toHaveBeenCalledWith("r1");
    expect((await GET(new Request("http://test"))).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
