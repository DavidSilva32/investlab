import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function waitForAbort(signal: AbortSignal) {
  return new Promise<Response>((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("The operation was aborted", "AbortError")),
      { once: true },
    );
  });
}

const quote = (data: Record<string, unknown> = {}) => ({
  results: [{ symbol: "PETR4", data }],
});

describe("BrapiMarketDataProvider", () => {
  beforeEach(() => vi.stubEnv("BRAPI_TOKEN", ""));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { logoUrl: "https://icons.brapi.dev/icons/PETR4.svg" },
    { logourl: "https://icons.brapi.dev/icons/PETR4.svg" },
  ])("reuses quote logo variants without another request: %j", async (logo) => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(quote(logo)));
    await expect(
      new BrapiMarketDataProvider(fetcher).getQuoteByTicker("PETR4"),
    ).resolves.toMatchObject({
      logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("accepts result-level logos in the complete analysis payload", async () => {
    const fetcher = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        jsonResponse(
          String(input).includes("/stocks/quote")
            ? {
                results: [
                  {
                    symbol: "PETR4",
                    logourl: "https://icons.brapi.dev/icons/PETR4.svg",
                    data: { regularMarketPrice: 42 },
                  },
                ],
              }
            : String(input).includes("/stocks/profile")
              ? { results: [] }
              : { results: [{ data: { historicalDataPrice: [] } }] },
        ),
      ),
    );
    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toMatchObject({
      logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
      price: 42,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("ignores malformed and unsafe logo metadata without losing quotes", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            symbol: "PETR4",
            logoUrl: false,
            logourl: "",
            data: {
              logoUrl: { src: "bad" },
              logourl: "https://evil.example/PETR4.svg",
              regularMarketPrice: 42,
            },
          },
        ],
      }),
    );
    const result = await new BrapiMarketDataProvider(fetcher).getQuoteByTicker(
      "PETR4",
    );
    expect(result.price).toBe(42);
    expect(result).not.toHaveProperty("logoUrl");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([null, "malformed", 42, []])(
    "preserves searchable assets when ancillary data is malformed: %j",
    async (data) => {
      const fetcher = vi.fn().mockResolvedValue(
        jsonResponse({
          results: [{ symbol: "PETR4", name: "Petrobras", data }],
        }),
      );
      await expect(
        new BrapiMarketDataProvider(fetcher).searchTickers("PETR"),
      ).resolves.toEqual([{ ticker: "PETR4", name: "Petrobras" }]);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("reuses search logos at both contract levels and skips invalid candidates", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            symbol: "PETR4",
            name: "Petrobras",
            data: {
              logoUrl: "https://evil.example/icon.svg",
              logourl: "https://icons.brapi.dev/icons/PETR4.svg",
            },
          },
          {
            symbol: "VALE3",
            name: "Vale",
            logoUrl: "https://icons.brapi.dev/icons/VALE3.svg",
          },
          {
            symbol: "BBAS3",
            name: "Banco do Brasil",
            logourl: "https://icons.brapi.dev/icons/BBAS3.svg",
          },
          { symbol: "WEGE3", name: "Weg", data: {}, logoUrl: null },
        ],
      }),
    );
    await expect(
      new BrapiMarketDataProvider(fetcher).searchTickers("a"),
    ).resolves.toEqual([
      {
        ticker: "PETR4",
        name: "Petrobras",
        logoUrl: "https://icons.brapi.dev/icons/PETR4.svg",
      },
      {
        ticker: "VALE3",
        name: "Vale",
        logoUrl: "https://icons.brapi.dev/icons/VALE3.svg",
      },
      {
        ticker: "BBAS3",
        name: "Banco do Brasil",
        logoUrl: "https://icons.brapi.dev/icons/BBAS3.svg",
      },
      { ticker: "WEGE3", name: "Weg" },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("starts profile and price history while waiting for the quote", async () => {
    let releaseQuote!: (response: Response) => void;
    const quoteResponse = new Promise<Response>((resolve) => {
      releaseQuote = resolve;
    });
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes("/stocks/quote")) return quoteResponse;
      if (url.includes("/stocks/profile"))
        return Promise.resolve(
          jsonResponse({ results: [{ data: { cnpj: "33.000.167/0001-01" } }] }),
        );
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              data: { historicalDataPrice: [{ date: 1767225600, close: 49 }] },
            },
          ],
        }),
      );
    });

    const resultPromise = new BrapiMarketDataProvider(fetcher).getByTicker(
      "PETR4",
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://brapi.dev/api/v2/stocks/quote?symbols=PETR4",
      "https://brapi.dev/api/v2/stocks/profile?symbols=PETR4",
      "https://brapi.dev/api/v2/stocks/historical?symbols=PETR4&range=5y&interval=1d",
    ]);

    releaseQuote(
      jsonResponse(
        quote({
          regularMarketPrice: 50,
          marketCap: 200,
          regularMarketTime: "2026-01-01T12:00:00Z",
        }),
      ),
    );
    await expect(resultPromise).resolves.toMatchObject({
      cnpj: "33000167000101",
      price: 50,
      history: [{ date: "2026-01-01", close: 49 }],
    });
  });

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
    const provider = new BrapiMarketDataProvider(fetcher, "");
    const result = await provider.getQuoteByTicker("PETR4");
    expect(result).toEqual({
      ticker: "PETR4",
      companyName: "Petrobras PN",
      price: 49.26,
      marketCap: 669710376952,
      observedAt: new Date("2026-09-24T21:31:30.000Z"),
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toContain("/stocks/quote?symbols=PETR4");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: undefined });
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
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
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
                  { date: 1767225600, close: 31 },
                  { date: 1767139200, close: 30 },
                  { date: 1767225600, close: 32 },
                  { date: 1767312000, close: 33 },
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
        { date: "2026-01-02", close: 33 },
      ],
      historyStatus: "partial",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://brapi.dev/api/v2/stocks/quote?symbols=PETR4%2FSA",
    );
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "https://brapi.dev/api/v2/stocks/historical?symbols=PETR4%2FSA&range=5y&interval=1d",
    );
  });

  it("falls back to optional quote fields and returns empty optional profile and history", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote({ shortName: "Nome curto" })))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ data: { historicalDataPrice: [] } }] }),
      );

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
      historyStatus: "empty",
    });
  });

  it("preserves valid historical closes and marks omitted malformed points as partial", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              data: {
                historicalDataPrice: [
                  { date: 1767225600, close: 31 },
                  { date: 1767312000, close: null },
                ],
              },
            },
          ],
        }),
      );

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toMatchObject({
      history: [{ date: "2026-01-01", close: 31 }],
      historyStatus: "partial",
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
    ).resolves.toMatchObject({
      companyName: null,
      cnpj: null,
      history: [],
      historyStatus: "unavailable",
    });
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
    ).resolves.toMatchObject({ history: [], historyStatus: "unavailable" });
    expect(invalidHistoryFetcher).toHaveBeenCalledTimes(3);
  });
  it("does not retry a historical rate limit but falls back to one year on other failures", async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
      );
    await expect(
      new BrapiMarketDataProvider(rateLimited).getByTicker("PETR4"),
    ).resolves.toMatchObject({
      history: [],
      historyStatus: "unavailable",
      historyFailure: { reason: "rate_limited", retryAfterSeconds: 30 },
    });
    expect(rateLimited).toHaveBeenCalledTimes(3);

    const unavailable = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ data: { historicalDataPrice: [] } }] }),
      );
    await expect(
      new BrapiMarketDataProvider(unavailable).getByTicker("PETR4"),
    ).resolves.toMatchObject({ history: [], historyStatus: "empty" });
    expect(unavailable.mock.calls[2]?.[0]).toContain("range=5y");
    expect(unavailable.mock.calls[3]?.[0]).toContain("range=1y");
  });

  it("does not retry invalid history payloads and exposes unavailable history", async () => {
    const invalidJson = new Response("not json");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(invalidJson);

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toMatchObject({ history: [], historyStatus: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]?.[0]).toContain("range=5y");
  });

  it("does not retry deterministic historical client errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(quote()))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
    ).resolves.toMatchObject({ history: [], historyStatus: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("bypasses HTTP cache for a focused history retry and separates empty from malformed data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ data: { historicalDataPrice: [] } }] }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    const provider = new BrapiMarketDataProvider(fetcher);

    await expect(
      provider.getHistoryByTicker("PETR4", { bypassCache: true }),
    ).resolves.toMatchObject({
      ticker: "PETR4",
      history: [],
      historyStatus: "empty",
    });
    await expect(
      provider.getHistoryByTicker("PETR4", { bypassCache: true }),
    ).resolves.toMatchObject({
      historyStatus: "unavailable",
      historyFailure: { reason: "invalid_response" },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://brapi.dev/api/v2/stocks/historical?symbols=PETR4&range=5y&interval=1d",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("next");
  });

  it("exposes rate-limit and authentication states for an isolated history request", async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "15" } }),
      );
    await expect(
      new BrapiMarketDataProvider(rateLimited).getHistoryByTicker("PETR4", {
        bypassCache: true,
      }),
    ).resolves.toMatchObject({
      historyStatus: "unavailable",
      historyFailure: { reason: "rate_limited", retryAfterSeconds: 15 },
    });
    const unauthorized = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      new BrapiMarketDataProvider(unauthorized).getHistoryByTicker("PETR4", {
        bypassCache: true,
      }),
    ).resolves.toMatchObject({
      historyStatus: "unavailable",
      historyFailure: { reason: "authentication" },
    });
  });

  it("classifies rate limits without Retry-After and provider HTTP 408 separately", async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));
    await expect(
      new BrapiMarketDataProvider(rateLimited).getHistoryByTicker("PETR4"),
    ).resolves.toMatchObject({
      historyStatus: "unavailable",
      historyFailure: { reason: "rate_limited" },
    });

    const timedOut = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 408 }));
    await expect(
      new BrapiMarketDataProvider(timedOut).getHistoryByTicker("PETR4"),
    ).resolves.toMatchObject({
      historyStatus: "unavailable",
      historyFailure: { reason: "timeout" },
    });
    expect(timedOut).toHaveBeenCalledTimes(2);
    expect(String(timedOut.mock.calls[1]?.[0])).toContain("range=1y");
  });

  it("classifies an aborted provider fetch as a timeout before retrying the shorter range", async () => {
    const timeoutSignal = AbortSignal.abort(
      new DOMException("The request timed out", "TimeoutError"),
    );
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutSignal);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    try {
      await expect(
        new BrapiMarketDataProvider(fetcher).getHistoryByTicker("PETR4"),
      ).resolves.toMatchObject({
        historyStatus: "unavailable",
        historyFailure: { reason: "timeout" },
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("bounds the required quote request and cancels optional requests on failure", async () => {
    const controllers: AbortController[] = [];
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((duration) => {
        expect(duration).toBe(15_000);
        const controller = new AbortController();
        controllers.push(controller);
        return controller.signal;
      });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) =>
        waitForAbort(init?.signal as AbortSignal),
      );

    try {
      const resultPromise = new BrapiMarketDataProvider(fetcher).getByTicker(
        "PETR4",
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controllers[0]?.signal);
      controllers[0]!.abort();
      await expect(resultPromise).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
      expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("keeps profile optional when its bounded request times out", async () => {
    const controllers: AbortController[] = [];
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((duration) => {
        expect(duration).toBe(15_000);
        const controller = new AbortController();
        controllers.push(controller);
        return controller.signal;
      });
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/stocks/quote"))
        return Promise.resolve(
          jsonResponse(quote({ regularMarketPrice: 50, marketCap: 200 })),
        );
      if (url.includes("/stocks/profile"))
        return waitForAbort(init?.signal as AbortSignal);
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              data: { historicalDataPrice: [{ date: 1767225600, close: 49 }] },
            },
          ],
        }),
      );
    });

    try {
      const resultPromise = new BrapiMarketDataProvider(fetcher).getByTicker(
        "PETR4",
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controllers[0]?.signal);
      expect(fetcher.mock.calls[1]?.[1]?.signal).not.toBe(
        controllers[1]?.signal,
      );
      expect(fetcher.mock.calls[2]?.[1]?.signal).not.toBe(
        controllers[2]?.signal,
      );
      expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
      expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(false);
      controllers[1]!.abort();

      await expect(resultPromise).resolves.toMatchObject({
        ticker: "PETR4",
        cnpj: null,
        price: 50,
        history: [{ date: "2026-01-01", close: 49 }],
        historyStatus: "available",
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("falls back to one year when the five-year history request times out", async () => {
    const controllers: AbortController[] = [];
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((duration) => {
        expect(duration).toBe(15_000);
        const controller = new AbortController();
        controllers.push(controller);
        return controller.signal;
      });
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/stocks/quote"))
        return Promise.resolve(
          jsonResponse(quote({ regularMarketPrice: 50, marketCap: 200 })),
        );
      if (url.includes("/stocks/profile"))
        return Promise.resolve(jsonResponse({}));
      if (url.includes("range=5y")) {
        const signal = init?.signal as AbortSignal;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => waitForAbort(signal),
        } as Response);
      }
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              data: { historicalDataPrice: [{ date: 1767225600, close: 49 }] },
            },
          ],
        }),
      );
    });

    try {
      const resultPromise = new BrapiMarketDataProvider(fetcher).getByTicker(
        "PETR4",
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      controllers[2]!.abort();

      await expect(resultPromise).resolves.toMatchObject({
        price: 50,
        history: [{ date: "2026-01-01", close: 49 }],
        historyStatus: "available",
      });
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(fetcher.mock.calls[2]?.[0]).toContain("range=5y");
      expect(fetcher.mock.calls[3]?.[0]).toContain("range=1y");
      expect(controllers).toHaveLength(4);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("returns unavailable history after both attempts time out while retaining the quote", async () => {
    const controllers: AbortController[] = [];
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((duration) => {
        expect(duration).toBe(15_000);
        const controller = new AbortController();
        controllers.push(controller);
        return controller.signal;
      });
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/stocks/quote"))
        return Promise.resolve(
          jsonResponse(quote({ regularMarketPrice: 50, marketCap: 200 })),
        );
      if (url.includes("/stocks/profile"))
        return Promise.resolve(jsonResponse({}));
      return waitForAbort(init?.signal as AbortSignal);
    });

    try {
      const resultPromise = new BrapiMarketDataProvider(fetcher).getByTicker(
        "PETR4",
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      controllers[2]!.abort();
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
      controllers[3]!.abort();

      await expect(resultPromise).resolves.toMatchObject({
        price: 50,
        history: [],
        historyStatus: "unavailable",
      });
      expect(fetcher.mock.calls[2]?.[0]).toContain("range=5y");
      expect(fetcher.mock.calls[3]?.[0]).toContain("range=1y");
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it.each([
    ["a null close", [{ date: 1767225600, close: null }]],
    ["an invalid date", [{ date: 1e100, close: 12 }]],
    [
      "conflicting same-day closes",
      [
        { date: 1767225600, close: 12 },
        { date: 1767225600, close: 13 },
      ],
    ],
  ])(
    "marks history unavailable when records contain only %s",
    async (_label, points) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(quote()))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(
          jsonResponse({
            results: [{ data: { historicalDataPrice: points } }],
          }),
        );

      await expect(
        new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
      ).resolves.toMatchObject({ history: [], historyStatus: "unavailable" });
    },
  );

  it("classifies malformed JSON as an invalid provider response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid json")),
    } as unknown as Response);

    await expect(
      new BrapiMarketDataProvider(fetcher).getHistoryByTicker("PETR4"),
    ).resolves.toMatchObject({
      history: [],
      historyStatus: "unavailable",
      historyFailure: { reason: "invalid_response" },
    });
  });

  it("does not attach a different symbol's history to the requested ticker", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        results: [
          {
            symbol: "VALE3",
            data: { historicalDataPrice: [{ date: 1767225600, close: 49 }] },
          },
        ],
      }),
    );

    await expect(
      new BrapiMarketDataProvider(fetcher).getHistoryByTicker("PETR4"),
    ).resolves.toMatchObject({
      ticker: "PETR4",
      history: [],
      historyStatus: "unavailable",
      historyFailure: { reason: "invalid_response" },
    });
  });
});
