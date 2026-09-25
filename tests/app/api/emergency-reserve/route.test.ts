import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));
vi.mock("@/backend/controllers/emergency-reserve.controller", () => ({
  emergencyReserveController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { GET, PUT } from "@/app/api/emergency-reserve/route";

describe("emergency reserve route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("delegates GET and PUT with the request id and returns controller responses", async () => {
    const response = Response.json({ configured: true });
    controller.get.mockResolvedValue(response);
    controller.update.mockResolvedValue(response);

    expect(
      await GET(
        new Request("http://test", { headers: { "x-request-id": "r1" } }),
      ),
    ).toBe(response);
    const request = new Request("http://test", {
      method: "PUT",
      headers: { "x-request-id": "r2", "content-type": "application/json" },
      body: JSON.stringify({ monthlyExpenses: 1200 }),
    });
    expect(await PUT(request)).toBe(response);
    expect(controller.get).toHaveBeenCalledWith("r1");
    expect(controller.update).toHaveBeenCalledWith(
      { monthlyExpenses: 1200 },
      "r2",
    );
  });

  it("creates a request id when none is supplied", async () => {
    controller.get.mockResolvedValue(Response.json({}));

    await GET(new Request("http://test"));

    expect(controller.get).toHaveBeenCalledWith(expect.any(String));
  });

  it("keeps read errors client-safe and records unexpected errors", async () => {
    controller.get.mockRejectedValue(new Error("database secret"));

    const response = await GET(new Request("http://test"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível consultar a reserva.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "emergency_reserve_failed",
      expect.objectContaining({ operation: "read" }),
    );
  });

  it("returns expected save errors with their safe status and message", async () => {
    controller.update.mockRejectedValue(
      new ApplicationError("Dados inválidos.", 400),
    );
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Dados inválidos.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("hides unexpected save errors and malformed request bodies", async () => {
    controller.update.mockRejectedValue(new Error("database secret"));
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível salvar a reserva.",
    });

    const malformed = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(malformed.status).toBe(500);
    expect(controller.update).toHaveBeenCalledTimes(1);
  });
});
