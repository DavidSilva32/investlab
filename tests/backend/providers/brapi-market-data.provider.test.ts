import { describe, expect, it, vi } from "vitest";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";

describe("BrapiMarketDataProvider", () => {
  it("exposes BRAPI rate limiting as a client-safe application error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "60" } }),
      );
    const provider = new BrapiMarketDataProvider(fetcher);

    await expect(provider.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 429,
      retryAfterSeconds: 60,
      message:
        "Consulta de mercado temporariamente indisponível. Tente novamente em instantes.",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("normalizes BRAPI history in chronological order without duplicate dates", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              symbol: "PETR4",
              data: { regularMarketPrice: 30, marketCap: 300 },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [{ data: { cnpj: "33.000.167/0001-01" } }] }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              data: {
                historicalDataPrice: [
                  { date: 1767225600, close: 31 },
                  { date: 1767139200, close: 30 },
                  { date: 1767225600, close: 32 },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

  await expect(
    new BrapiMarketDataProvider(fetcher).getByTicker("PETR4"),
  ).resolves.toMatchObject({
    marketCap: 300,
    history: [
      { date: "2025-12-31", close: 30 },
      { date: "2026-01-01", close: 32 },
    ],
  });
});

it("searches BRAPI stock tickers by name or symbol and omits inactive entries", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [
          { symbol: "PETR4", name: "Petrobras PN", isActive: true },
          { symbol: "OLD3", name: "Inactive Corp", isActive: false },
        ],
      }),
      { status: 200 },
    ),
  );
  const provider = new BrapiMarketDataProvider(fetcher);
  await expect(provider.searchTickers("Petrobras")).resolves.toEqual([
    { ticker: "PETR4", name: "Petrobras PN" },
  ]);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "https://brapi.dev/api/v2/tickers?search=Petrobras&type=stock&limit=10",
  );
});
