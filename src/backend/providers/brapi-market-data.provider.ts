import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
import type {
  MarketData,
  MarketHistoryFailure,
  MarketHistoryResult,
  MarketDataProvider,
  MarketQuote,
  MarketTicker,
} from "./market-data.provider";

function parseRetryAfterSeconds(retryAfter: string | null) {
  if (!retryAfter) return undefined;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return undefined;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

const quoteSchema = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        data: z.object({
          longName: z.string().nullable().optional(),
          shortName: z.string().nullable().optional(),
          regularMarketPrice: z.number().nullable().optional(),
          marketCap: z.number().nullable().optional(),
          regularMarketChangePercent: z.number().nullable().optional(),
          regularMarketTime: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});
const tickerSearchSchema = z.object({
  results: z.array(
    z.object({
      symbol: z.string(),
      name: z.string(),
      isActive: z.boolean().optional(),
    }),
  ),
});
const profileSchema = z
  .object({
    results: z
      .array(
        z.object({
          data: z.object({ cnpj: z.string().nullable().optional() }).loose(),
        }),
      )
      .optional(),
  })
  .loose();
const historySchema = z
  .object({
    results: z.array(
      z.object({
        symbol: z.string().optional(),
        data: z.object({
          historicalDataPrice: z.array(
            z.object({
              date: z.number(),
              close: z.number().nullable().optional(),
            }),
          ),
        }),
      }),
    ),
  })
  .loose();

class RetryableMarketDataError extends Error {
  constructor(
    message: string,
    readonly reason: "timeout" | "provider_error",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
class MarketDataHttpError extends Error {
  constructor(readonly status: number) {
    super(`BRAPI request failed: ${status}`);
  }
}
class InvalidMarketDataResponseError extends Error {}
const requestTimeoutMs = 15_000;

export class BrapiMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiToken = process.env.BRAPI_TOKEN,
  ) {}

  private async request(
    path: string,
    signal?: AbortSignal,
    cacheMode: "cache" | "no-store" = "cache",
  ) {
    const startedAt = Date.now();
    const operation = new URL(path, "https://brapi.dev").pathname
      .split("/")
      .at(-1);
    const ticker = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get(
      "symbols",
    );
    const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    const logContext = {
      provider: "brapi",
      operation,
      ticker,
      cacheMode,
      ...(query.has("range") ? { range: query.get("range") } : {}),
    };
    let response: Response;
    try {
      response = await this.fetcher(`https://brapi.dev${path}`, {
        headers: this.apiToken
          ? { Authorization: `Bearer ${this.apiToken}` }
          : undefined,
        cache: cacheMode === "cache" ? "force-cache" : "no-store",
        ...(signal ? { signal } : {}),
        ...(cacheMode === "cache" ? { next: { revalidate: 300 } } : {}),
      });
    } catch (error) {
      logger.warn("stock_market_provider_request_failed", {
        ...logContext,
        durationMs: Date.now() - startedAt,
      });
      throw new RetryableMarketDataError(
        "BRAPI request failed",
        signal?.reason instanceof Error && signal.reason.name === "TimeoutError"
          ? "timeout"
          : "provider_error",
        { cause: error },
      );
    }
    if (response.status === 429) {
      logger.info("stock_market_provider_request_completed", {
        ...logContext,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new ApplicationError(
        "Consulta de mercado temporariamente indisponível. Tente novamente em instantes.",
        429,
        parseRetryAfterSeconds(response.headers.get("retry-after")),
      );
    }
    if (!response.ok && (response.status === 408 || response.status >= 500)) {
      logger.info("stock_market_provider_request_completed", {
        ...logContext,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new RetryableMarketDataError(
        `BRAPI request failed: ${response.status}`,
        response.status === 408 ? "timeout" : "provider_error",
      );
    }
    if (!response.ok) {
      logger.info("stock_market_provider_request_completed", {
        ...logContext,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new MarketDataHttpError(response.status);
    }
    try {
      const payload = await response.json();
      logger.info("stock_market_provider_request_completed", {
        ...logContext,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return payload;
    } catch (error) {
      logger.warn("stock_market_provider_response_invalid", {
        ...logContext,
        durationMs: Date.now() - startedAt,
      });
      if (signal?.aborted)
        throw new RetryableMarketDataError(
          "BRAPI request timed out",
          "timeout",
          {
            cause: error,
          },
        );
      throw new InvalidMarketDataResponseError("BRAPI returned invalid JSON", {
        cause: error,
      });
    }
  }

  private async getHistoricalPrices(
    symbol: string,
    parentSignal: AbortSignal,
    cacheMode: "cache" | "no-store" = "cache",
  ) {
    const signal = () =>
      AbortSignal.any([parentSignal, AbortSignal.timeout(requestTimeoutMs)]);
    try {
      return await this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=5y&interval=1d`,
        signal(),
        cacheMode,
      );
    } catch (error) {
      if (!(error instanceof RetryableMarketDataError) || parentSignal.aborted)
        throw error;

      logger.warn("stock_market_history_range_fallback", {
        provider: "brapi",
        ticker: decodeURIComponent(symbol),
        fromRange: "5y",
        toRange: "1y",
        reason: error.reason,
      });

      return this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=1y&interval=1d`,
        signal(),
        cacheMode,
      );
    }
  }

  private normalizeHistory(
    ticker: string,
    payload: unknown,
  ): MarketHistoryResult {
    const parsed = historySchema.safeParse(payload);
    if (!parsed.success)
      return {
        ticker,
        history: [],
        historyStatus: "unavailable",
        historyFailure: { reason: "invalid_response" },
      };
    const result = parsed.data.results.find(
      (item) => !item.symbol || item.symbol.toUpperCase() === ticker,
    );
    if (!result)
      return {
        ticker,
        history: [],
        historyStatus: "unavailable",
        historyFailure: { reason: "invalid_response" },
      };
    const points = result.data.historicalDataPrice;
    const pointsByDate = new Map<
      string,
      { close: number; conflictingValues: boolean }
    >();
    let omittedPoints = 0;
    let conflictingDates = 0;
    for (const point of points) {
      if (
        !Number.isFinite(point.date) ||
        point.close === null ||
        point.close === undefined ||
        !Number.isFinite(point.close) ||
        point.close <= 0
      ) {
        omittedPoints += 1;
        continue;
      }
      const date = new Date(point.date * 1000);
      if (!Number.isFinite(date.getTime())) {
        omittedPoints += 1;
        continue;
      }
      const dateKey = date.toISOString().slice(0, 10);
      const existing = pointsByDate.get(dateKey);
      if (!existing)
        pointsByDate.set(dateKey, {
          close: point.close,
          conflictingValues: false,
        });
      else if (existing.close !== point.close && !existing.conflictingValues) {
        conflictingDates += 1;
        pointsByDate.set(dateKey, { ...existing, conflictingValues: true });
      }
    }
    const history = [...pointsByDate.entries()]
      .filter(([, point]) => !point.conflictingValues)
      .map(([date, point]) => ({ date, close: point.close }))
      .sort((left, right) => left.date.localeCompare(right.date));
    if (history.length > 0)
      return {
        ticker,
        history,
        historyStatus:
          omittedPoints > 0 || conflictingDates > 0 ? "partial" : "available",
      };
    if (points.length === 0)
      return { ticker, history: [], historyStatus: "empty" };
    return {
      ticker,
      history: [],
      historyStatus: "unavailable",
      historyFailure: { reason: "invalid_response" },
    };
  }

  private historyFailure(error: unknown): MarketHistoryFailure {
    if (error instanceof ApplicationError && error.statusCode === 429)
      return {
        reason: "rate_limited",
        ...(error.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
      };
    if (
      error instanceof MarketDataHttpError &&
      (error.status === 401 || error.status === 403)
    )
      return { reason: "authentication" };
    if (error instanceof MarketDataHttpError)
      return { reason: "http_error", httpStatus: error.status };
    if (error instanceof InvalidMarketDataResponseError)
      return { reason: "invalid_response" };
    if (error instanceof RetryableMarketDataError)
      return { reason: error.reason };
    return { reason: "provider_error" };
  }

  async getHistoryByTicker(
    ticker: string,
    options: { bypassCache?: boolean } = {},
  ): Promise<MarketHistoryResult> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const controller = new AbortController();
    try {
      const payload = await this.getHistoricalPrices(
        encodeURIComponent(normalizedTicker),
        controller.signal,
        options.bypassCache ? "no-store" : "cache",
      );
      return this.normalizeHistory(normalizedTicker, payload);
    } catch (error) {
      const failure = this.historyFailure(error);
      logger.warn("stock_market_history_unavailable", {
        provider: "brapi",
        ticker: normalizedTicker,
        reason: failure.reason,
        httpStatus: failure.httpStatus,
        retryAfterSeconds: failure.retryAfterSeconds,
      });
      return {
        ticker: normalizedTicker,
        history: [],
        historyStatus: "unavailable",
        historyFailure: failure,
      };
    }
  }
  async searchTickers(query: string): Promise<MarketTicker[]> {
    const params = new URLSearchParams({
      search: query,
      type: "stock",
      limit: "10",
    });
    const payload = await this.request("/api/v2/tickers?" + params.toString());
    return tickerSearchSchema
      .parse(payload)
      .results.filter((item) => item.isActive !== false)
      .map(({ symbol, name }) => ({ ticker: symbol, name }));
  }

  async getQuoteByTicker(ticker: string): Promise<MarketQuote> {
    const symbol = encodeURIComponent(ticker);
    const payload = await this.request(
      `/api/v2/stocks/quote?symbols=${symbol}`,
      AbortSignal.timeout(requestTimeoutMs),
    );
    const quote = quoteSchema.parse(payload).results[0]!;
    const observedAt = quote.data.regularMarketTime
      ? new Date(quote.data.regularMarketTime)
      : null;

    return {
      ticker: quote.symbol,
      companyName: quote.data.longName ?? quote.data.shortName ?? null,
      price: quote.data.regularMarketPrice ?? null,
      marketCap: quote.data.marketCap ?? null,
      observedAt:
        observedAt && Number.isFinite(observedAt.getTime()) ? observedAt : null,
    };
  }
  async getByTicker(ticker: string): Promise<MarketData> {
    const symbol = encodeURIComponent(ticker);
    const optionalRequests = new AbortController();
    const quoteRequest = this.request(
      `/api/v2/stocks/quote?symbols=${symbol}`,
      AbortSignal.timeout(requestTimeoutMs),
    );
    const optionalResults = Promise.allSettled([
      this.request(
        `/api/v2/stocks/profile?symbols=${symbol}`,
        AbortSignal.any([
          optionalRequests.signal,
          AbortSignal.timeout(requestTimeoutMs),
        ]),
      ),
      this.getHistoricalPrices(symbol, optionalRequests.signal),
    ]);
    let quotePayload: unknown;
    try {
      quotePayload = await quoteRequest;
    } catch (error) {
      optionalRequests.abort();
      void optionalResults;
      throw error;
    }
    const [profileResult, historyResult] = await optionalResults;
    const quote = quoteSchema.parse(quotePayload).results[0];
    const cnpj =
      profileResult.status === "fulfilled"
        ? (profileSchema
            .parse(profileResult.value)
            .results?.[0]?.data.cnpj?.replace(/\D/g, "") ?? null)
        : null;
    const historyResultData =
      historyResult.status === "fulfilled"
        ? this.normalizeHistory(quote.symbol.toUpperCase(), historyResult.value)
        : {
            ticker: quote.symbol.toUpperCase(),
            history: [],
            historyStatus: "unavailable" as const,
            historyFailure: this.historyFailure(historyResult.reason),
          };

    return {
      ticker: quote.symbol,
      companyName: quote.data.longName ?? quote.data.shortName ?? null,
      cnpj,
      price: quote.data.regularMarketPrice ?? null,
      marketCap: quote.data.marketCap ?? null,
      changePercent: quote.data.regularMarketChangePercent ?? null,
      priceUpdatedAt: quote.data.regularMarketTime ?? null,
      history: historyResultData.history,
      historyStatus: historyResultData.historyStatus,
      ...(historyResultData.historyFailure
        ? { historyFailure: historyResultData.historyFailure }
        : {}),
    };
  }
}
