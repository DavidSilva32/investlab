import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ saveObservedBalance: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { PUT } from "@/app/api/portfolio/objectives/balance/route";

describe("objective balance route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards a saved observation and returns its response", async () => {
    controller.saveObservedBalance.mockResolvedValue(
      Response.json({ message: "Saldo observado salvo." }, { status: 201 }),
    );
    const response = await PUT(
      new Request("http://localhost/api/portfolio/objectives/balance", {
        method: "PUT",
        body: JSON.stringify({ objectiveId: "goal-1", amount: "125.50" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(201);
    expect(controller.saveObservedBalance).toHaveBeenCalledWith(
      { objectiveId: "goal-1", amount: "125.50" },
      expect.any(String),
    );
  });

  it("returns client-safe expected and unexpected failures", async () => {
    const request = () =>
      new Request("http://localhost/api/portfolio/objectives/balance", {
        method: "PUT",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
    controller.saveObservedBalance.mockRejectedValue(
      new ApplicationError("Revise o saldo informado.", 400),
    );
    const expected = await PUT(request());
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toEqual({
      message: "Revise o saldo informado.",
    });

    controller.saveObservedBalance.mockRejectedValue(
      new Error("secret database detail"),
    );
    const unexpected = await PUT(request());
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível salvar o saldo.",
    });
  });
});
