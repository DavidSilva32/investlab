import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  importController: { preview: mocks.preview },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));
import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/imports/preview/route";
describe("preview route", () => {
  it("returns controller response", async () => {
    mocks.preview.mockResolvedValue(Response.json({ count: 1 }));
    expect(
      (
        await POST(
          new Request("http://test", {
            method: "POST",
            headers: { "x-request-id": "id" },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("maps expected and unexpected errors", async () => {
    mocks.preview
      .mockRejectedValueOnce(new ApplicationError("invalid", 422))
      .mockRejectedValueOnce(new Error("internal"));
    expect(
      (await POST(new Request("http://test", { method: "POST" }))).status,
    ).toBe(422);
    expect(
      (await POST(new Request("http://test", { method: "POST" }))).status,
    ).toBe(500);
  });
});
