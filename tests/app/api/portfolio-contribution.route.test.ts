import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ calculateContribution: vi.fn() }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/portfolio.controller", () => ({
  portfolioController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/portfolio/contribution/route";

describe("POST /api/portfolio/contribution", () => {
  afterEach(() => vi.clearAllMocks());

  it("delegates the aporte calculation to the controller", async () => {
    controller.calculateContribution.mockResolvedValue(
      Response.json({ status: "ready" }),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/contribution", {
        method: "POST",
        headers: { "x-request-id": "request-1" },
        body: JSON.stringify({ contributionAmount: 8000 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(controller.calculateContribution).toHaveBeenCalledWith(
      expect.any(Request),
      "request-1",
    );
  });

  it("returns a safe fallback when the calculation fails unexpectedly", async () => {
    controller.calculateContribution.mockRejectedValue(new Error("private"));
    const response = await POST(
      new Request("http://localhost/api/portfolio/contribution", {
        method: "POST",
        body: JSON.stringify({ contributionAmount: 8000 }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Não foi possível calcular a distribuição do aporte.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_contribution_failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("preserves client-safe application errors from the controller", async () => {
    controller.calculateContribution.mockRejectedValue(
      new ApplicationError("Informe um valor válido para o aporte.", 400),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/contribution", {
        method: "POST",
        body: JSON.stringify({ contributionAmount: 8000 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Informe um valor válido para o aporte.",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(logger.warn).toHaveBeenCalledWith(
      "portfolio_contribution_failed",
      expect.objectContaining({ error: expect.any(ApplicationError) }),
    );
  });
});
