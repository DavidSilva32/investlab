import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import type { MarketQuote } from "@/backend/providers/market-data.provider";
import {
  collectQuoteEvidence,
  ScreenerMarketService,
  validateIssuerMarketQuotes,
} from "@/backend/services/screener-market.service";
import type { ScreenerCompany } from "@/backend/services/screener-metrics";

const quoteTime = new Date("2026-09-24T21:31:30.000Z");
const now = new Date("2026-09-24T22:00:00.000Z");
const quote = (
  ticker: string,
  marketCap: number | null = 1000,
  observedAt: Date | null = quoteTime,
  price: number | null = 10,
): MarketQuote => ({
  ticker,
  companyName: "Empresa",
  price,
  marketCap,
  observedAt,
});
const security = (ticker: string) => ({ ticker, name: ticker });
const company = (
  cnpj: string,
  tickers: string[] = ["SLCE3"],
  marketSnapshot: ScreenerCompany["marketSnapshot"] = null,
): ScreenerCompany => ({
  cnpj,
  cvmCode: cnpj,
  name: cnpj,
  sector: "Petróleo e Gás",
  quantitativeEligible: false,
  securities: tickers.map(security),
  facts: [
    {
      referenceDate: "2025-12-31",
      accountCode: "3.01",
      accountLabel: "Receita de Venda de Bens e/ou Serviços",
      value: 1000,
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
    {
      referenceDate: "2025-12-31",
      accountCode: "3.11",
      accountLabel: "Lucro/Prejuízo Consolidado do Período",
      value: 200,
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
    {
      referenceDate: "2025-12-31",
      accountCode: "2.03",
      accountLabel: "Patrimônio Líquido Consolidado",
      value: 500,
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
  ],
  marketSnapshot,
});
function repositoryFor(universe: ScreenerCompany[]) {
  return {
    getUniverse: vi.fn().mockResolvedValue(universe),
    startMarketRefreshRun: vi.fn().mockResolvedValue("market-run-1"),
    saveMarketSnapshot: vi.fn().mockResolvedValue(undefined),
    completeMarketRefreshRun: vi.fn().mockResolvedValue(undefined),
    getMarketDataStatus: vi
      .fn()
      .mockResolvedValue({ latestRun: null, latestQuote: null }),
  };
}

describe("collectQuoteEvidence", () => {
  it("records a missing quote with null values and an empty returned ticker", () => {
    expect(collectQuoteEvidence([security("PETR3")], [])).toEqual([
      {
        requestedTicker: "PETR3",
        returnedTicker: "",
        price: null,
        marketCap: null,
        quoteObservedAt: null,
        validationResult: "QUOTE_MISSING",
      },
    ]);
  });
});
describe("validateIssuerMarketQuotes", () => {
  it("accepts a single-class quote and returns its issuer cap and class price", () => {
    expect(
      validateIssuerMarketQuotes([security("SLCE3")], [quote("SLCE3")]),
    ).toEqual({
      marketCap: 1000,
      price: 10,
      sourceTicker: "SLCE3",
      quoteObservedAt: quoteTime,
    });
  });

  it("accepts ON and PN when BRAPI returns matching cap and quote time", () => {
    expect(
      validateIssuerMarketQuotes(
        [security("PETR4"), security("PETR3")],
        [
          quote("PETR4", 900, quoteTime, 49),
          quote("PETR3", 900, quoteTime, 54),
        ],
      ),
    ).toMatchObject({ marketCap: 900, price: 54, sourceTicker: "PETR3" });
  });

  const invalidQuoteCases: Array<
    [ReturnType<typeof security>[], MarketQuote[]]
  > = [
    [[], []],
    [[security("SLCE3")], []],
    [[security("SLCE3")], [quote("SLCE4")]],
    [[security("SLCE3")], [quote("SLCE3", null)]],
    [[security("SLCE3")], [quote("SLCE3", 0)]],
    [[security("SLCE3")], [quote("SLCE3", 1000, null)]],
    [[security("SLCE3")], [quote("SLCE3", 1000, new Date("invalid"))]],
    [
      [security("PETR3"), security("PETR4")],
      [quote("PETR3", 900), quote("PETR4", 901)],
    ],
    [
      [security("PETR3"), security("PETR4")],
      [
        quote("PETR3", 900),
        quote("PETR4", 900, new Date(quoteTime.getTime() + 1)),
      ],
    ],
  ];

  it.each(invalidQuoteCases)(
    "rejects incomplete or inconsistent class data",
    (securities, quotes) => {
      expect(validateIssuerMarketQuotes(securities, quotes)).toBeNull();
    },
  );
});

describe("ScreenerMarketService", () => {
  it("serially persists the matching quote and market-run provenance", async () => {
    const storedCompany = company("slc", ["SLCE3"]);
    const repository = repositoryFor([storedCompany]);
    const provider = {
      getQuoteByTicker: vi.fn().mockResolvedValue(quote("SLCE3")),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch("request-1")).resolves.toMatchObject({
      attemptedIssuers: 1,
      updatedIssuers: 1,
      unavailableIssuers: 0,
      remainingIssuers: 0,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledExactlyOnceWith("SLCE3");
    expect(repository.saveMarketSnapshot).toHaveBeenCalledWith({
      issuerCnpj: "slc",
      observedAt: now,
      marketCap: 1000,
      price: 10,
      sourceTicker: "SLCE3",
      quoteObservedAt: quoteTime,
      classSemanticsValidated: true,
      marketRefreshRunId: "market-run-1",
      quoteEvidence: [
        {
          requestedTicker: "SLCE3",
          returnedTicker: "SLCE3",
          price: 10,
          marketCap: 1000,
          quoteObservedAt: quoteTime,
          validationResult: "VALIDATED",
        },
      ],
    });
    expect(repository.completeMarketRefreshRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "market-run-1", status: "COMPLETED" }),
    );
  });

  it("records mismatched dual-class issuer quotes as unavailable without guessing", async () => {
    const repository = repositoryFor([company("dual", ["PETR3", "PETR4"])]);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) =>
        quote(ticker, ticker === "PETR3" ? 900 : 901),
      ),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).resolves.toMatchObject({
      unavailableIssuers: 1,
    });
    expect(repository.saveMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        marketCap: null,
        price: null,
        classSemanticsValidated: false,
        quoteEvidence: expect.arrayContaining([
          expect.objectContaining({ validationResult: "MARKET_CAP_MISMATCH" }),
        ]),
      }),
    );
  });

  it.each([
    [quote("OTHER3"), "TICKER_MISMATCH"],
    [quote("SLCE3", null), "MARKET_CAP_MISSING"],
    [quote("SLCE3", 0), "MARKET_CAP_NONPOSITIVE"],
    [quote("SLCE3", 1000, null), "QUOTE_TIME_MISSING"],
  ] as const)(
    "persists invalid quote evidence (%s)",
    async (marketQuote, validationResult) => {
      const repository = repositoryFor([company("slc")]);
      const provider = {
        getQuoteByTicker: vi.fn().mockResolvedValue(marketQuote),
      };
      const service = new ScreenerMarketService(
        provider,
        repository,
        () => now,
      );

      await expect(service.refreshBatch()).resolves.toMatchObject({
        updatedIssuers: 0,
        unavailableIssuers: 1,
      });
      expect(repository.saveMarketSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          marketCap: null,
          classSemanticsValidated: false,
          quoteEvidence: [
            expect.objectContaining({
              requestedTicker: "SLCE3",
              returnedTicker: marketQuote.ticker,
              validationResult,
            }),
          ],
        }),
      );
    },
  );

  it("persists valid quote evidence for a single-class issuer", async () => {
    const repository = repositoryFor([company("slc")]);
    const provider = {
      getQuoteByTicker: vi.fn().mockResolvedValue(quote("SLCE3")),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      updatedIssuers: 1,
    });
    expect(repository.saveMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        classSemanticsValidated: true,
        quoteEvidence: [
          expect.objectContaining({ validationResult: "VALIDATED" }),
        ],
      }),
    );
  });

  it("marks cross-class quote-time mismatches as unavailable with evidence", async () => {
    const repository = repositoryFor([company("dual", ["PETR3", "PETR4"])]);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) =>
        quote(
          ticker,
          900,
          ticker === "PETR3" ? quoteTime : new Date(quoteTime.getTime() + 1),
        ),
      ),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      unavailableIssuers: 1,
    });
    expect(repository.saveMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        classSemanticsValidated: false,
        quoteEvidence: expect.arrayContaining([
          expect.objectContaining({ validationResult: "QUOTE_TIME_MISMATCH" }),
        ]),
      }),
    );
  });
  it("keeps all classes of each issuer together under the four-quote limit", async () => {
    const universe = [
      company("dual-a", ["AAA3", "AAA4"]),
      company("dual-b", ["BBB3", "BBB4"]),
      company("dual-c", ["CCC3", "CCC4"]),
    ];
    const repository = repositoryFor(universe);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) => quote(ticker)),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 2,
      batchSize: 2,
      remainingIssuers: 1,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledTimes(4);
    expect(repository.saveMarketSnapshot).toHaveBeenCalledTimes(2);
  });

  it("defers an oversized issuer intact when earlier issuers fill the batch", async () => {
    const universe = [
      company("first"),
      company("many", ["A3", "A4", "A5", "A6", "A7"]),
      company("next"),
    ];
    const repository = repositoryFor(universe);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) => quote(ticker)),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 1,
      remainingIssuers: 2,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledExactlyOnceWith("SLCE3");
    expect(repository.saveMarketSnapshot).toHaveBeenCalledOnce();
  });
  it("processes an oversized issuer alone and validates all classes before storing", async () => {
    const tickers = ["A3", "A4", "A5", "A6", "A7"];
    const repository = repositoryFor([
      company("many", tickers),
      company("next"),
    ]);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) => quote(ticker)),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 1,
      batchSize: 1,
      remainingIssuers: 1,
    });
    expect(
      provider.getQuoteByTicker.mock.calls.map(([ticker]) => ticker),
    ).toEqual(tickers);
    expect(repository.saveMarketSnapshot).toHaveBeenCalledOnce();
    expect(repository.saveMarketSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteEvidence: expect.arrayContaining([
          expect.objectContaining({ requestedTicker: "A7" }),
        ]),
      }),
    );
  });
  it("declines a batch when another market refresh holds the lease", async () => {
    const repository = repositoryFor([company("slc")]);
    repository.startMarketRefreshRun.mockResolvedValue(null);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
  });
  it("does not persist or cache transient provider failures and retries on the next run", async () => {
    const repository = repositoryFor([company("slc")]);
    const provider = {
      getQuoteByTicker: vi.fn().mockRejectedValue(new Error("network")),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledTimes(2);
    expect(repository.saveMarketSnapshot).not.toHaveBeenCalled();
    expect(repository.completeMarketRefreshRun).toHaveBeenCalledTimes(2);
    expect(repository.completeMarketRefreshRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "PARTIAL", unavailableIssuers: 1 }),
    );
  });

  it("handles non-Error provider failures without saving quote evidence", async () => {
    const repository = repositoryFor([company("slc")]);
    const provider = { getQuoteByTicker: vi.fn().mockRejectedValue("network") };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(repository.saveMarketSnapshot).not.toHaveBeenCalled();
    expect(repository.completeMarketRefreshRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PARTIAL", unavailableIssuers: 1 }),
    );
  });
  it("refreshes legacy snapshots without validated quote timestamps immediately", async () => {
    const legacyCompany = company("legacy", ["SLCE3"], {
      marketCap: null,
      observedAt: now,
      quoteObservedAt: null,
      sourceTicker: "SLCE3",
      classSemanticsValidated: false,
    });
    const repository = repositoryFor([legacyCompany]);
    const provider = {
      getQuoteByTicker: vi.fn().mockResolvedValue(quote("SLCE3")),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 1,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledOnce();
  });

  it("uses a one-hour retry cache only for completed semantic-invalid responses", async () => {
    const invalidCompany = company("invalid", ["SLCE3"], {
      marketCap: null,
      observedAt: now,
      quoteObservedAt: null,
      sourceTicker: "SLCE3",
      classSemanticsValidated: false,
      marketRefreshRunId: "market-run-old",
    });
    const repository = repositoryFor([invalidCompany]);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 0,
      skippedFreshIssuers: 1,
    });
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
  });
  it("skips a fresh validated market snapshot using both attempt and quote times", async () => {
    const freshCompany = company("fresh", ["SLCE3"], {
      marketCap: 1000,
      observedAt: now,
      quoteObservedAt: quoteTime,
      sourceTicker: "SLCE3",
      classSemanticsValidated: true,
      marketRefreshRunId: "market-run-old",
    });
    const repository = repositoryFor([freshCompany]);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 0,
      skippedFreshIssuers: 1,
    });
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
  });

  it("rejects a market refresh when another run already owns the lease", async () => {
    const repository = repositoryFor([company("slc")]);
    repository.startMarketRefreshRun.mockResolvedValue(null);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository, () => now);
    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
    expect(repository.completeMarketRefreshRun).not.toHaveBeenCalled();
  });
  it("limits each request to twenty issuers and reports the remaining stale batch", async () => {
    const universe = Array.from({ length: 21 }, (_, index) =>
      company(String(index)),
    );
    const repository = repositoryFor(universe);
    const provider = {
      getQuoteByTicker: vi.fn(async (ticker: string) => quote(ticker)),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 4,
      totalStaleIssuers: 21,
      remainingIssuers: 17,
    });
    expect(provider.getQuoteByTicker).toHaveBeenCalledTimes(4);
    expect(repository.saveMarketSnapshot).toHaveBeenCalledTimes(4);
  });

  it("uses the default clock for an empty eligible universe", async () => {
    const repository = repositoryFor([]);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository);

    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 0,
      remainingIssuers: 0,
    });
    expect(repository.startMarketRefreshRun).toHaveBeenCalledOnce();
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
  });

  it("handles an issuer with no stock classes without making external requests", async () => {
    const noClassCompany = company("missing-classes");
    noClassCompany.securities = [];
    const repository = repositoryFor([noClassCompany]);
    const provider = { getQuoteByTicker: vi.fn() };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).resolves.toMatchObject({
      attemptedIssuers: 1,
      unavailableIssuers: 1,
    });
    expect(provider.getQuoteByTicker).not.toHaveBeenCalled();
    expect(repository.saveMarketSnapshot).not.toHaveBeenCalled();
  });
  it("persists a partial run and stops when BRAPI rate limits the request", async () => {
    const repository = repositoryFor([company("slc")]);
    const provider = {
      getQuoteByTicker: vi
        .fn()
        .mockRejectedValue(new ApplicationError("Try later", 429, 30)),
    };
    const service = new ScreenerMarketService(provider, repository, () => now);

    await expect(service.refreshBatch()).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(repository.saveMarketSnapshot).not.toHaveBeenCalled();
    expect(repository.completeMarketRefreshRun).toHaveBeenCalledWith(
      expect.objectContaining({ attemptedIssuers: 1, status: "PARTIAL" }),
    );
  });

  it("returns the persisted market update and quote timestamps", async () => {
    const marketStatus = {
      latestRun: { status: "COMPLETED", startedAt: now },
      latestQuote: { quoteObservedAt: quoteTime, sourceTicker: "SLCE3" },
    };
    const repository = {
      ...repositoryFor([]),
      getMarketDataStatus: vi.fn().mockResolvedValue(marketStatus),
    };
    await expect(
      new ScreenerMarketService(undefined, repository).status(),
    ).resolves.toBe(marketStatus);
  });
});
