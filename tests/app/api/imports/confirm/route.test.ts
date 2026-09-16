import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/controllers/import.controller", () => ({
  confirmImportController: mocks.confirm,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));
import { ApplicationError } from "@/backend/errors/application-error";
import { POST } from "@/app/api/imports/confirm/route";
describe("confirm route", () => {
  it("maps success and errors", async () => {
    mocks.confirm
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockRejectedValueOnce(new ApplicationError("duplicate", 409))
      .mockRejectedValueOnce(new Error("internal"));
    expect(
      (await POST(new Request("http://test", { method: "POST" }))).status,
    ).toBe(201);
    expect(
      (await POST(new Request("http://test", { method: "POST" }))).status,
    ).toBe(409);
    expect(
      (await POST(new Request("http://test", { method: "POST" }))).status,
    ).toBe(500);
  });
});
