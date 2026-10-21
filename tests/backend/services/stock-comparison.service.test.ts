import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { StockAnalysisService } from "@/backend/services/stock-analysis.service";
import { StockComparisonService } from "@/backend/services/stock-comparison.service";

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const now = new Date();
type TestAnalysis = Awaited<
  ReturnType<StockAnalysisService["getFundamentalsByIssuer"]>
>;

function metadata(
  ticker: string,
  index: number,
  sector: string | null = "Petróleo e Gás",
  cnpj = `3300016700010${index}`,
) {
  return {
    ticker,
    subType: ticker.endsWith("11") ? "unit" : "stock",
    securityName: `${ticker} ON`,
    securityUpdatedAt: now,
    cnpj,
    cvmCode: String(index).padStart(6, "0"),
    issuerName: `Companhia ${ticker}`,
    sector,
    issuerMetadataUpdatedAt: now,
  };
}

function indicator(
  key: "roe" | "netMargin" | "pe" | "pb",
  value: number | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    key,
    value,
    unavailableReason:
      value === null
        ? key === "pe" || key === "pb"
          ? "Falta confirmar quantas ações de cada classe estão em circulação e alinhar esse total à data da cotação."
          : `Indisponível: ${key}.`
        : null,
    referenceDate: "2026-06-30",
    sourceDocument: "ITR" as const,
    periodBasis: "trailing_twelve_months" as const,
    marketDataDate:
      key === "pe" || key === "pb" ? "2026-10-06T15:00:00Z" : null,
    valuationSource: null,
    valuationMethod: null,
    ...overrides,
  };
}

