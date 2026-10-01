import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ previewAllocation: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/portfolio/objectives/allocation/preview/route";

describe("objective allocation preview route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates the preview and returns its response", async () => {
    controller.previewAllocation.mockResolvedValue(
      Response.json({ optimal: true }),
    );
    const response = await POST(
      new Request(
        "http://localhost/api/portfolio/objectives/allocation/preview",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "request-1",
          },
          body: JSON.stringify({ balances: [] }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(controller.previewAllocation).toHaveBeenCalledWith(
      { balances: [] },
      "request-1",
    );
  });

  it("returns expected errors and hides unexpected details", async () => {
    const request = () =>
      new Request(
        "http://localhost/api/portfolio/objectives/allocation/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
    controller.previewAllocation.mockRejectedValueOnce(
      new ApplicationError("Saldo inválido.", 400),
    );
    const expected = await POST(request());
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toEqual({
      message: "Saldo inválido.",
    });
    controller.previewAllocation.mockRejectedValueOnce(
      new Error("private database message"),
    );
    const unexpected = await POST(request());
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível buscar uma distribuição agora.",
    });
  });
});
