import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  calculateContribution: vi.fn(),
  getOverview: vi.fn(),
  getMonthlyReview: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { PortfolioController } from "@/backend/controllers/portfolio.controller";

describe("PortfolioController", () => {
  it("serializes overview results", async () => {
    service.getOverview.mockResolvedValue({ positions: [], movements: [] });
    const controller = new PortfolioController();
    await expect((await controller.overview("r1")).json()).resolves.toEqual({
      positions: [],
      movements: [],
    });
  });

  it("validates an optional month and returns the monthly review", async () => {
    const review = { selectedPeriod: "2026-08", status: "no_previous_close" };
    service.getMonthlyReview.mockResolvedValue(review);
    const controller = new PortfolioController();
    const response = await controller.monthlyReview(
      new Request(
        "http://localhost/api/portfolio/monthly-review?period=2026-08",
      ),
      "request-1",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(review);
    expect(service.getMonthlyReview).toHaveBeenCalledWith(
      "2026-08",
      "request-1",
    );

    await expect(
      controller.monthlyReview(
        new Request(
          "http://localhost/api/portfolio/monthly-review?period=2026-13",
        ),
        "request-2",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(service.getMonthlyReview).toHaveBeenCalledTimes(1);
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