function analysis(
  ticker: string,
  cnpj: string,
  overrides: Record<string, unknown> = {},
): TestAnalysis {
  const flow = {
    referenceDate: "2026-06-30",
    periodEnd: "2026-06-30",
    periodStart: "2025-07-01",
    filingReferenceDate: "2026-08-01",
    periodBasis: "trailing_twelve_months" as const,
    periodType: "interim" as const,
    sourceDocument: "ITR" as const,
    exerciseOrder: "last" as const,
    isDerived: true,
    revenue: "1000",
    revenueAccountLabel: "Receita de venda de bens e serviços",
    revenueVersion: "2",
    netIncome: "120",
    netIncomeVersion: "2",
    netIncomeAccount: "3.11",
    netIncomeConcept: "consolidated_net_income",
    parentNetIncome: null,
    parentNetIncomeVersion: null,
    parentNetIncomeAccount: null,
    parentNetIncomeConcept: null,
    nonControllingNetIncome: null,
    nonControllingNetIncomeVersion: null,
    nonControllingNetIncomeAccount: null,
    nonControllingNetIncomeConcept: null,
    equity: null,
    equityVersion: "2",
    equityAccount: "2.03",
    equityConcept: "consolidated_equity",
    nonControllingEquity: null,
    nonControllingEquityVersion: null,
    nonControllingEquityAccount: null,
    nonControllingEquityConcept: null,
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const sourcePeriods = [
    {
      ...flow,
      referenceDate: "2026-06-30",
      periodEnd: "2026-06-30",
      periodStart: "2026-01-01",
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      isDerived: false,
    },
    {
      ...flow,
      referenceDate: "2025-06-30",
      periodEnd: "2025-06-30",
      periodStart: "2025-01-01",
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      exerciseOrder: "previous" as const,
      isDerived: false,
    },
    {
      ...flow,
      referenceDate: "2025-12-31",
      periodEnd: "2025-12-31",
      periodStart: "2025-01-01",
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      isDerived: false,
    },
  ];
  return {
    ticker,
    cnpj,
    companyName: `Companhia ${ticker}`,
    price: 10,
    marketCap: 1000,
    priceUpdatedAt: "2026-10-06T15:00:00.000Z",
    changePercent: 0,
    history: [],
    fundamentals: [flow, ...sourcePeriods],
    indicators: [
      indicator("roe", 10),
      indicator("netMargin", 12),
      indicator("pe", 8),
      indicator("pb", 1.2, { periodBasis: "point_in_time" }),
    ],
    marketDataIdentityVerified: false,
    marketCapIdentityVerified: false,
    fundamentalsIsStale: false,
    fundamentalsFetchedAt: null,
    ...overrides,
  } as TestAnalysis;
}

function makeService(
  records: ReturnType<typeof metadata>[],
  getAnalysis: (ticker: string) => TestAnalysis = (ticker) =>
    analysis(
      ticker,
      records.find((record) => record.ticker === ticker)?.cnpj ?? "",
    ),
) {
  const repository = {
    getComparisonMetadata: vi.fn(async (tickers: string[]) =>
      records.filter((record) => tickers.includes(record.ticker)),
    ),
  };
  const stockAnalysis = {
    getFundamentalsByIssuer: vi.fn(async (ticker: string) =>
      getAnalysis(ticker),
    ),
    getFundamentalsRefreshState: vi.fn(async () => ({
      status: "running" as const,
      retryAfter: null,
      errorCode: null,
    })),
  };
  return {
    service: new StockComparisonService(repository, stockAnalysis),
    repository,
    stockAnalysis,
  };
}

describe("StockComparisonService", () => {
  it("loads comparison refresh status without reading fundamentals or quotes", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service, stockAnalysis } = makeService(records);

    const result = await service.getRefreshStatus({
      tickers: ["PETR3", "VALE3"],
    });

    expect(result.companies).toEqual([
      {
        ticker: "PETR3",
        fundamentalsRefresh: {
          status: "running",
          retryAfter: null,
          errorCode: null,
        },
      },
      {
        ticker: "VALE3",
        fundamentalsRefresh: {
          status: "running",
          retryAfter: null,
          errorCode: null,
        },
      },
    ]);
    expect(stockAnalysis.getFundamentalsByIssuer).not.toHaveBeenCalled();
    expect(stockAnalysis.getFundamentalsRefreshState).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid refresh status requests", async () => {
    const { service } = makeService([]);

    await expect(
      service.getRefreshStatus({ tickers: ["bad"] }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects refresh status when CVM identity is ambiguous", async () => {
    const { service } = makeService([
      metadata("PETR3", 1),
      metadata("PETR3", 2),
      metadata("VALE3", 3),
    ]);

    await expect(
      service.getRefreshStatus({ tickers: ["PETR3", "VALE3"] }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects refresh status when an issuer has no matching CVM identity", async () => {
    const { service } = makeService([metadata("PETR3", 1)]);

    await expect(
      service.getRefreshStatus({ tickers: ["PETR3", "VALE3"] }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("compares same-sector nonfinancial fundamentals in selection order and keeps valuation separate", async () => {
    const records = [metadata("PETR3", 1), metadata("PETR4", 2)];
    const { service } = makeService(records);

    const result = await service.compare({ tickers: ["PETR4", "PETR3"] });

    expect(result.companies.map((company) => company.ticker)).toEqual([
      "PETR4",
      "PETR3",
    ]);
    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: 10,
      referenceDate: "2026-06-30",
      periodStart: "2025-07-01",
      periodBasis: "trailing_twelve_months",
      sourceSummary: "DFP 2025 + ITR acumulado 2026 − comparativo 2025",
      accountProvenance: "CVM consolidado · lucro 3.11 · patrimônio 2.03",
      unavailableReason: null,
    });
    expect(result.companies[0]?.fundamentals.netMargin.value).toBe(12);
    expect(result.companies[0]?.valuation.pe).toMatchObject({
      value: null,
      marketDataDate: "2026-10-06T15:00:00.000Z",
    });
    expect(result.companies.map((company) => company.ticker)).toEqual([
      "PETR4",
      "PETR3",
    ]);
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(
      /ranking|score|recommendation/,
    );
  });

  it("reuses valuation only with a reconciled cap and same market day", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          marketDataIdentityVerified: true,
          marketCapIdentityVerified: true,
          indicators: analysis(
            ticker,
            records.find((record) => record.ticker === ticker)!.cnpj,
          ).indicators.map((item) =>
            item.key === "pe" || item.key === "pb"
              ? {
                  ...item,
                  marketDataDate:
                    ticker === "VALE3"
                      ? "2026-10-07T01:30:00Z"
                      : "2026-10-06T15:00:00Z",
                  valuationSource: "validated_issuer_market_cap",
                  valuationMethod:
                    item.key === "pe"
                      ? "market_cap / consolidated_net_income"
                      : "market_cap / consolidated_equity",
                }
              : item,
          ),
        },
      ),
    );

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.valuation.pe).toMatchObject({
      value: 8,
      referenceDate: "2026-06-30",
      marketDataDate: "2026-10-06T15:00:00Z",
      valuationSource: "validated_issuer_market_cap",
      valuationMethod: "market_cap / consolidated_net_income",
      unavailableReason: null,
    });
    expect(result.companies[0]?.valuation.pb.value).toBe(1.2);
  });

  it("retains individually valid valuation when candidates have different market days", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          marketDataIdentityVerified: true,
          marketCapIdentityVerified: true,
          indicators: analysis(
            ticker,
            records.find((record) => record.ticker === ticker)!.cnpj,
          ).indicators.map((item) =>
            item.key === "pe" || item.key === "pb"
              ? {
                  ...item,
                  marketDataDate:
                    ticker === "VALE3"
                      ? "2026-10-07T03:30:00Z"
                      : "2026-10-06T15:00:00Z",
                  valuationSource: "validated_issuer_market_cap",
                  valuationMethod: "validated_method",
                }
              : item,
          ),
        },
      ),
    );

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    for (const company of result.companies) {
      expect(company.valuation.pe).toMatchObject({
        value: 8,
        unavailableReason: null,
        comparisonStatus: "not_comparable",
        comparisonReason: expect.any(String),
      });
      expect(company.valuation.pb).toMatchObject({
        value: 1.2,
        unavailableReason: null,
        comparisonStatus: "not_comparable",
      });
    }
  });

  it("marks valuations incomparable when their CVM bases differ on one market day", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const record = records.find((item) => item.ticker === ticker)!;
      const base = analysis(ticker, record.cnpj, {
        marketDataIdentityVerified: true,
        marketCapIdentityVerified: true,
      });
      return {
        ...base,
        indicators: base.indicators.map((item) =>
          item.key === "pe" || item.key === "pb"
            ? {
                ...item,
                referenceDate:
                  ticker === "VALE3" ? "2025-12-31" : item.referenceDate,
                marketDataDate: "2026-10-06T15:00:00Z",
                valuationSource: "validated_issuer_market_cap",
                valuationMethod: "validated_method",
              }
            : item,
        ),
      };
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    for (const company of result.companies) {
      expect(company.valuation.pe).toMatchObject({
        value: 8,
        unavailableReason: null,
        comparisonStatus: "not_comparable",
        comparisonReason: expect.stringContaining(
          "bases ou datas CVM diferentes",
        ),
      });
    }
  });

  it("rejects valuation dates that are missing or malformed", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const record = records.find((item) => item.ticker === ticker)!;
      const result = analysis(ticker, record.cnpj, {
        marketDataIdentityVerified: true,
        marketCapIdentityVerified: true,
      });
      return {
        ...result,
        indicators: result.indicators.map((item) =>
          item.key === "pe" || item.key === "pb"
            ? {
                ...item,
                marketDataDate: ticker === "PETR3" ? null : "invalid-date",
                valuationSource: "validated_issuer_market_cap",
                valuationMethod: "validated_method",
              }
            : item,
        ),
      };
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies.map(({ valuation }) => valuation.pe.value)).toEqual(
      [null, null],
    );
  });

  it("rejects a market date when the formatter omits required date parts", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const record = records.find((item) => item.ticker === ticker)!;
      const result = analysis(ticker, record.cnpj, {
        marketDataIdentityVerified: true,
        marketCapIdentityVerified: true,
      });
      return {
        ...result,
        indicators: result.indicators.map((item) =>
          item.key === "pe" || item.key === "pb"
            ? {
                ...item,
                valuationSource: "validated_issuer_market_cap",
                valuationMethod: "validated_method",
              }
            : item,
        ),
      };
    });
    const formatToParts = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([]);

    try {
      const result = await service.compare({ tickers: ["PETR3", "VALE3"] });
      expect(
        result.companies.map(({ valuation }) => valuation.pe.value),
      ).toEqual([null, null]);
    } finally {
      formatToParts.mockRestore();
    }
  });

  it("retains individual P/E and P/VP when candidates use different CVM bases", async () => {
    const records = [
      metadata("PETR3", 1),
      metadata("VALE3", 2),
      metadata("ABEV3", 3),
    ];
    const { service } = makeService(records, (ticker) => {
      const result = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          marketDataIdentityVerified: true,
          marketCapIdentityVerified: true,
          indicators: analysis(
            ticker,
            records.find((record) => record.ticker === ticker)!.cnpj,
          ).indicators.map((item) =>
            item.key === "pe" || item.key === "pb"
              ? {
                  ...item,
                  valuationSource: "validated_issuer_market_cap",
                  valuationMethod: "validated_method",
                }
              : item,
          ),
        },
      );
      if (ticker === "ABEV3")
        return {
          ...result,
          indicators: result.indicators.map((item) =>
            item.key === "pe" || item.key === "pb"
              ? { ...item, value: null, unavailableReason: null }
              : item,
          ),
        };
      if (ticker !== "VALE3") return result;
      return {
        ...result,
        indicators: result.indicators.map((item) =>
          item.key === "pe"
            ? {
                ...item,
                referenceDate: "2025-12-31",
                sourceDocument: "DFP" as const,
                periodBasis: "annual" as const,
              }
            : item.key === "pb"
              ? { ...item, referenceDate: "2025-06-30" }
              : item,
        ),
      };
    });

    const result = await service.compare({
      tickers: ["PETR3", "VALE3", "ABEV3"],
    });

    for (const company of result.companies.slice(0, 2)) {
      expect(company.valuation.pe).toMatchObject({
        value: 8,
        unavailableReason: null,
        comparisonStatus: "not_comparable",
        comparisonReason: expect.any(String),
      });
      expect(company.valuation.pb).toMatchObject({
        value: 1.2,
        unavailableReason: null,
        comparisonStatus: "not_comparable",
      });
    }
    expect(result.companies[2]?.valuation.pe.value).toBeNull();
    expect(result.companies[2]?.valuation.pe.comparisonStatus).toBe(
      "not_comparable",
    );
  });
  it("does not present a stale CVM cache as a current comparison value", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const result = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        { fundamentalsIsStale: ticker === "PETR3" },
      );
      return ticker === "PETR3"
        ? {
            ...result,
            indicators: result.indicators.filter(
              (item) => item.key !== "pe" && item.key !== "pb",
            ),
          }
        : result;
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: null,
      unavailableReason:
        "Demonstrativos CVM desatualizados; o indicador não foi apresentado como atual.",
    });
    expect(result.companies[0]?.valuation.pe).toMatchObject({
      value: null,
      unavailableReason:
        "Demonstrativos CVM desatualizados; o indicador não foi apresentado como atual.",
    });
  });

  it("rejects invalid ticker selection shapes", async () => {
    const { service, repository } = makeService([]);
    for (const tickers of [
      [],
      ["PETR3"],
      ["PETR3", "PETR4", "VALE3", "ITUB4", "BBAS3", "BBDC4"],
      ["PETR3", "PETR3"],
      ["bad", "VALE3"],
    ]) {
      await expect(service.compare({ tickers })).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(repository.getComparisonMetadata).not.toHaveBeenCalled();
  });

  it("deduplicates share classes by normalized CNPJ while retaining their selected tickers", async () => {
    const sharedCnpj = "33000167000101";
    const records = [
      metadata("PETR3", 1, "Petróleo e Gás", sharedCnpj),
      metadata("PETR4", 1, "Petróleo e Gás", "33.000.167/0001-01"),
      metadata("VALE3", 2, "Petróleo e Gás", "33000167000102"),
    ];
    const { service, stockAnalysis } = makeService(records);

    const result = await service.compare({
      tickers: ["PETR3", "PETR4", "VALE3"],
    });

    expect(result.companies).toHaveLength(2);
    expect(result.companies[0]?.selectedTickers).toEqual(["PETR3", "PETR4"]);
    expect(stockAnalysis.getFundamentalsByIssuer).toHaveBeenCalledTimes(2);
    expect(stockAnalysis.getFundamentalsByIssuer).toHaveBeenCalledWith(
      "PETR3",
      sharedCnpj,
      undefined,
    );
    expect(result.companies.map((company) => company.ticker)).toEqual([
      "PETR3",
      "VALE3",
    ]);
  });

  it("supports five distinct issuers in requested order without ranking", async () => {
    const records = [
      metadata("PETR3", 1),
      metadata("VALE3", 2),
      metadata("ABEV3", 3),
      metadata("WEGE3", 4),
      metadata("ITSA4", 5),
    ];
    const { service } = makeService(records);
    const tickers = ["WEGE3", "PETR3", "ITSA4", "VALE3", "ABEV3"];

    const result = await service.compare({ tickers });

    expect(result.companies.map((company) => company.ticker)).toEqual(tickers);
    expect(result.companies).toHaveLength(5);
    expect(result.companies.every((company) => !("rank" in company))).toBe(
      true,
    );
  });

  it("returns nullable sector metadata and safe transport errors", async () => {
    const records = [metadata("PETR3", 1, null), metadata("VALE3", 2, null)];
    const { service } = makeService(records, (ticker) => {
      if (ticker === "VALE3") throw new Error("private transport failure");
      return analysis(ticker, records[0]!.cnpj);
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.sector).toBeNull();
    expect(result.sectorMetadataAsOf).toBe(now.toISOString());
    expect(result.companies[0]?.valuation.pe.unavailableReason).toContain(
      "setor CVM deste emissor",
    );
    expect(result.companies[1]?.fundamentals.roe.unavailableReason).toContain(
      "Não foi possível consultar os dados",
    );
  });

  it("requires at least two distinct issuers after share-class deduplication", async () => {
    const cnpj = "33000167000101";
    const { service, stockAnalysis } = makeService([
      metadata("PETR3", 1, "Petróleo e Gás", cnpj),
      metadata("PETR4", 1, "Petróleo e Gás", cnpj),
    ]);
    await expect(
      service.compare({ tickers: ["PETR3", "PETR4"] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(stockAnalysis.getFundamentalsByIssuer).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing", records: [] },
    { label: "unresolved peer", records: [metadata("PETR3", 1)] },
    {
      label: "ambiguous",
      records: [metadata("PETR3", 1), metadata("PETR3", 2)],
    },
    {
      label: "malformed CNPJ",
      records: [
        metadata("PETR3", 1, "Petróleo e Gás", "invalid"),
        metadata("VALE3", 2),
      ],
    },
  ])(
    "fails closed when a ticker has $label CVM metadata",
    async ({ records }) => {
      const { service } = makeService(records);
      await expect(
        service.compare({ tickers: ["PETR3", "VALE3"] }),
      ).rejects.toBeInstanceOf(ApplicationError);
    },
  );

  it("returns per-cell identity mismatch reasons when ticker CNPJ differs from CVM metadata", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) =>
      analysis(
        ticker,
        ticker === "PETR3" ? "99000167000101" : records[1]!.cnpj,
      ),
    );

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.identityVerified).toBe(false);
    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("CNPJ"),
    });
    expect(result.companies[1]?.fundamentals.roe).toMatchObject({
      value: 10,
      comparisonStatus: "not_comparable",
      comparisonReason: expect.any(String),
    });

    const missingCnpj = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        { cnpj: null },
      ),
    );
    const missingCnpjResult = await missingCnpj.service.compare({
      tickers: ["PETR3", "VALE3"],
    });
    expect(missingCnpjResult.companies[0]?.identityVerified).toBe(false);
  });

  it("calculates CVM ROE when the market provider is unavailable", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const rows = records.flatMap((record) => {
      const common = {
        id: record.ticker,
        ticker: record.ticker,
        cnpj: record.cnpj,
        sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
        fetchedAt: now,
        revenue: "1000",
        revenueVersion: "2",
        revenueAccountLabel: "Receita de vendas",
        netIncomeVersion: "2",
        netIncomeConcept: "consolidated_net_income",
        parentNetIncome: null,
        parentNetIncomeVersion: null,
        parentNetIncomeAccount: null,
        parentNetIncomeConcept: null,
        nonControllingNetIncome: null,
        nonControllingNetIncomeVersion: null,
        nonControllingNetIncomeAccount: null,
        nonControllingNetIncomeConcept: null,
        equityVersion: "2",
        equityConcept: "consolidated_equity",
        nonControllingEquity: null,
        nonControllingEquityVersion: null,
        nonControllingEquityAccount: null,
        nonControllingEquityConcept: null,
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      };
      return [
        {
          ...common,
          referenceDate: "2025-12-31",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          filingReferenceDate: "2026-03-20",
          exerciseOrder: "last",
          periodBasis: "annual",
          periodType: "annual",
          sourceDocument: "DFP",
          netIncome: "100",
          netIncomeAccount: "3.11",
          equity: "1000",
          equityAccount: "2.07",
        },
        {
          ...common,
          referenceDate: "2026-06-30",
          periodStart: "2026-01-01",
          periodEnd: "2026-06-30",
          filingReferenceDate: "2026-08-01",
          exerciseOrder: "last",
          periodBasis: "year_to_date",
          periodType: "interim",
          sourceDocument: "ITR",
          netIncome: "60",
          netIncomeAccount: "3.11",
          equity: "1100",
          equityAccount: "2.07",
        },
        {
          ...common,
          referenceDate: "2025-06-30",
          periodStart: "2025-01-01",
          periodEnd: "2025-06-30",
          filingReferenceDate: "2026-08-01",
          exerciseOrder: "previous",
          periodBasis: "year_to_date",
          periodType: "interim",
          sourceDocument: "ITR",
          netIncome: "50",
          netIncomeAccount: "3.11",
          equity: "1000",
          equityAccount: "2.07",
        },
      ];
    });
    const marketProvider = {
      getByTicker: vi.fn().mockRejectedValue(new Error("Brapi indisponÃ­vel")),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn() };
    const fundamentalsRepository = {
      listByTicker: vi.fn(async (ticker: string) =>
        rows.filter((row) => row.ticker === ticker),
      ),
      save: vi.fn(),
    };
    const analysisService = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      fundamentalsRepository,
    );
    const comparisonRepository = {
      getComparisonMetadata: vi.fn(async (tickers: string[]) =>
        records.filter((record) => tickers.includes(record.ticker)),
      ),
    };
    const service = new StockComparisonService(
      comparisonRepository,
      analysisService,
    );

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(
      result.companies.map((company) => company.fundamentals.roe.value),
    ).toEqual([
      expect.closeTo((110 / 1050) * 100),
      expect.closeTo((110 / 1050) * 100),
    ]);
    expect(result.companies[0]?.valuation.pe.unavailableReason).toContain(
      "Data-base de mercado",
    );
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
    expect(fundamentalsRepository.listByTicker).toHaveBeenCalledTimes(2);
  });

  it("requires an exact normalized CVM sector match across peers", async () => {
    const { service } = makeService([
      metadata("PETR3", 1, "Petróleo e Gás"),
      metadata("VALE3", 2, "Extração Mineral"),
    ]);

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(
      result.companies.map((company) => company.fundamentals.roe.value),
    ).toEqual([10, 10]);
    expect(
      result.companies.every(
        (company) =>
          company.fundamentals.roe.comparisonStatus === "not_comparable" &&
          company.fundamentals.roe.comparisonReason !== null,
      ),
    ).toBe(true);
  });

  it("normalizes accents and whitespace but does not substitute broad sector classifications", async () => {
    const { service } = makeService([
      metadata("PETR3", 1, "Petróleo e Gás"),
      metadata("VALE3", 2, "Petroleo   e Gas"),
    ]);
    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });
    expect(result.companies[0]?.fundamentals.roe.value).toBe(10);

    const holdings = makeService([
      metadata("PETR3", 3, "Emp. Adm. Part. - Petróleo e Gás"),
      metadata("VALE3", 4, "Emp. Adm. Part. - Petróleo e Gás"),
    ]);
    const holdingResult = await holdings.service.compare({
      tickers: ["PETR3", "VALE3"],
    });
    expect(holdingResult.companies[0]?.fundamentals.roe).toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("não possui metodologia"),
    });
  });

  it("uses only compatible account provenance and period basis for nonfinancial peers", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          fundamentals: analysis(ticker, records[0]!.cnpj).fundamentals.map(
            (period, index) => ({
              ...period,
              ...(index === 0 && ticker === "VALE3"
                ? {
                    referenceDate: "2025-12-31",
                    periodEnd: "2025-12-31",
                  }
                : {}),
            }),
          ),
          indicators: [
            indicator(
              "roe",
              10,
              ticker === "VALE3"
                ? {
                    referenceDate: "2025-12-31",
                    sourceDocument: "DFP",
                    periodBasis: "annual",
                  }
                : {},
            ),
            indicator("netMargin", 12),
            indicator("pe", 8),
            indicator("pb", 1.2),
          ],
        },
      ),
    );
    const dateMismatch = await service.compare({ tickers: ["PETR3", "VALE3"] });
    expect(dateMismatch.companies[0]?.fundamentals.roe).toMatchObject({
      value: 10,
      unavailableReason: null,
      comparisonStatus: "not_comparable",
      comparisonReason: expect.any(String),
    });
    expect(dateMismatch.companies[1]?.fundamentals.roe.value).toBe(10);
    const codeVariation = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          fundamentals: analysis(ticker, records[0]!.cnpj).fundamentals.map(
            (period) => ({
              ...period,
              netIncomeAccount: ticker === "VALE3" ? "3.09" : "3.11",
              equityAccount: ticker === "VALE3" ? "2.07" : "2.08",
            }),
          ),
        },
      ),
    );
    const codeResult = await codeVariation.service.compare({
      tickers: ["PETR3", "VALE3"],
    });
    expect(
      codeResult.companies.map((company) => company.fundamentals.roe.value),
    ).toEqual([10, 10]);
    expect(
      codeResult.companies[0]?.fundamentals.roe.accountProvenance,
    ).toContain("3.11");
    expect(
      codeResult.companies[1]?.fundamentals.roe.accountProvenance,
    ).toContain("3.09");

    const semanticMismatch = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          fundamentals: analysis(ticker, records[0]!.cnpj).fundamentals.map(
            (period, index) => ({
              ...period,
              ...(ticker === "VALE3" && index === 0
                ? { equityConcept: "other_equity" }
                : {}),
            }),
          ),
        },
      ),
    );
    const semanticResult = await semanticMismatch.service.compare({
      tickers: ["PETR3", "VALE3"],
    });
    expect(semanticResult.companies[0]?.fundamentals.roe.value).toBe(10);
    expect(semanticResult.companies[1]?.fundamentals.roe.value).toBeNull();
    expect(semanticResult.companies[0]?.fundamentals.roe.comparisonStatus).toBe(
      "not_comparable",
    );
  });

  it("keeps valid net margins when peer revenue account semantics differ", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const base = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
      );
      if (ticker !== "VALE3") return base;

      return {
        ...base,
        fundamentals: base.fundamentals.map((period) => ({
          ...period,
          revenueAccountLabel: "Receita de prestação de serviços",
        })),
      };
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });
    const margins = result.companies.map(
      (company) => company.fundamentals.netMargin,
    );

    expect(margins.map((margin) => margin.value)).toEqual([12, 12]);
    expect(
      margins.every(
        (margin) =>
          margin.unavailableReason === null &&
          margin.comparisonStatus === "not_comparable" &&
          margin.comparisonReason?.includes("origem semântica"),
      ),
    ).toBe(true);
  });

  it("allows zero as a valid metric value and distinguishes it from missing values", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) =>
      analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          indicators: [
            indicator("roe", 0),
            indicator("netMargin", ticker === "PETR3" ? 0 : null),
            indicator("pe", 8),
            indicator("pb", 1.2),
          ],
        },
      ),
    );

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.fundamentals.roe.value).toBe(0);
    expect(result.companies[1]?.fundamentals.netMargin).toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("netMargin"),
    });
  });

  it("rejects an LTM comparison when calculated flow windows differ", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const base = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
      );
      return ticker === "VALE3"
        ? {
            ...base,
            fundamentals: base.fundamentals.map((period, index) =>
              index === 0 ? { ...period, periodStart: "2025-06-01" } : period,
            ),
          }
        : base;
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: 10,
      unavailableReason: null,
      comparisonStatus: "not_comparable",
      comparisonReason: expect.any(String),
    });
    expect(result.companies[1]?.fundamentals.roe.value).toBe(10);
  });

  it("fails closed when the LTM documents or account mapping cannot be reconciled", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const variants = [
      (periods: ReturnType<typeof analysis>["fundamentals"]) =>
        periods.filter((_, index) => index !== 2),
      (periods: ReturnType<typeof analysis>["fundamentals"]) =>
        periods.map((period, index) =>
          index === 1
            ? { ...period, netIncomeConcept: "other_net_income" }
            : period,
        ),
      (periods: ReturnType<typeof analysis>["fundamentals"]) =>
        periods.map((period, index) =>
          index === 3 ? { ...period, netIncomeConcept: null } : period,
        ),
      (periods: ReturnType<typeof analysis>["fundamentals"]) =>
        periods.map((period, index) =>
          index === 3 ? { ...period, netIncomeAccount: "1.01" } : period,
        ),
      (periods: ReturnType<typeof analysis>["fundamentals"]) =>
        periods.map((period, index) =>
          index === 2 ? { ...period, netIncomeAccount: "3.09" } : period,
        ),
    ];

    for (const changePeriods of variants) {
      const { service } = makeService(records, (ticker) => {
        const base = analysis(
          ticker,
          records.find((record) => record.ticker === ticker)!.cnpj,
        );
        return { ...base, fundamentals: changePeriods(base.fundamentals) };
      });
      const result = await service.compare({ tickers: ["PETR3", "VALE3"] });
      expect(result.companies[0]?.fundamentals.roe).toMatchObject({
        value: null,
        unavailableReason: expect.stringContaining(
          "confirmar os documentos e períodos",
        ),
      });
    }

    const missingIndicatorService = makeService(records, (ticker) => {
      const base = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
      );
      return {
        ...base,
        indicators: base.indicators.filter((item) => item.key !== "roe"),
      };
    });
    const missingIndicatorResult =
      await missingIndicatorService.service.compare({
        tickers: ["PETR3", "VALE3"],
      });
    expect(
      missingIndicatorResult.companies[0]?.fundamentals.roe.value,
    ).toBeNull();
  });

  it("keeps missing or semantically incomplete metric provenance unavailable", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const variants = [
      {
        metric: "roe" as const,
        change: (base: ReturnType<typeof analysis>) => ({
          ...base,
          indicators: base.indicators.map((item) =>
            item.key === "roe" ? { ...item, referenceDate: null } : item,
          ),
        }),
      },
      {
        metric: "roe" as const,
        change: (base: ReturnType<typeof analysis>) => ({
          ...base,
          fundamentals: base.fundamentals.map((period, index) =>
            index === 0 ? { ...period, equityAccount: null } : period,
          ),
        }),
      },
      {
        metric: "netMargin" as const,
        change: (base: ReturnType<typeof analysis>) => ({
          ...base,
          fundamentals: base.fundamentals.map((period, index) =>
            index === 0 ? { ...period, revenueAccountLabel: null } : period,
          ),
        }),
      },
      {
        metric: "roe" as const,
        change: (base: ReturnType<typeof analysis>) => ({
          ...base,
          fundamentals: base.fundamentals.map((period, index) =>
            index === 0 ? { ...period, filingReferenceDate: null } : period,
          ),
        }),
      },
      {
        metric: "netMargin" as const,
        change: (base: ReturnType<typeof analysis>) => ({
          ...base,
          fundamentals: base.fundamentals.map((period, index) =>
            index === 1
              ? { ...period, revenueAccountLabel: "Receita incompatível" }
              : period,
          ),
        }),
      },
    ];

    for (const variant of variants) {
      const { service } = makeService(records, (ticker) =>
        variant.change(
          analysis(
            ticker,
            records.find((record) => record.ticker === ticker)!.cnpj,
          ),
        ),
      );
      const result = await service.compare({ tickers: ["PETR3", "VALE3"] });
      expect(
        result.companies[0]?.fundamentals[variant.metric].value,
      ).toBeNull();
    }
  });

  it("uses the explicit annual source basis when no LTM indicator is available", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      const base = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
      );
      const annual = { ...base.fundamentals[3]!, periodStart: null };
      return {
        ...base,
        fundamentals: [annual],
        indicators: base.indicators.map((item) =>
          item.key === "roe"
            ? {
                ...item,
                referenceDate: "2025-12-31",
                sourceDocument: "DFP",
                periodBasis: "annual",
              }
            : item,
        ),
      };
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: 10,
      periodBasis: "annual",
      sourceSummary: "CVM DFP",
    });
  });

  it("restricts Banco ROE to the approved consolidated LTM concept and mapped account families", async () => {
    const records = [
      metadata("ITUB4", 1, "Bancos"),
      metadata("SANB11", 2, "Bancos", "90400888000142"),
    ];
    const { service } = makeService(records, (ticker) => {
      const account = "3.09";
      const equityAccount = ticker === "ITUB4" ? "2.07" : "2.08";
      return analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
        {
          fundamentals: analysis(ticker, records[0]!.cnpj).fundamentals.map(
            (period, index) => ({
              ...period,
              netIncomeAccount:
                ticker === "SANB11" && index === 3 ? "3.11" : account,
              equityAccount,
            }),
          ),
        },
      );
    });

    const result = await service.compare({ tickers: ["ITUB4", "SANB11"] });

    expect(result.companies[0]?.fundamentals.roe.value).toBe(10);
    expect(result.companies[1]?.fundamentals.roe).toMatchObject({
      value: 10,
      sourceSummary: "DFP 2025 + ITR acumulado 2026 − comparativo 2025",
    });
    expect(
      result.companies[0]?.fundamentals.netMargin.unavailableReason,
    ).toContain("Margem bancária sem definição comparável aprovada.");
    const invalidBankAccounts = makeService(records, (ticker) => {
      const base = analysis(
        ticker,
        records.find((record) => record.ticker === ticker)!.cnpj,
      );
      return {
        ...base,
        fundamentals: base.fundamentals.map((period, index) =>
          index === 0 ? { ...period, equityAccount: "2.99" } : period,
        ),
      };
    });
    const invalidResult = await invalidBankAccounts.service.compare({
      tickers: ["ITUB4", "SANB11"],
    });
    expect(invalidResult.companies[0]?.fundamentals.roe).toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining("ROE banc"),
    });
  });

  it.each([
    ["Seguradoras e Corretoras", "BBSE3", "CXSE3"],
    ["Intermediação Financeira", "ITUB4", "BBDC4"],
  ])(
    "keeps unsupported financial sector %s unavailable",
    async (sector, first, second) => {
      const { service } = makeService([
        metadata(first, 1, sector),
        metadata(second, 2, sector),
      ]);

      const result = await service.compare({ tickers: [first, second] });

      expect(result.companies[0]?.fundamentals.roe).toMatchObject({
        value: null,
        unavailableReason: expect.stringContaining(
          "não permite atribuir métricas",
        ),
      });
    },
  );

  it("keeps a peer group partially unavailable when one normalized analysis fails", async () => {
    const records = [metadata("PETR3", 1), metadata("VALE3", 2)];
    const { service } = makeService(records, (ticker) => {
      if (ticker === "VALE3")
        throw new ApplicationError("CVM indisponível.", 502);
      return analysis(ticker, records[0]!.cnpj);
    });

    const result = await service.compare({ tickers: ["PETR3", "VALE3"] });

    expect(result.companies[0]?.fundamentals.roe).toMatchObject({
      value: 10,
      accountProvenance: expect.stringContaining("CVM consolidado"),
      comparisonStatus: "not_comparable",
      comparisonReason: expect.any(String),
    });
    expect(result.companies[1]?.fundamentals.roe.unavailableReason).toBe(
      "CVM indisponível.",
    );
  });
});
