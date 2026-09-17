import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  importController: { delete: mocks.delete },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { DELETE } from "@/app/api/imports/route";
import { ApplicationError } from "@/backend/errors/application-error";

describe("imports deletion route", () => {
  it("delegates the requested document type", async () => {
    mocks.delete.mockResolvedValue(
      new Response(JSON.stringify({ deletedImports: 1 })),
    );
    const response = await DELETE(
      new Request("http://test/api/imports?documentType=B3_POSITION_XLSX", {
        method: "DELETE",
      }),
    );
    await expect(response.json()).resolves.toEqual({ deletedImports: 1 });
    expect(mocks.delete).toHaveBeenCalledWith(
      "B3_POSITION_XLSX",
      expect.any(String),
    );
  });

  it("returns expected and unexpected deletion errors", async () => {
    mocks.delete.mockRejectedValueOnce(
      new ApplicationError("Tipo inválido.", 400),
    );
    const rejected = await DELETE(
      new Request("http://test/api/imports?documentType=x", {
        method: "DELETE",
        headers: { "x-request-id": "request-1" },
      }),
    );
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({
      message: "Tipo inválido.",
    });
    expect(mocks.logger.warn).toHaveBeenCalled();
    mocks.delete.mockRejectedValueOnce(new Error("secret"));
    const failed = await DELETE(
      new Request("http://test/api/imports?documentType=x", {
        method: "DELETE",
      }),
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      message: "Não foi possível excluir os dados.",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
