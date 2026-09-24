import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ get: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/backend/controllers/stock-analysis.controller", () => ({
  stockAnalysisController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET } from "@/app/api/analyses/stocks/[ticker]/route";

describe("stock analysis route", () => {
  it("returns a client-safe BRAPI rate-limit response", async () => {
    controller.get.mockRejectedValue(
      new ApplicationError(
        "Consulta de mercado temporariamente indisponível. Tente novamente em instantes.",
        429,
        60,
      ),
    );

    const response = await GET(
      new Request("http://test", { headers: { "x-request-id": "request-1" } }),
      { params: Promise.resolve({ ticker: "PETR4" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("x-request-id")).toBe("request-1");
    await expect(response.json()).resolves.toEqual({
      message:
        "Consulta de mercado temporariamente indisponível. Tente novamente em instantes.",
    });
  });
});

it("returns generic errors without exposing internals or requiring a supplied request id", async () => {
  controller.get.mockRejectedValue(new Error("provider secret"));

  const response = await GET(new Request("http://test"), {
    params: Promise.resolve({ ticker: "PETR4" }),
  });

  expect(response.status).toBe(502);
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(response.json()).resolves.toEqual({
    message: "Não foi possível consultar a análise agora.",
  });
  expect(logger.error).toHaveBeenCalledWith(
    "stock_analysis_failed",
    expect.objectContaining({ ticker: "PETR4", error: expect.any(Error) }),
  );
});

it("returns application errors without a retry delay", async () => {
  controller.get.mockRejectedValue(
    new ApplicationError("Ticker inválido.", 400),
  );

  const response = await GET(new Request("http://test"), {
    params: Promise.resolve({ ticker: "?" }),
  });

  expect(response.status).toBe(400);
  expect(response.headers.get("retry-after")).toBeNull();
  await expect(response.json()).resolves.toEqual({
    message: "Ticker inválido.",
  });
});
