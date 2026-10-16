vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controller: { list: vi.fn(), create: vi.fn(), reconcile: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/portfolio-operation.controller", () => ({
  portfolioOperationController: mocks.controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-1",
  withApiRequestLogging: (
    _method: string,
    _path: string,
    handler: (request: Request) => unknown,
  ) => handler,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { GET, POST } from "@/app/api/portfolio/operations/route";
import { POST as reconcile } from "@/app/api/portfolio/operations/reconcile/route";

const request = (method: string) =>
  new Request("http://localhost/api/portfolio/operations", { method });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("portfolio operations routes", () => {
  it("delegates successful list and create calls", async () => {
    mocks.controller.list.mockResolvedValue(Response.json({ operations: [] }));
    mocks.controller.create.mockResolvedValue(
      Response.json({ id: "op-1" }, { status: 201 }),
    );
    expect((await GET(request("GET"))).status).toBe(200);
    expect((await POST(request("POST"))).status).toBe(201);
    expect(mocks.controller.list).toHaveBeenCalledWith("request-1");
    expect(mocks.controller.create).toHaveBeenCalledWith(
      expect.any(Request),
      "request-1",
    );
  });

  it.each([GET, POST])(
    "returns expected and generic errors safely",
    async (handler) => {
      mocks.controller[
        handler === GET ? "list" : "create"
      ].mockRejectedValueOnce(new ApplicationError("Revise os dados.", 400));
      const expected = await handler(request(handler === GET ? "GET" : "POST"));
      expect(expected.status).toBe(400);
      expect(await expected.json()).toEqual({ message: "Revise os dados." });
      mocks.controller[
        handler === GET ? "list" : "create"
      ].mockRejectedValueOnce(new Error("internal secret"));
      const unexpected = await handler(
        request(handler === GET ? "GET" : "POST"),
      );
      expect(unexpected.status).toBe(500);
      const unexpectedBody = await unexpected.json();
      expect(unexpectedBody).toMatchObject({
        message: expect.stringContaining("Não foi possível"),
      });
      expect(JSON.stringify(unexpectedBody)).not.toContain("internal secret");
    },
  );

  it("returns a safe reconciliation failure response", async () => {
    mocks.controller.reconcile.mockRejectedValueOnce(
      new ApplicationError("Vínculo inválido.", 409),
    );
    const expected = await reconcile(request("POST"));
    expect(expected.status).toBe(409);
    expect(await expected.json()).toEqual({ message: "Vínculo inválido." });
    mocks.controller.reconcile.mockRejectedValueOnce(
      new Error("internal secret"),
    );
    const unexpected = await reconcile(request("POST"));
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      message: "Não foi possível atualizar a conciliação.",
    });
  });

  it("returns an idempotency payload conflict as a client-safe response", async () => {
    mocks.controller.create.mockRejectedValueOnce(
      new ApplicationError(
        "Esta chave já foi usada para outra operação. Revise os dados e tente novamente.",
        409,
      ),
    );
    const response = await POST(request("POST"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message:
        "Esta chave já foi usada para outra operação. Revise os dados e tente novamente.",
    });
  });
});
