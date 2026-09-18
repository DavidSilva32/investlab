import { describe, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listPositions: vi.fn(),
}));
vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: service,
}));
import { PortfolioController } from "@/backend/controllers/portfolio.controller";
describe("PortfolioController", () => {
  it("serializes overview and position results", async () => {
    service.getOverview.mockResolvedValue({ positions: [], movements: [] });
    service.listPositions.mockResolvedValue([{ id: "p1" }]);
    const controller = new PortfolioController();
    await expect((await controller.overview("r1")).json()).resolves.toEqual({
      positions: [],
      movements: [],
    });
    await expect((await controller.positions("r2")).json()).resolves.toEqual([
      { id: "p1" },
    ]);
  });
});
