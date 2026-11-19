import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { controller, logger } = vi.hoisted(() => ({
  controller: { listProventos: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/backend/controllers/import.controller", () => ({
  importController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-proventos",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET } from "@/app/api/proventos/route";

describe("proventos route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates the query and returns the controller response", async () => {
    const response = Response.json({ received: [], upcoming: [] });
    controller.listProventos.mockResolvedValue(response);

    await expect(
      GET(new Request("http://localhost/api/proventos")),
    ).resolves.toBe(response);
    expect(controller.listProventos).toHaveBeenCalledWith("request-proventos");
  });

  it("keeps expected and unexpected errors client-safe", async () => {
    controller.listProventos.mockRejectedValueOnce(
      new ApplicationError("Sem acesso.", 403),
    );
    const expected = await GET(new Request("http://localhost/api/proventos"));
    expect(expected.status).toBe(403);
    expect(expected.headers.get("x-request-id")).toBe("request-proventos");
    await expect(expected.json()).resolves.toEqual({ message: "Sem acesso." });
    expect(logger.warn).toHaveBeenCalledWith(
      "b3_proventos_query_rejected",
      expect.objectContaining({ requestId: "request-proventos" }),
    );

    controller.listProventos.mockRejectedValueOnce(
      new Error("private database details"),
    );
    const unexpected = await GET(new Request("http://localhost/api/proventos"));
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível consultar os proventos.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "b3_proventos_query_failed",
      expect.objectContaining({ requestId: "request-proventos" }),
    );
  });
});
