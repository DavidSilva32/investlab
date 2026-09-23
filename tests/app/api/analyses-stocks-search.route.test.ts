import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const service = vi.hoisted(() => ({
  searchTickers: vi.fn(),
  getByTicker: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { GET } from "@/app/api/analyses/stocks/search/route";
import { stockAnalysisController } from "@/backend/controllers/stock-analysis.controller";

describe("stock ticker search route and controller", () => {
  it("forwards the query and request ID and returns dynamic ticker matches", async () => {
    service.searchTickers.mockResolvedValue([
      { ticker: "VALE3", name: "Vale S.A." },
    ]);
    const response = await GET(
      new Request("http://test/api/analyses/stocks/search?q=Vale", {
        headers: { "x-request-id": "request-1" },
      }),
    );
    expect(service.searchTickers).toHaveBeenCalledWith("Vale", "request-1");
    await expect(response.json()).resolves.toEqual({
      results: [{ ticker: "VALE3", name: "Vale S.A." }],
      requestId: "request-1",
    });
    expect(logger.info).toHaveBeenCalledWith("stock_ticker_search_responded", {
      requestId: "request-1",
      results: 1,
    });
  });

  it("uses a generated request ID and forwards an empty query when q is absent", async () => {
    service.searchTickers.mockResolvedValue([]);
    const response = await GET(
      new Request("http://test/api/analyses/stocks/search"),
    );
    expect(service.searchTickers).toHaveBeenCalledWith("", expect.any(String));
    await expect(response.json()).resolves.toMatchObject({
      requestId: expect.any(String),
      results: [],
    });
  });

  it("covers the analysis controller response adapter", async () => {
    service.getByTicker.mockResolvedValue({
      ticker: "VALE3",
      fundamentals: [],
    });
    const response = await stockAnalysisController.get("VALE3", "request-2");
    await expect(response.json()).resolves.toEqual({
      ticker: "VALE3",
      fundamentals: [],
    });
    expect(logger.info).toHaveBeenCalledWith("stock_analysis_requested", {
      requestId: "request-2",
      ticker: "VALE3",
    });
    expect(logger.info).toHaveBeenCalledWith("stock_analysis_responded", {
      requestId: "request-2",
      ticker: "VALE3",
      fundamentals: 0,
    });
  });

  it("preserves application status and Retry-After for provider rate limits", async () => {
    service.searchTickers.mockRejectedValue(
      new ApplicationError("Tente novamente mais tarde.", 429, 30),
    );
    const response = await GET(
      new Request("http://test/api/analyses/stocks/search?q=Vale"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      message: "Tente novamente mais tarde.",
    });
  });

  it("handles application errors without retry headers", async () => {
    service.searchTickers.mockRejectedValue(
      new ApplicationError("Busca inválida.", 400),
    );
    const response = await GET(
      new Request("http://test/api/analyses/stocks/search?q=Vale"),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("uses the generic client-safe response for unexpected failures", async () => {
    service.searchTickers.mockRejectedValue(
      new Error("secret internal detail"),
    );
    const response = await GET(
      new Request("http://test/api/analyses/stocks/search?q=Vale"),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível pesquisar ações agora.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "stock_ticker_search_failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
