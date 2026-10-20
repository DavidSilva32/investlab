import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  getRefreshStatus: vi.fn(),
  requestFundamentalsRefresh: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/backend/services/stock-comparison.service", () => ({
  stockComparisonService: {
    compare: mocks.compare,
    getRefreshStatus: mocks.getRefreshStatus,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));
vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: {
    requestFundamentalsRefresh: mocks.requestFundamentalsRefresh,
  },
}));

import { StockComparisonController } from "@/backend/controllers/stock-comparison.controller";

describe("StockComparisonController", () => {
  beforeEach(() => {
    mocks.compare.mockReset();
    mocks.getRefreshStatus.mockReset();
    mocks.requestFundamentalsRefresh.mockReset();
    mocks.info.mockReset();
    mocks.error.mockReset();
  });

  it("returns only refresh statuses with private no-store headers", async () => {
    const status = {
      companies: [
        {
          ticker: "PETR3",
          fundamentalsRefresh: {
            status: "running",
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    };
    mocks.getRefreshStatus.mockResolvedValue(status);

    const response = await new StockComparisonController().getRefreshStatus(
      { tickers: ["PETR3", "VALE3"] },
      "request-status",
    );

    expect(mocks.getRefreshStatus).toHaveBeenCalledWith(
      { tickers: ["PETR3", "VALE3"] },
      "request-status",
    );
    expect(response.headers.get("x-request-id")).toBe("request-status");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(status);
  });

  it("forwards the request and responds with its request ID", async () => {
    const result = {
      sector: "Bancos",
      companies: [
        {
          ticker: "ITUB4",
          fundamentals: {
            roe: {
              value: 12,
              sourceSummary: "CVM ITR",
              comparisonStatus: "not_comparable",
              comparisonReason: "O peer não tem demonstrativo validado.",
            },
          },
        },
      ],
    };
    mocks.compare.mockResolvedValue(result);
    const controller = new StockComparisonController();

    const response = await controller.compare(
      { tickers: ["ITUB4", "SANB11"] },
      "request-114",
    );

    expect(mocks.compare).toHaveBeenCalledWith(
      { tickers: ["ITUB4", "SANB11"] },
      "request-114",
    );
    expect(response.headers.get("x-request-id")).toBe("request-114");
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.info).toHaveBeenCalledWith("stock_comparison_completed", {
      requestId: "request-114",
      issuerCount: 1,
      sector: "Bancos",
    });
  });

  it("returns running for cold companies and schedules idempotent refresh work", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    mocks.compare.mockResolvedValue({
      sector: "Bancos",
      companies: [
        {
          ticker: "ITUB4",
          cnpj: "60701190000104",
          fundamentalsRefresh: {
            status: "idle",
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    });
    mocks.requestFundamentalsRefresh.mockResolvedValue({
      state: { status: "running", retryAfter: null, errorCode: null },
      run,
    });
    let scheduled: (() => Promise<void>) | undefined;
    const scheduleAfterResponse = (work: () => Promise<void>) => {
      scheduled = work;
    };
    const response = await new StockComparisonController().compare(
      { tickers: ["ITUB4"] },
      "request-115",
      scheduleAfterResponse,
    );

    expect(mocks.requestFundamentalsRefresh).toHaveBeenCalledWith(
      "ITUB4",
      "60701190000104",
      "request-115",
    );
    expect(run).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      companies: [{ fundamentalsRefresh: { status: "running" } }],
    });
    await scheduled?.();

    expect(run).toHaveBeenCalledOnce();
  });

  it("returns the current state when another request already owns the refresh", async () => {
    mocks.compare.mockResolvedValue({
      sector: "Bancos",
      companies: [
        {
          ticker: "ITUB4",
          cnpj: "60701190000104",
          fundamentalsRefresh: {
            status: "idle",
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    });
    mocks.requestFundamentalsRefresh.mockResolvedValue({
      state: { status: "running", retryAfter: null, errorCode: null },
      run: null,
    });
    const scheduleAfterResponse = vi.fn();

    const response = await new StockComparisonController().compare(
      { tickers: ["ITUB4"] },
      "request-118",
      scheduleAfterResponse,
    );

    await expect(response.json()).resolves.toMatchObject({
      companies: [{ fundamentalsRefresh: { status: "running" } }],
    });
    expect(scheduleAfterResponse).not.toHaveBeenCalled();
  });

  it("skips active company refreshes and contains background errors", async () => {
    mocks.compare.mockResolvedValue({
      sector: "Bancos",
      companies: [
        {
          ticker: "ITUB4",
          cnpj: "60701190000104",
          fundamentalsRefresh: {
            status: "running",
            retryAfter: null,
            errorCode: null,
          },
        },
        {
          ticker: "SANB11",
          cnpj: "90400888000142",
          fundamentalsRefresh: {
            status: "idle",
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    });
    mocks.requestFundamentalsRefresh.mockRejectedValue("offline");
    let scheduled: (() => Promise<void>) | undefined;
    const scheduleAfterResponse = (work: () => Promise<void>) => {
      scheduled = work;
    };

    await new StockComparisonController().compare(
      { tickers: ["ITUB4", "SANB11"] },
      "request-116",
      scheduleAfterResponse,
    );
    await scheduled?.();

    expect(mocks.requestFundamentalsRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.requestFundamentalsRefresh).toHaveBeenCalledWith(
      "SANB11",
      "90400888000142",
      "request-116",
    );
    expect(mocks.error).toHaveBeenCalledWith(
      "stock_comparison_fundamentals_refresh_failed",
      expect.objectContaining({ ticker: "SANB11", errorType: "string" }),
    );
  });

  it("records Error names for background refresh failures", async () => {
    mocks.compare.mockResolvedValue({
      sector: "Bancos",
      companies: [
        {
          ticker: "ITUB4",
          cnpj: "60701190000104",
          fundamentalsRefresh: {
            status: "idle",
            retryAfter: null,
            errorCode: null,
          },
        },
      ],
    });
    mocks.requestFundamentalsRefresh.mockRejectedValue(new Error("offline"));
    let scheduled: (() => Promise<void>) | undefined;

    await new StockComparisonController().compare(
      { tickers: ["ITUB4"] },
      "request-117",
      (work) => {
        scheduled = work;
      },
    );
    await scheduled?.();

    expect(mocks.error).toHaveBeenCalledWith(
      "stock_comparison_fundamentals_refresh_failed",
      expect.objectContaining({ ticker: "ITUB4", errorType: "Error" }),
    );
  });
});
