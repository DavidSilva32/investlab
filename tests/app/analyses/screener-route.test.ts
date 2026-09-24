import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({ search: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener.controller", () => ({
  screenerController: { search: mocks.search },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));

import { GET } from "@/app/api/screener/route";

describe("GET /api/screener", () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.error.mockReset();
  });

  it("delegates local filters and preserves the request id", async () => {
    const response = Response.json({ results: [] });
    mocks.search.mockResolvedValue(response);
    await expect(
      GET(
        new Request("http://localhost/api/screener?maximumPe=15", {
          headers: { "x-request-id": "req-screener" },
        }),
      ),
    ).resolves.toBe(response);
    expect(mocks.search).toHaveBeenCalledWith(
      new URLSearchParams("maximumPe=15"),
      "req-screener",
    );
  });

  it("returns client-safe application errors and logs only the error type", async () => {
    mocks.search.mockRejectedValue(
      new ApplicationError("Filtros inválidos.", 400),
    );
    const response = await GET(
      new Request("http://localhost/api/screener", {
        headers: { "x-request-id": "req-invalid" },
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Filtros inválidos.",
      requestId: "req-invalid",
    });
    expect(mocks.error).toHaveBeenCalledWith("screener_query_failed", {
      requestId: "req-invalid",
      errorType: "Error",
    });
  });

  it.each([new Error("private internal detail"), "private detail"] as const)(
    "hides unexpected error details from the client",
    async (failure) => {
      mocks.search.mockRejectedValue(failure);
      const response = await GET(new Request("http://localhost/api/screener"));
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body.message).toBe(
        "Não foi possível consultar as empresas agora.",
      );
      expect(body.message).not.toContain("private");
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    },
  );
});
