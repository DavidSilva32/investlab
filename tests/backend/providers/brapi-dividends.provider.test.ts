import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrapiDividendsProvider } from "@/backend/providers/brapi-dividends.provider";

function successfulResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("BrapiDividendsProvider", () => {
  beforeEach(() => vi.stubEnv("BRAPI_TOKEN", ""));
  afterEach(() => vi.unstubAllEnvs());

  const now = () => new Date("2026-10-02T12:00:00.000Z");

  it("queries a rolling twelve-month window and sums only cash payments by payment date", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      successfulResponse({
        results: [
          {
            symbol: "PETR4",
            data: {
              cashDividends: [
                { rate: 1.2, paymentDate: "2025-10-02", label: "DIVIDENDO" },
                { rate: 0.8, paymentDate: "2026-03-15", label: "JCP" },
                { rate: 10, paymentDate: "2026-06-01", label: "DESDOBRAMENTO" },
                { rate: 3, paymentDate: "2025-10-01", label: "DIVIDENDO" },
                { rate: 4, paymentDate: "2026-10-03", label: "DIVIDENDO" },
              ],
            },
          },
        ],
      }),
    );
    const provider = new BrapiDividendsProvider(fetcher, "private-token", now);
    const result = await provider.getLastTwelveMonths("PETR4");
    expect(result).toMatchObject({
      value: 2,
      windowStart: "2025-10-02",
      windowEnd: "2026-10-02",
      observedPayments: 2,
      coverageComplete: false,
      source: "BRAPI",
    });
    expect(result.unavailableReason).toContain("não confirmou");
    const [url, options] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://brapi.dev/api/v2/stocks/dividends?symbols=PETR4&startDate=2025-10-02&endDate=2026-10-02",
    );
    expect(options.headers).toEqual({ Authorization: "Bearer private-token" });
  });

  it("does not claim complete coverage when the result contains no payments", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      successfulResponse({
        results: [{ symbol: "VALE3", data: { cashDividends: [] } }],
      }),
    );
    const provider = new BrapiDividendsProvider(fetcher, "", now);
    await expect(provider.getLastTwelveMonths("VALE3")).resolves.toMatchObject({
      value: null,
      observedPayments: 0,
      coverageComplete: false,
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: {} });
  });

  it("uses the default clock and handles a result without cashDividends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00.000Z"));
    try {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          successfulResponse({ results: [{ symbol: "VALE3", data: {} }] }),
        );
      const provider = new BrapiDividendsProvider(fetcher, "");
      await expect(
        provider.getLastTwelveMonths("VALE3"),
      ).resolves.toMatchObject({
        value: null,
        windowStart: "2025-10-02",
        windowEnd: "2026-10-02",
        observedPayments: 0,
        coverageComplete: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports HTTP, malformed, unmatched and thrown provider failures safely", async () => {
    const failingHttp = new BrapiDividendsProvider(
      vi.fn().mockResolvedValue({ ok: false }),
      undefined,
      now,
    );
    await expect(
      failingHttp.getLastTwelveMonths("PETR4"),
    ).resolves.toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("falhou"),
    });
    const malformed = new BrapiDividendsProvider(
      vi.fn().mockResolvedValue(successfulResponse({ nope: true })),
      undefined,
      now,
    );
    await expect(malformed.getLastTwelveMonths("PETR4")).resolves.toMatchObject(
      {
        value: null,
        unavailableReason: expect.stringContaining("formato reconhecido"),
      },
    );
    const unmatched = new BrapiDividendsProvider(
      vi
        .fn()
        .mockResolvedValue(
          successfulResponse({ results: [{ symbol: "VALE3", data: {} }] }),
        ),
      undefined,
      now,
    );
    await expect(unmatched.getLastTwelveMonths("PETR4")).resolves.toMatchObject(
      {
        value: null,
        unavailableReason: expect.stringContaining("não retornou"),
      },
    );
    const thrown = new BrapiDividendsProvider(
      vi.fn().mockRejectedValue(new Error("internal")),
      undefined,
      now,
    );
    await expect(thrown.getLastTwelveMonths("PETR4")).resolves.toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("Não foi possível"),
    });
  });
});
