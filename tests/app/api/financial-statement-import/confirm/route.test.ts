import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { controller, logger } = vi.hoisted(() => ({
  controller: { confirm: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/backend/controllers/financial-statement-import.controller", () => ({
  financialStatementImportController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-confirm",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/financial-statement-import/confirm/route";

describe("financial statement confirm route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates valid JSON and returns the controller response", async () => {
    const response = Response.json({ imported: 2 });
    controller.confirm.mockResolvedValue(response);
    const request = new Request(
      "http://localhost/api/financial-statement-import/confirm",
      {
        method: "POST",
        body: JSON.stringify({ rows: [] }),
        headers: { "content-type": "application/json" },
      },
    );

    await expect(POST(request)).resolves.toBe(response);
    expect(controller.confirm).toHaveBeenCalledWith(
      { rows: [] },
      "request-confirm",
    );
  });

  it("returns safe validation, malformed JSON and unexpected responses", async () => {
    controller.confirm.mockRejectedValueOnce(
      new ApplicationError("Revise as linhas.", 400),
    );
    const expected = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(expected.status).toBe(400);
    expect(expected.headers.get("x-request-id")).toBe("request-confirm");
    await expect(expected.json()).resolves.toEqual({
      message: "Revise as linhas.",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "financial_statement_confirm_failed",
      expect.objectContaining({ requestId: "request-confirm" }),
    );

    const malformed = await POST(
      new Request("http://localhost", { method: "POST", body: "{" }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      message: "Revise os lançamentos antes de confirmar.",
    });

    controller.confirm.mockRejectedValueOnce(
      new Error("private database details"),
    );
    const unexpected = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível concluir a importação.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "financial_statement_confirm_failed",
      expect.objectContaining({ requestId: "request-confirm" }),
    );
  });
});
