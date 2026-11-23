import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { controller, logger } = vi.hoisted(() => ({
  controller: { createEntryRelation: vi.fn() },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/backend/controllers/financial.controller", () => ({
  financialController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-relation",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/financial-entry-relations/route";

describe("financial entry relation route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates valid JSON to the controller", async () => {
    const response = Response.json({ id: "relation-id" }, { status: 201 });
    controller.createEntryRelation.mockResolvedValue(response);

    await expect(
      POST(
        new Request("http://localhost/api/financial-entry-relations", {
          method: "POST",
          body: JSON.stringify({
            kind: "REVERSAL",
            entryId: "credit",
            relatedEntryId: "expense",
          }),
        }),
      ),
    ).resolves.toBe(response);
    expect(controller.createEntryRelation).toHaveBeenCalledWith(
      { kind: "REVERSAL", entryId: "credit", relatedEntryId: "expense" },
      "request-relation",
    );
  });

  it("returns client-safe validation and generic failure messages", async () => {
    controller.createEntryRelation.mockRejectedValueOnce(
      new ApplicationError("Revise a relação.", 400),
    );
    const expected = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toEqual({
      message: "Revise a relação.",
    });

    controller.createEntryRelation.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const unexpected = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível relacionar os lançamentos.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "financial_entry_relation_failed",
      expect.objectContaining({ requestId: "request-relation" }),
    );
  });

  it("returns a validation response when the request body is not JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/financial-entry-relations", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Revise a relação entre os lançamentos.",
    });
    expect(controller.createEntryRelation).not.toHaveBeenCalled();
  });
});
