import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  updateTargets: vi.fn(),
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/portfolio-allocation.controller", () => ({
  portfolioAllocationController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { GET, PATCH, PUT } from "@/app/api/portfolio/allocation/route";

describe("portfolio allocation route", () => {
  it("delegates GET, PATCH, and PUT with the request id", async () => {
    controller.get.mockResolvedValueOnce(Response.json({ positions: [] }));
    controller.update.mockResolvedValueOnce(Response.json({ message: "ok" }));
    controller.updateTargets.mockResolvedValueOnce(
      Response.json({ message: "ok" }),
    );
    const getRequest = new Request("http://test", {
      headers: { "x-request-id": "req-1" },
    });
    const patchRequest = new Request("http://test", { method: "PATCH" });
    const putRequest = new Request("http://test", { method: "PUT" });

    expect((await GET(getRequest)).status).toBe(200);
    expect((await PATCH(patchRequest)).status).toBe(200);
    expect((await PUT(putRequest)).status).toBe(200);
    expect(controller.get).toHaveBeenCalledWith("req-1");
    expect(controller.update).toHaveBeenCalledWith(
      patchRequest,
      expect.any(String),
    );
    expect(controller.updateTargets).toHaveBeenCalledWith(
      putRequest,
      expect.any(String),
    );
  });

  it("preserves expected application errors", async () => {
    controller.get.mockRejectedValueOnce(
      new ApplicationError("A posição não está mais na carteira atual.", 404),
    );
    const response = await GET(new Request("http://test"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      message: "A posição não está mais na carteira atual.",
    });
    expect(logger.warn).toHaveBeenCalled();
  });
  it("returns a safe fallback when an edit fails unexpectedly", async () => {
    controller.update.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const response = await PATCH(
      new Request("http://test", { method: "PATCH" }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: "Não foi possível salvar a classificação.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
  it("returns a safe fallback when saving allocation targets fails", async () => {
    controller.updateTargets.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const response = await PUT(new Request("http://test", { method: "PUT" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: "Não foi possível salvar as metas de alocação.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_allocation_targets_update_failed",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
  it("returns a safe fallback for unexpected errors", async () => {
    controller.get.mockRejectedValueOnce(new Error("private database detail"));
    const response = await GET(new Request("http://test"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: "Não foi possível carregar a alocação.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
