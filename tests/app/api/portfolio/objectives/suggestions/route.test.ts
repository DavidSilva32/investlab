import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ suggestions: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/portfolio/objectives/suggestions/route";

describe("portfolio objective suggestions route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the suggestion result", async () => {
    controller.suggestions.mockResolvedValue(
      Response.json({ status: "suggestions", candidates: [] }),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/objectives/suggestions", {
        method: "POST",
        body: JSON.stringify({ targetAmount: 100, instrumentType: "CDB" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "suggestions",
      candidates: [],
    });
  });

  it("returns expected client-safe errors and generic failures", async () => {
    const request = () =>
      new Request("http://localhost/api/portfolio/objectives/suggestions", {
        method: "POST",
        body: JSON.stringify({ targetAmount: 0 }),
        headers: { "content-type": "application/json" },
      });
    controller.suggestions.mockRejectedValue(
      new ApplicationError("Informe um valor válido.", 400),
    );
    const expectedFailure = await POST(request());
    expect(expectedFailure.status).toBe(400);
    await expect(expectedFailure.json()).resolves.toEqual({
      message: "Informe um valor válido.",
    });

    controller.suggestions.mockRejectedValue(new Error("database secret"));
    const unexpectedFailure = await POST(request());
    expect(unexpectedFailure.status).toBe(500);
    await expect(unexpectedFailure.json()).resolves.toEqual({
      message: "Não foi possível buscar combinações agora.",
    });
  });
});
