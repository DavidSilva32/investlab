import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { controller, logger } = vi.hoisted(() => ({
  controller: { getReview: vi.fn(), resolve: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/financial-card-settlement.controller", () => ({
  financialCardSettlementController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-card-settlement",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET, POST } from "@/app/api/financial-card-settlements/route";

describe("financial card settlement route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the review candidates from the controller", async () => {
    const response = Response.json({ settlements: [], cardEntries: [] });
    controller.getReview.mockResolvedValue(response);
    await expect(
      GET(new Request("http://localhost/api/financial-card-settlements")),
    ).resolves.toBe(response);
    expect(controller.getReview).toHaveBeenCalledWith(
      "request-card-settlement",
    );
  });

  it("returns a safe message when the controller cannot load candidates", async () => {
    controller.getReview.mockRejectedValue(
      new Error("private database detail"),
    );
    const response = await GET(
      new Request("http://localhost/api/financial-card-settlements"),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível carregar pagamentos para conferência.",
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("returns client-safe expected errors and hides unexpected write failures", async () => {
    controller.getReview.mockRejectedValue(
      new ApplicationError("A conferência não está disponível.", 409),
    );
    const expectedReviewError = await GET(
      new Request("http://localhost/api/financial-card-settlements"),
    );
    expect(expectedReviewError.status).toBe(409);
    await expect(expectedReviewError.json()).resolves.toEqual({
      message: "A conferência não está disponível.",
    });
    expect(logger.warn).toHaveBeenCalledOnce();

    controller.resolve.mockRejectedValue(new Error("private database detail"));
    const unexpectedWriteError = await POST(
      new Request("http://localhost/api/financial-card-settlements", {
        method: "POST",
        body: JSON.stringify({
          settlementEntryId: "11111111-1111-4111-8111-111111111111",
          resolution: "NOT_RELATED",
          cardEntryIds: [],
        }),
      }),
    );
    expect(unexpectedWriteError.status).toBe(500);
    await expect(unexpectedWriteError.json()).resolves.toEqual({
      message: "Não foi possível salvar a conferência.",
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("preserves expected review failures without exposing unexpected write errors", async () => {
    controller.getReview.mockRejectedValue(
      new ApplicationError("A conferência não está disponível.", 409),
    );
    const reviewError = await GET(
      new Request("http://localhost/api/financial-card-settlements"),
    );
    expect(reviewError.status).toBe(409);
    await expect(reviewError.json()).resolves.toEqual({
      message: "A conferência não está disponível.",
    });
    expect(logger.warn).toHaveBeenCalledOnce();

    controller.resolve.mockRejectedValue(new Error("private database detail"));
    const writeError = await POST(
      new Request("http://localhost/api/financial-card-settlements", {
        method: "POST",
        body: JSON.stringify({
          settlementEntryId: "11111111-1111-4111-8111-111111111111",
          resolution: "NOT_RELATED",
          cardEntryIds: [],
        }),
      }),
    );
    expect(writeError.status).toBe(500);
    await expect(writeError.json()).resolves.toEqual({
      message: "Não foi possível salvar a conferência.",
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("delegates a valid decision and returns safe errors", async () => {
    const body = {
      settlementEntryId: "11111111-1111-4111-8111-111111111111",
      resolution: "NOT_RELATED",
      cardEntryIds: [],
    };
    const response = Response.json({ resolution: "NOT_RELATED" });
    controller.resolve.mockResolvedValue(response);
    await expect(
      POST(
        new Request("http://localhost/api/financial-card-settlements", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      ),
    ).resolves.toBe(response);
    expect(controller.resolve).toHaveBeenCalledWith(
      body,
      "request-card-settlement",
    );

    controller.resolve.mockRejectedValueOnce(
      new ApplicationError("A conferência venceu.", 409),
    );
    const conflict = await POST(
      new Request("http://localhost/api/financial-card-settlements", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      message: "A conferência venceu.",
    });

    const malformed = await POST(
      new Request("http://localhost/api/financial-card-settlements", {
        method: "POST",
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
  });
});
