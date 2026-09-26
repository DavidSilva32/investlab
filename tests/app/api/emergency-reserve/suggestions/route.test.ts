import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ suggest: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));
vi.mock("@/backend/controllers/emergency-reserve.controller", () => ({
  emergencyReserveController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/emergency-reserve/suggestions/route";

describe("emergency reserve suggestions route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates the request body and request id to the controller", async () => {
    const response = Response.json({ status: "suggestions" });
    controller.suggest.mockResolvedValue(response);

    const result = await POST(
      new Request("http://test", {
        method: "POST",
        headers: {
          "x-request-id": "suggestion-request",
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetAmount: 100 }),
      }),
    );

    expect(result).toBe(response);
    expect(controller.suggest).toHaveBeenCalledWith(
      { targetAmount: 100 },
      "suggestion-request",
    );
  });

  it("returns a client-safe error for unexpected failures", async () => {
    controller.suggest.mockRejectedValue(new Error("database secret"));

    const response = await POST(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetAmount: 100 }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível buscar sugestões agora. Tente novamente.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "emergency_reserve_suggestions_failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("preserves expected validation errors", async () => {
    controller.suggest.mockRejectedValue(
      new ApplicationError("Valor inválido.", 400),
    );

    const response = await POST(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Valor inválido.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
