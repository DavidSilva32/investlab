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
