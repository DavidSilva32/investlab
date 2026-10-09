import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
import type {
  MarketData,
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
    results: z
      .array(
        z.object({
          data: z.object({
            historicalDataPrice: z
              .array(
                z.object({
                  date: z.number(),
                  close: z.number().nullable().optional(),
                }),
              )
              .optional(),
          }),
        }),
      )
      .optional(),
  })
  .loose();

class RetryableMarketDataError extends Error {}
const requestTimeoutMs = 15_000;

export class BrapiMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiToken = process.env.BRAPI_TOKEN,
  ) {}

  private async request(path: string, signal?: AbortSignal) {
    const startedAt = Date.now();
    const operation = new URL(path, "https://brapi.dev").pathname
      .split("/")
      .at(-1);
    const ticker = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get(
      "symbols",
    );
    const logContext = { provider: "brapi", operation, ticker };
    let response: Response;
    try {
      response = await this.fetcher(`https://brapi.dev${path}`, {
        headers: this.apiToken
          ? { Authorization: `Bearer ${this.apiToken}` }
          : undefined,
        cache: "force-cache",
        ...(signal ? { signal } : {}),
        next: { revalidate: 300 },
      });
    } catch (error) {
      logger.warn("stock_market_provider_request_failed", {
        ...logContext,
        durationMs: Date.now() - startedAt,
      });
      throw new RetryableMarketDataError("BRAPI request failed", {
        cause: error,
      });
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
      );
    }
    if (!response.ok) {
      logger.info("stock_market_provider_request_completed", {
        ...logContext,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(`BRAPI request failed: ${response.status}`);
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
        throw new RetryableMarketDataError("BRAPI request timed out", {
          cause: error,
        });
      throw error;
    }
  }

  private async getHistoricalPrices(symbol: string, parentSignal: AbortSignal) {
    const signal = () =>
      AbortSignal.any([parentSignal, AbortSignal.timeout(requestTimeoutMs)]);
    try {
      return await this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=5y&interval=1d`,
        signal(),
      );
    } catch (error) {
      if (!(error instanceof RetryableMarketDataError) || parentSignal.aborted)
        throw error;

      return this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=1y&interval=1d`,
        signal(),
      );
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
    const parsedHistory =
      historyResult.status === "fulfilled"
        ? historySchema.safeParse(historyResult.value)
        : null;
    const points = parsedHistory?.success
      ? (parsedHistory.data.results?.[0]?.data.historicalDataPrice ?? [])
      : [];
    const pointsByDate = new Map<
      string,
      { close: number; conflictingValues: boolean }
    >();
    for (const point of points) {
      if (
        !Number.isFinite(point.date) ||
        point.close === null ||
        point.close === undefined ||
        !Number.isFinite(point.close) ||
        point.close <= 0
      )
        continue;
      const date = new Date(point.date * 1000);
      if (!Number.isFinite(date.getTime())) continue;
      const dateKey = date.toISOString().slice(0, 10);
      const existing = pointsByDate.get(dateKey);
      if (!existing)
        pointsByDate.set(dateKey, {
          close: point.close,
          conflictingValues: false,
        });
      else if (existing.close !== point.close)
        pointsByDate.set(dateKey, { ...existing, conflictingValues: true });
    }
    const history = [...pointsByDate.entries()]
      .filter(([, point]) => !point.conflictingValues)
      .map(([date, point]) => ({ date, close: point.close }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const historyStatus =
      historyResult.status === "rejected" ||
      (parsedHistory !== null && !parsedHistory.success)
        ? ("unavailable" as const)
        : history.length > 0
          ? ("available" as const)
          : points.length > 0
            ? ("unavailable" as const)
            : ("empty" as const);

    return {
      ticker: quote.symbol,
      companyName: quote.data.longName ?? quote.data.shortName ?? null,
      cnpj,
      price: quote.data.regularMarketPrice ?? null,
      marketCap: quote.data.marketCap ?? null,
      changePercent: quote.data.regularMarketChangePercent ?? null,
      priceUpdatedAt: quote.data.regularMarketTime ?? null,
      history,
      historyStatus,
    };
  }
}
