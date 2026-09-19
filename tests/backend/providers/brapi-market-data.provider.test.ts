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
