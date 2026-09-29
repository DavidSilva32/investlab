import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ calculate: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/stock-valuation.controller", () => ({
  stockValuationController: { calculate: mocks.calculate },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));

import { POST } from "@/app/api/analyses/stocks/[ticker]/valuation/route";

describe("stock valuation route", () => {
  beforeEach(() => {
    mocks.calculate.mockReset();
    mocks.error.mockReset();
  });

  it("passes ticker, JSON payload, and request ID to the controller", async () => {
    mocks.calculate.mockResolvedValue(Response.json({ status: "unavailable" }));
    const request = new Request(
      "http://localhost/api/analyses/stocks/TEST3/valuation",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-8",
        },
        body: JSON.stringify({ forecastYears: null }),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ ticker: "TEST3" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.calculate).toHaveBeenCalledWith(
      "TEST3",
      { forecastYears: null },
      "request-8",
    );
  });

  it("rejects malformed JSON with a client error", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyses/stocks/TEST3/valuation", {
        method: "POST",
        body: "not-json",
      }),
      { params: Promise.resolve({ ticker: "TEST3" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Envie um corpo JSON válido.",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("returns a generic client-safe error when calculation fails", async () => {
    mocks.calculate.mockRejectedValue(new Error("internal"));
    const response = await POST(
      new Request("http://localhost/api/analyses/stocks/TEST3/valuation", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ ticker: "TEST3" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Não foi possível calcular a avaliação agora.",
    });
    expect(mocks.error).toHaveBeenCalled();
  });
});
