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
});
