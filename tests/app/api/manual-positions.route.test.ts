import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("@/backend/controllers/manual-portfolio-position.controller", () => ({
  manualPortfolioPositionController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { DELETE, GET, PATCH, POST } from "@/app/api/positions/manual/route";
import { ApplicationError } from "@/backend/errors/application-error";

const request = (method: string, withId = true) =>
  new Request("http://localhost/api/positions/manual", {
    method,
    headers: withId ? { "x-request-id": "request-1" } : undefined,
    body: method === "GET" ? undefined : "{}",
  });

describe("manual positions route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates all supported methods to the controller", async () => {
    controller.list.mockResolvedValue(Response.json({ positions: [] }));
    controller.create.mockResolvedValue(
      Response.json({ position: { id: "new" } }, { status: 201 }),
    );
    controller.update.mockResolvedValue(
      Response.json({ position: { id: "edit" } }),
    );
    controller.delete.mockResolvedValue(Response.json({ id: "delete" }));

    const listed = await GET(request("GET", false));
    const created = await POST(request("POST", false));
    const updated = await PATCH(request("PATCH", false));
    const removed = await DELETE(request("DELETE", false));

    expect(listed.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(removed.status).toBe(200);
    expect(controller.list).toHaveBeenCalledWith(expect.stringMatching(/.+/));
    expect(controller.create).toHaveBeenCalledWith(
      expect.any(Request),
      expect.stringMatching(/.+/),
    );
    expect(controller.update).toHaveBeenCalledWith(
      expect.any(Request),
      expect.stringMatching(/.+/),
    );
    expect(controller.delete).toHaveBeenCalledWith(
      expect.any(Request),
      expect.stringMatching(/.+/),
    );
  });

  it("returns client-safe messages for expected errors and generic failures", async () => {
    controller.list.mockRejectedValueOnce(
      new ApplicationError("Entrada inválida.", 422),
    );
    controller.create.mockRejectedValueOnce(
      new Error("sensitive internal detail"),
    );
    controller.update.mockRejectedValueOnce(new Error("internal"));
    controller.delete.mockRejectedValueOnce(
      new ApplicationError("Posição não encontrada.", 404),
    );

    const listResponse = await GET(request("GET"));
    const createResponse = await POST(request("POST"));
    const updateResponse = await PATCH(request("PATCH", false));
    const deleteResponse = await DELETE(request("DELETE"));

    expect(listResponse.status).toBe(422);
    expect(await listResponse.json()).toEqual({ message: "Entrada inválida." });
    expect(createResponse.status).toBe(500);
    expect(await createResponse.json()).toEqual({
      message: "Não foi possível salvar a posição manual.",
    });
    expect(updateResponse.status).toBe(500);
    expect(await updateResponse.json()).toEqual({
      message: "Não foi possível atualizar a posição manual.",
    });
    expect(deleteResponse.status).toBe(404);
    expect(await deleteResponse.json()).toEqual({
      message: "Posição não encontrada.",
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("preserves a caller request ID in error responses", async () => {
    controller.list.mockRejectedValueOnce(new Error("failure"));
    const response = await GET(request("GET"));
    expect(response.headers.get("x-request-id")).toBe("request-1");
  });
});
