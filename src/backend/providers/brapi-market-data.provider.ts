import { z } from "zod";
import type { MarketData, MarketDataProvider } from "./market-data.provider";

const quoteSchema = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        data: z.object({
          longName: z.string().nullable().optional(),
          shortName: z.string().nullable().optional(),
          regularMarketPrice: z.number().nullable().optional(),
          regularMarketChangePercent: z.number().nullable().optional(),
          regularMarketTime: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
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

  private async request(path: string) {
    const response = await this.fetcher(`https://brapi.dev${path}`, {
      headers: this.apiToken
        ? { Authorization: `Bearer ${this.apiToken}` }
        : undefined,
      cache: "force-cache",
      next: { revalidate: 300 },
    });
    if (!response.ok)
      throw new Error(`BRAPI request failed: ${response.status}`);
    return response.json();
  }

  async getByTicker(ticker: string): Promise<MarketData> {
    const symbol = encodeURIComponent(ticker);
    const [quotePayload, profilePayload, historyPayload] = await Promise.all([
      this.request(`/api/v2/stocks/quote?symbols=${symbol}`),
      this.request(`/api/v2/stocks/profile?symbols=${symbol}`),
      this.request(
        `/api/v2/stocks/historical?symbols=${symbol}&range=1y&interval=1d`,
      ),
    ]);
    const quote = quoteSchema.parse(quotePayload).results[0];
    const cnpj =
      profileSchema
        .parse(profilePayload)
        .results?.[0]?.data.cnpj?.replace(/\D/g, "") ?? null;
    const points =
      historySchema.parse(historyPayload).results?.[0]?.data
        .historicalDataPrice ?? [];

    return {
      ticker: quote.symbol,
      companyName: quote.data.longName ?? quote.data.shortName ?? null,
      cnpj,
      price: quote.data.regularMarketPrice ?? null,
      changePercent: quote.data.regularMarketChangePercent ?? null,
      priceUpdatedAt: quote.data.regularMarketTime ?? null,
      history: points.flatMap((point) =>
        point.close == null
          ? []
          : [
              {
                date: new Date(point.date * 1000).toISOString().slice(0, 10),
                close: point.close,
              },
            ],
      ),
    };
  }
}
