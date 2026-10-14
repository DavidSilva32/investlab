import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ updatePositions: vi.fn() }));
const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("@/backend/controllers/emergency-reserve.controller", () => ({
  emergencyReserveController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { PUT } from "@/app/api/emergency-reserve/positions/route";

describe("emergency reserve positions route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates position assignments without configuration fields", async () => {
    const response = Response.json({ selectedAssetKeys: [] });
    controller.updatePositions.mockResolvedValue(response);
    const body = { selectedAssetKeys: ["v1:key"] };

    await expect(
      PUT(
        new Request("http://test", {
          method: "PUT",
          headers: {
            "x-request-id": "positions-1",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
    ).resolves.toBe(response);
    expect(controller.updatePositions).toHaveBeenCalledWith(
      body,
      "positions-1",
    );
  });

  it("returns expected assignment errors safely", async () => {
    controller.updatePositions.mockRejectedValue(
      new ApplicationError("Revise as posições selecionadas.", 400),
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
      message: "Revise as posições selecionadas.",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "emergency_reserve_positions_failed",
      expect.any(Object),
    );
  });

  it("hides unexpected assignment errors", async () => {
    controller.updatePositions.mockRejectedValue(new Error("database secret"));
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível salvar as posições da Reserva.",
    });
  });
});
