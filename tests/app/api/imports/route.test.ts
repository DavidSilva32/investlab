import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  importController: { clear: mocks.clear },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { DELETE } from "@/app/api/imports/route";

describe("imports deletion route", () => {
  it("clears the requested document type", async () => {
    mocks.clear.mockResolvedValue(
      new Response(JSON.stringify({ deletedImports: 1 })),
    );
    const response = await DELETE(
      new Request("http://test/api/imports?documentType=B3_POSITION_XLSX", {
        method: "DELETE",
      }),
    );
    await expect(response.json()).resolves.toEqual({ deletedImports: 1 });
    expect(mocks.clear).toHaveBeenCalledWith(
      "B3_POSITION_XLSX",
      expect.any(String),
    );
  });

  it("maps expected and unexpected failures", async () => {
    mocks.clear
      .mockRejectedValueOnce(new ApplicationError("invalid", 400))
      .mockRejectedValueOnce(new Error("db"));
    expect(
      (
        await DELETE(
          new Request("http://test/api/imports", { method: "DELETE" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await DELETE(
          new Request("http://test/api/imports", { method: "DELETE" }),
        )
      ).status,
    ).toBe(500);
  });
});
