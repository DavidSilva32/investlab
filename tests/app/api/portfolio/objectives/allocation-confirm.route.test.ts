import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ confirmAllocation: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/portfolio/objectives/allocation/confirm/route";

describe("objective allocation confirm route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates confirmation and returns its response", async () => {
    controller.confirmAllocation.mockResolvedValue(
      Response.json({ message: "saved" }),
    );
    const response = await POST(
      new Request(
        "http://localhost/api/portfolio/objectives/allocation/confirm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ allocation: {} }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(controller.confirmAllocation).toHaveBeenCalledWith(
      { allocation: {} },
      expect.any(String),
    );
  });

  it("returns expected errors and hides unexpected details", async () => {
    const request = () =>
      new Request(
        "http://localhost/api/portfolio/objectives/allocation/confirm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
    controller.confirmAllocation.mockRejectedValueOnce(
      new ApplicationError("Prévia expirada.", 409),
    );
    const expected = await POST(request());
    expect(expected.status).toBe(409);
    await expect(expected.json()).resolves.toEqual({
      message: "Prévia expirada.",
    });
    controller.confirmAllocation.mockRejectedValueOnce(
      new Error("private database message"),
    );
    const unexpected = await POST(request());
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível salvar a distribuição.",
    });
  });
});
