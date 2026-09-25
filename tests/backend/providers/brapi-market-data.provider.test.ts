import { describe, expect, it, vi } from "vitest";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

const quote = (data: Record<string, unknown> = {}) => ({
  results: [{ symbol: "PETR4", data }],
});

describe("BrapiMarketDataProvider", () => {
  it("loads only a quote and parses issuer market capitalization and quote time", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        quote({
          longName: "Petrobras PN",
          regularMarketPrice: 49.26,
          marketCap: 669710376952,
          regularMarketTime: "2026-09-24T21:31:30.000Z",
        }),
      ),
    );
    const result = await new BrapiMarketDataProvider(fetcher).getQuoteByTicker(
      "PETR4",
    );
    expect(result).toEqual({
      ticker: "PETR4",
      companyName: "Petrobras PN",
      price: 49.26,
      marketCap: 669710376952,
      observedAt: new Date("2026-09-24T21:31:30.000Z"),
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toContain("/stocks/quote?symbols=PETR4");
  });

  it("keeps a missing quote timestamp unavailable", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(quote({ marketCap: 100 })));
    await expect(
      new BrapiMarketDataProvider(fetcher).getQuoteByTicker("PETR4"),
    ).resolves.toMatchObject({ observedAt: null, marketCap: 100 });
  });
  it("keeps absent, invalid, and unnamed quote fields null", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(quote({ regularMarketTime: "not-a-time" })),
      );
    await expect(
      new BrapiMarketDataProvider(fetcher).getQuoteByTicker("PETR4"),
    ).resolves.toEqual({
      ticker: "PETR4",
      companyName: null,
      price: null,
      marketCap: null,
      observedAt: null,
    });
  });

  it("exposes BRAPI rate limiting and parses numeric Retry-After", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "60" } }),
      );
    const provider = new BrapiMarketDataProvider(fetcher);

    await expect(provider.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 60,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([null, "not-a-date"])(
    "keeps an absent or invalid Retry-After undefined (%s)",
    async (retryAfter) => {
      const headers = retryAfter ? { "retry-after": retryAfter } : undefined;
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 429, headers }));

      await expect(
        new BrapiMarketDataProvider(fetcher).searchTickers("PETR4"),
      ).rejects.toMatchObject({
        statusCode: 429,
        retryAfterSeconds: undefined,
      });
    },
  );

  it("converts Retry-After dates to nonnegative seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const futureFetcher = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "Thu, 01 Jan 2026 00:00:02 GMT" },
        }),
      );
      await expect(
        new BrapiMarketDataProvider(futureFetcher).searchTickers("PETR4"),
      ).rejects.toMatchObject({ retryAfterSeconds: 2 });

      const pastFetcher = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "Wed, 31 Dec 2025 23:59:59 GMT" },
        }),
      );
      await expect(
        new BrapiMarketDataProvider(pastFetcher).searchTickers("PETR4"),
      ).rejects.toMatchObject({ retryAfterSeconds: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the configured bearer token and throws on other HTTP errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new BrapiMarketDataProvider(fetcher, "test-token");

    await expect(provider.searchTickers("PETR4")).rejects.toThrow(
      "BRAPI request failed: 503",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer test-token" },
      cache: "force-cache",
      next: { revalidate: 300 },
    });
  });

  it("searches stock tickers, omits inactive entries, and keeps unspecified activity", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { symbol: "PETR4", name: "Petrobras PN", isActive: true },
          { symbol: "OLD3", name: "Inactive Corp", isActive: false },
          { symbol: "VALE3", name: "Vale" },
        ],
      }),
    );
    const provider = new BrapiMarketDataProvider(fetcher);

    await expect(provider.searchTickers("Petrobras & Vale")).resolves.toEqual([
      { ticker: "PETR4", name: "Petrobras PN" },
      { ticker: "VALE3", name: "Vale" },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://brapi.dev/api/v2/tickers?search=Petrobras+%26+Vale&type=stock&limit=10",
    );
  });

  it("rejects malformed ticker search payloads", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results: [{}] }));

    await expect(
      new BrapiMarketDataProvider(fetcher).searchTickers("PETR4"),
    ).rejects.toThrow();
  });

  it("normalizes quote data and history in chronological order without duplicate dates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          quote({
            longName: "Petrobras S.A.",
            shortName: "Petrobras",
            regularMarketPrice: 30,
            marketCap: 300,
            regularMarketChangePercent: 1.5,
            regularMarketTime: "2026-01-01T12:00:00Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ data: { cnpj: "33.000.167/0001-01" } }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              data: {
                historicalDataPrice: [
                  { date: 1767225600, close: 31 },
                  { date: 1767139200, close: 30 },
                  { date: 1767225600, close: 32 },
                  { date: 1767312000, close: null },
                ],
              },
            },
          ],
        }),
      );

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4/SA"),
    ).resolves.toEqual({
      ticker: "PETR4",
      companyName: "Petrobras S.A.",
      cnpj: "33000167000101",
      price: 30,
      marketCap: 300,
      changePercent: 1.5,
      priceUpdatedAt: "2026-01-01T12:00:00Z",
      history: [
        { date: "2025-12-31", close: 30 },
        { date: "2026-01-01", close: 32 },
      ],
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://brapi.dev/api/v2/stocks/quote?symbols=PETR4%2FSA",
    );
  });

  it("falls back to optional quote fields and returns empty optional profile and history", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote({ shortName: "Nome curto" })))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toEqual({
      ticker: "PETR4",
      companyName: "Nome curto",
      cnpj: null,
      price: null,
      marketCap: null,
      changePercent: null,
      priceUpdatedAt: null,
      history: [],
    });
  });

  it("uses null company name when both provider names are null", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(quote({ longName: null, shortName: null })),
      )
      .mockRejectedValueOnce(new Error("profile offline"))
      .mockRejectedValueOnce(new Error("history offline"));

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toMatchObject({ companyName: null, cnpj: null, history: [] });
  });

  it("propagates malformed required quote payloads", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).rejects.toThrow();
  });

  it("propagates invalid successful optional profile and history payloads", async () => {
    const invalidProfileFetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ data: { cnpj: 12 } }] }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    await expect(
      new BrapiMarketDataProvider(invalidProfileFetcher).getByTicker("PETR4"),
    ).rejects.toThrow();

    const invalidHistoryFetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ data: { historicalDataPrice: [{ date: "x" }] } }],
        }),
      );
    await expect(
      new BrapiMarketDataProvider(invalidHistoryFetcher).getByTicker("PETR4"),
    ).rejects.toThrow();
  });
});
