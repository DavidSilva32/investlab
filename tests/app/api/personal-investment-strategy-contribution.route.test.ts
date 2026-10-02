import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ simulateContribution: vi.fn() }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock(
  "@/backend/controllers/personal-investment-strategy.controller",
  () => ({
    personalInvestmentStrategyController: controller,
  }),
);
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/portfolio/strategy/contribution/route";
import { ApplicationError } from "@/backend/errors/application-error";

describe("POST /api/portfolio/strategy/contribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the contribution projection", async () => {
    const projection = { contributionCents: "10000" };
    controller.simulateContribution.mockResolvedValue(
      Response.json(projection),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy/contribution", {
        method: "POST",
        headers: { "x-request-id": "req-contribution" },
        body: JSON.stringify({ contributionAmount: 100 }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(projection);
    expect(controller.simulateContribution).toHaveBeenCalledWith(
      { contributionAmount: 100 },
      "req-contribution",
    );
  });

  it("returns a client-safe validation error for malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy/contribution", {
        method: "POST",
        body: "invalid",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Informe os dados do aporte em formato válido.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("preserves client-safe application errors", async () => {
    controller.simulateContribution.mockRejectedValue(
      new ApplicationError("Composição inválida.", 400),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy/contribution", {
        method: "POST",
        body: JSON.stringify({ allocationPercentages: {} }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Composição inválida.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("hides unexpected errors behind a generic message", async () => {
    controller.simulateContribution.mockRejectedValue(
      new Error("private database detail"),
    );
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy/contribution", {
        method: "POST",
        body: JSON.stringify({ contributionAmount: 100 }),
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível simular a distribuição do aporte.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
