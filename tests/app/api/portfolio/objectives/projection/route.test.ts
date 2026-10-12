import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ simulateProjection: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/portfolio/objectives/projection/route";

function request(body: string) {
  return new Request("http://localhost/api/portfolio/objectives/projection", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("objective projection route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards a valid simulation and returns its response", async () => {
    controller.simulateProjection.mockReturnValue(
      Response.json({ projectedNominalAmount: 1_000 }),
    );
    const response = await POST(request(JSON.stringify({ horizonYears: 10 })));

    expect(response.status).toBe(200);
    expect(controller.simulateProjection).toHaveBeenCalledWith(
      { horizonYears: 10 },
      expect.any(String),
    );
  });

  it("returns client-safe validation and unexpected errors", async () => {
    controller.simulateProjection.mockImplementation(() => {
      throw new ApplicationError("Revise as premissas.", 400);
    });
    const expected = await POST(request("{}"));
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toEqual({
      message: "Revise as premissas.",
    });

    controller.simulateProjection.mockImplementation(() => {
      throw new Error("internal database details");
    });
    const unexpected = await POST(request("{}"));
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível calcular a projeção do objetivo.",
    });
  });

  it("treats malformed JSON as a client error", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "O corpo da simulação é inválido.",
    });
    expect(controller.simulateProjection).not.toHaveBeenCalled();
  });
});
