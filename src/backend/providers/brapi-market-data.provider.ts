import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
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

export class BrapiMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiToken = process.env.BRAPI_TOKEN,
  ) {}

  private async request(path: string, signal?: AbortSignal) {
    const response = await this.fetcher(`https://brapi.dev${path}`, {
      headers: this.apiToken
        ? { Authorization: `Bearer ${this.apiToken}` }
        : undefined,
      cache: "force-cache",
      ...(signal ? { signal } : {}),
      next: { revalidate: 300 },
    });
    if (response.status === 429) {
      throw new ApplicationError(
        "Consulta de mercado temporariamente indisponível. Tente novamente em instantes.",
        429,
        parseRetryAfterSeconds(response.headers.get("retry-after")),
      );
    }
    if (!response.ok)
      throw new Error(`BRAPI request failed: ${response.status}`);
    return response.json();
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
      AbortSignal.timeout(15_000),
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
    const quotePayload = await this.request(
      `/api/v2/stocks/quote?symbols=${symbol}`,
    );
    const [profileResult, historyResult] = await Promise.allSettled([
      this.request(`/api/v2/stocks/profile?symbols=${symbol}`),
      this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=1y&interval=1d`,
      ),
    ]);
    const quote = quoteSchema.parse(quotePayload).results[0];
    const cnpj =
      profileResult.status === "fulfilled"
        ? (profileSchema
            .parse(profileResult.value)
            .results?.[0]?.data.cnpj?.replace(/\D/g, "") ?? null)
        : null;
    const points =
      historyResult.status === "fulfilled"
        ? (historySchema.parse(historyResult.value).results?.[0]?.data
            .historicalDataPrice ?? [])
        : [];
    const history = Array.from(
      new Map(
        points.flatMap((point) => {
          if (point.close === null || point.close === undefined) return [];
          const date = new Date(point.date * 1000).toISOString().slice(0, 10);
          return [[date, { date, close: point.close }] as const];
        }),
      ).values(),
    ).sort((left, right) => left.date.localeCompare(right.date));

    return {
      ticker: quote.symbol,
      companyName: quote.data.longName ?? quote.data.shortName ?? null,
      cnpj,
      price: quote.data.regularMarketPrice ?? null,
      marketCap: quote.data.marketCap ?? null,
      changePercent: quote.data.regularMarketChangePercent ?? null,
      priceUpdatedAt: quote.data.regularMarketTime ?? null,
      history,
    };
  }
}
