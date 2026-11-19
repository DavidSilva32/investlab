import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { controller, logger } = vi.hoisted(() => ({
  controller: { preview: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/backend/controllers/financial-statement-import.controller", () => ({
  financialStatementImportController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-preview",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/financial-statement-import/preview/route";

describe("financial statement preview route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates the request and returns its preview response", async () => {
    const response = Response.json({ rows: [{ description: "Mercado" }] });
    controller.preview.mockResolvedValue(response);
    const request = new Request(
      "http://localhost/api/financial-statement-import/preview",
      {
        method: "POST",
      },
    );

    await expect(POST(request)).resolves.toBe(response);
    expect(controller.preview).toHaveBeenCalledWith(request, "request-preview");
  });

  it("returns client-safe expected and unexpected failures and logs each", async () => {
    controller.preview.mockRejectedValueOnce(
      new ApplicationError("Selecione um arquivo.", 400),
    );
    const expected = await POST(
      new Request("http://localhost/api/financial-statement-import/preview", {
        method: "POST",
      }),
    );
    expect(expected.status).toBe(400);
    expect(expected.headers.get("x-request-id")).toBe("request-preview");
    await expect(expected.json()).resolves.toEqual({
      message: "Selecione um arquivo.",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "financial_statement_preview_failed",
      expect.objectContaining({ requestId: "request-preview" }),
    );

    controller.preview.mockRejectedValueOnce(
      new Error("private database details"),
    );
    const unexpected = await POST(
      new Request("http://localhost/api/financial-statement-import/preview", {
        method: "POST",
      }),
    );
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível ler o extrato.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "financial_statement_preview_failed",
      expect.objectContaining({ requestId: "request-preview" }),
    );
  });
});
