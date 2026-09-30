import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  calculateContribution: vi.fn(),
  getOverview: vi.fn(),
  listPositions: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

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

describe("PortfolioController.calculateContribution", () => {
  it("validates and delegates a BRL aporte", async () => {
    const result = { status: "ready", contributionAmount: 0.29 };
    service.calculateContribution.mockResolvedValue(result);
    const response = await new PortfolioController().calculateContribution(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ contributionAmount: 0.29 }),
      }),
      "request-1",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(service.calculateContribution).toHaveBeenCalledWith(
      0.29,
      "request-1",
    );
  });

  it.each([0, -1, 1.234, 1_000_000_000_000.01, "100"])(
    "rejects an invalid aporte value: %s",
    async (contributionAmount) => {
      await expect(
        new PortfolioController().calculateContribution(
          new Request("http://localhost", {
            method: "POST",
            body: JSON.stringify({ contributionAmount }),
          }),
          "request-1",
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it("rejects malformed JSON", async () => {
    await expect(
      new PortfolioController().calculateContribution(
        new Request("http://localhost", { method: "POST", body: "{" }),
        "request-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
