import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/investor-context.controller", () => ({
  investorContextController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET, PUT } from "@/app/api/investor-context/route";

describe("investor context route", () => {
  it("delegates GET and PUT and returns request identifiers", async () => {
    controller.get.mockResolvedValueOnce({
      context: { objective: null, targetMonth: null, updatedAt: null },
    });
    controller.update.mockResolvedValueOnce({
      message: "Objetivo e prazo salvos.",
      context: {
        objective: "Comprar uma casa",
        targetMonth: "2030-04",
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    });
    const getResponse = await GET(
      new Request("http://test", { headers: { "x-request-id": "req-read" } }),
    );
    const putResponse = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objective: "Comprar uma casa",
          targetMonth: "2030-04",
        }),
      }),
    );

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("cache-control")).toBe("no-store");
    expect(getResponse.headers.get("x-request-id")).toBe("req-read");
    expect(putResponse.status).toBe(200);
    expect(putResponse.headers.get("x-request-id")).toMatch(/.+/);
    expect(controller.get).toHaveBeenCalledWith("req-read");
    expect(controller.update).toHaveBeenCalledWith(
      { objective: "Comprar uma casa", targetMonth: "2030-04" },
      expect.any(String),
    );
  });

  it("returns a client-safe error for malformed JSON", async () => {
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "O corpo da solicitação é inválido.",
    });
    expect(controller.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "investor_context_failed",
      expect.objectContaining({ operation: "save" }),
    );
  });

  it("preserves expected application errors", async () => {
    controller.get.mockRejectedValueOnce(
      new ApplicationError("Contexto indisponível.", 503),
    );
    const response = await GET(new Request("http://test"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "Contexto indisponível.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs unknown thrown values without exposing them", async () => {
    controller.get.mockRejectedValueOnce("private unexpected value");
    const response = await GET(new Request("http://test"));
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      "investor_context_failed",
      expect.objectContaining({ errorType: "unknown" }),
    );
  });

  it("returns a generic safe message for unexpected read and save errors", async () => {
    controller.get.mockRejectedValueOnce(new Error("private database detail"));
    const readResponse = await GET(new Request("http://test"));
    expect(readResponse.status).toBe(500);
    expect(await readResponse.json()).toEqual({
      message: "Não foi possível consultar seu contexto.",
    });

    controller.update.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const saveResponse = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: null, targetMonth: null }),
      }),
    );
    expect(saveResponse.status).toBe(500);
    expect(await saveResponse.json()).toEqual({
      message: "Não foi possível salvar seu contexto.",
    });
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "investor_context_failed",
      expect.objectContaining({
        operation: "save",
        errorType: "Error",
      }),
    );
  });
});
