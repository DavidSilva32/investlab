import { beforeEach, describe, expect, it, vi } from "vitest";
const controller = vi.hoisted(() => ({ list: vi.fn(), reverse: vi.fn() }));
const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_c: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/backend/controllers/position-reconciliation.controller", () => ({
  positionReconciliationController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { GET, PATCH } from "@/app/api/positions/reconciliation/route";
import { ApplicationError } from "@/backend/errors/application-error";
beforeEach(() => vi.clearAllMocks());
describe("reconciliation route", () => {
  it("lists and reverses through logged controllers", async () => {
    controller.list.mockResolvedValue(Response.json({ links: [] }));
    controller.reverse.mockResolvedValue(Response.json({ message: "done" }));
    expect((await GET(new Request("http://test"))).status).toBe(200);
    expect(
      (await PATCH(new Request("http://test", { method: "PATCH" }))).status,
    ).toBe(200);
    expect(controller.list).toHaveBeenCalledWith(expect.any(String));
  });
  it("preserves expected error status and protects internal errors", async () => {
    controller.list.mockRejectedValue(
      new ApplicationError("Atualize a prévia.", 409),
    );
    const expected = await GET(new Request("http://test"));
    expect(expected.status).toBe(409);
    expect(await expected.json()).toEqual({ message: "Atualize a prévia." });
    controller.reverse.mockRejectedValue(new Error("database secret"));
    const failure = await PATCH(
      new Request("http://test", { method: "PATCH" }),
    );
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({
      message: "Não foi possível consultar ou atualizar a conciliação.",
    });
  });
});
