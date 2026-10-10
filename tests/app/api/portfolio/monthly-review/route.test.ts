import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  monthlyReview: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("@/backend/controllers/portfolio.controller", () => ({
  portfolioController: { monthlyReview: mocks.monthlyReview },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { GET } from "@/app/api/portfolio/monthly-review/route";

describe("monthly portfolio review route", () => {
  it("delegates the request id and returns the review", async () => {
    mocks.monthlyReview.mockResolvedValueOnce(
      Response.json({ selectedPeriod: "2026-09" }),
    );
    const response = await GET(
      new Request("http://localhost/api/portfolio/monthly-review", {
        headers: { "x-request-id": "review-1" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("review-1");
    expect(mocks.monthlyReview).toHaveBeenCalledWith(
      expect.any(Request),
      "review-1",
    );
  });

  it("preserves application errors and hides unexpected errors", async () => {
    mocks.monthlyReview
      .mockRejectedValueOnce(new ApplicationError("Mês inválido.", 400))
      .mockRejectedValueOnce(new Error("database details"));

    const invalid = await GET(new Request("http://localhost?period=2026-13"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ message: "Mês inválido." });

    const failed = await GET(new Request("http://localhost"));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível consultar os fechamentos da carteira.",
    });
    expect(mocks.logger.error).toHaveBeenCalledTimes(2);
  });
});
