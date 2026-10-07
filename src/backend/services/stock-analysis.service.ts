import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import type { FundamentalsProvider } from "@/backend/providers/fundamentals.provider";
import type {
  MarketData,
  MarketDataProvider,
} from "@/backend/providers/market-data.provider";
import {
  stockFundamentalsRepository,
  type StockFundamentalsRepository,
} from "@/backend/repositories/stock-fundamentals.repository";
import {
  screenerRepository,
  type ScreenerRepository,
} from "@/backend/repositories/screener.repository";
import { logger } from "@/infrastructure/logging/logger";

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}[0-9]{1,2}$/, "Informe um ticker B3 válido.");
const cacheDurationMs = 1000 * 60 * 60 * 24;
const quoteFreshnessMs = 7 * 24 * 60 * 60 * 1000;

function numericValue(value: string | null) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCnpj(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function hasCachedPeriodProvenance(
  period: Awaited<
    ReturnType<StockFundamentalsRepository["listByTicker"]>
  >[number],
) {
  const start = period.periodStart;
  const end = period.periodEnd ?? period.referenceDate;
  const basis = period.periodBasis;
  if (
    !validIsoDate(period.referenceDate) ||
    !validIsoDate(end) ||
    !validIsoDate(period.filingReferenceDate) ||
    !["DFP", "ITR"].includes(period.sourceDocument) ||
    (start !== null && start !== undefined && !validIsoDate(start)) ||
    period.referenceDate !== end ||
    !["last", "previous"].includes(period.exerciseOrder ?? "") ||
    (period.sourceDocument === "DFP" &&
      (period.periodType !== "annual" || basis !== "annual")) ||
    (period.sourceDocument === "ITR" &&
      (period.periodType !== "interim" ||
        !["year_to_date", "quarterly"].includes(basis ?? "")))
  )
    return false;
  if (
    period.revenue !== null &&
    (!period.revenueVersion || !period.revenueAccountLabel?.trim())
  )
    return false;
  if (
    period.netIncome !== null &&
    (!period.netIncomeVersion ||
      !period.netIncomeAccount ||
      !period.netIncomeConcept)
  )
    return false;
  if (
    period.equity !== null &&
    (!period.equityVersion || !period.equityAccount || !period.equityConcept)
  )
    return false;
  return true;
}

function validatedCachedFundamentals(
  cached: Awaited<ReturnType<StockFundamentalsRepository["listByTicker"]>>,
  expectedCnpj: string,
) {
  if (cached.length === 0) return null;
  if (expectedCnpj.length !== 14) return null;
  const first = cached[0]!;
  const fetchedAt = first.fetchedAt;
  if (
    normalizeCnpj(first.cnpj) !== expectedCnpj ||
    !first.sourceVersion ||
    !(fetchedAt instanceof Date) ||
    !Number.isFinite(fetchedAt.getTime()) ||
    cached.some(
      (period) =>
        normalizeCnpj(period.cnpj) !== expectedCnpj ||
        period.sourceVersion !== first.sourceVersion ||
        !(period.fetchedAt instanceof Date) ||
        period.fetchedAt.getTime() !== fetchedAt.getTime() ||
        !hasCachedPeriodProvenance(period),
    )
  )
    return null;
  return { periods: normalizeCachedPeriods(cached), fetchedAt };
}

function validLastObservedQuote(
  quote: Awaited<
    ReturnType<ScreenerRepository["getValidatedAnalysisQuote"]>
  > | null,
  ticker: string,
  expectedCnpj: string | null,
  now: number,
) {
  if (
    !quote ||
    quote.ticker !== ticker ||
    quote.returnedTicker !== ticker ||
    !quote.issuerCnpj ||
    (expectedCnpj !== null &&
      normalizeCnpj(quote.issuerCnpj) !== expectedCnpj) ||
    quote.price === null ||
    !Number.isFinite(Number(quote.price)) ||
    Number(quote.price) <= 0 ||
    quote.marketCap === null ||
    !Number.isFinite(Number(quote.marketCap)) ||
    Number(quote.marketCap) <= 0 ||
    quote.snapshotMarketCap === null ||
    Number(quote.snapshotMarketCap) !== Number(quote.marketCap) ||
    quote.quoteObservedAt === null ||
    quote.snapshotQuoteObservedAt === null ||
    quote.quoteObservedAt.getTime() !==
      quote.snapshotQuoteObservedAt.getTime() ||
    !Number.isFinite(quote.quoteObservedAt.getTime()) ||
    !Number.isFinite(quote.snapshotObservedAt.getTime())
  )
    return false;
  const quoteAge = now - quote.quoteObservedAt.getTime();
  const snapshotAge = now - quote.snapshotObservedAt.getTime();
  return (
    quoteAge >= 0 &&
    quoteAge <= quoteFreshnessMs &&
    snapshotAge >= 0 &&
    snapshotAge <= quoteFreshnessMs
  );
}

function normalizeCachedPeriods(
  cached: Awaited<ReturnType<StockFundamentalsRepository["listByTicker"]>>,
): FundamentalPeriod[] {
  return deduplicateFundamentalPeriods(
    cached.map(
      ({ sourceDocument, fetchedAt, cnpj, sourceVersion, ...period }) => ({
        ...period,
        periodEnd: period.periodEnd ?? period.referenceDate,
        periodType: period.periodType as "annual" | "interim",
        sourceDocument: sourceDocument as "DFP" | "ITR",
        exerciseOrder:
          period.exerciseOrder === "previous" ? "previous" : "last",
        periodBasis:
          period.periodBasis === "annual" ||
          period.periodBasis === "year_to_date" ||
          period.periodBasis === "quarterly" ||
          period.periodBasis === "trailing_twelve_months" ||
          period.periodBasis === "unknown"
            ? period.periodBasis
            : "unknown",
        isDerived: false,
      }),
    ),
  );
}

function deduplicateFundamentalPeriods(periods: FundamentalPeriod[]) {
  const latestByPeriod = new Map<string, FundamentalPeriod>();
  for (const period of periods) {
    const key = [
      period.sourceDocument,
      period.periodStart ?? "",
      period.periodEnd,
      period.exerciseOrder,
    ].join(":");
    const existing = latestByPeriod.get(key);
    if (!existing) {
      latestByPeriod.set(key, period);
      continue;
    }
    const filingReferenceDate = period.filingReferenceDate ?? "";
    const existingFilingReferenceDate = existing.filingReferenceDate ?? "";
    if (filingReferenceDate > existingFilingReferenceDate)
      latestByPeriod.set(key, period);
  }
  return [...latestByPeriod.values()].sort((left, right) =>
    right.referenceDate.localeCompare(left.referenceDate),
  );
}

function normalizedAccountLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isFinancialIntermediationRevenue(
  period: FundamentalPeriod | undefined,
) {
  const label = normalizedAccountLabel(period?.revenueAccountLabel);
  return /^RECEITAS? (?:DA |DE )?INTERMEDIACAO FINANCEIRA$/.test(label);
}

function addUtcDay(date: string) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result.toISOString().slice(0, 10);
}

function subtractUtcYear(date: string) {
  const result = new Date(`${date}T00:00:00.000Z`);
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(result.getUTCFullYear() - 1);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), month + 1, 0),
  ).getUTCDate();
  result.setUTCMonth(month, Math.min(day, lastDay));
  return result.toISOString().slice(0, 10);
}

function ltmFlowPeriods(periods: FundamentalPeriod[]) {
  return periods.flatMap((current) => {
    if (
      current.sourceDocument !== "ITR" ||
      current.periodBasis !== "year_to_date" ||
      current.exerciseOrder !== "last" ||
      !current.periodStart ||
      !current.periodEnd ||
      !current.filingReferenceDate ||
      current.periodStart !== `${current.periodEnd.slice(0, 4)}-01-01`
    )
      return [];

    const currentPeriodEnd = current.periodEnd!;
    const year = Number(currentPeriodEnd.slice(0, 4));
    const previousYear = year - 1;
    const annual = periods.filter(
      (period) =>
        period.sourceDocument === "DFP" &&
        period.periodType === "annual" &&
        period.periodBasis === "annual" &&
        period.periodStart === `${previousYear}-01-01` &&
        period.periodEnd === `${previousYear}-12-31` &&
        period.exerciseOrder === "last",
    );
    const comparative = periods.filter(
      (period) =>
        period.sourceDocument === "ITR" &&
        period.periodBasis === "year_to_date" &&
        period.exerciseOrder === "previous" &&
        period.filingReferenceDate === current.filingReferenceDate &&
        period.periodStart === `${previousYear}-01-01` &&
        period.periodEnd === subtractUtcYear(currentPeriodEnd),
    );
    if (annual.length !== 1 || comparative.length !== 1) return [];
    const fullYear = annual[0]!;
    const priorYtd = comparative[0]!;
    const priorYtdPeriodEnd = priorYtd.periodEnd!;
    const calculateFlow = (
      field: "revenue" | "netIncome",
      versionField: "revenueVersion" | "netIncomeVersion",
      accountIdentityField: "revenueAccountLabel" | "netIncomeConcept",
    ) => {
      if (
        !current[versionField] ||
        current[versionField] !== priorYtd[versionField]
      )
        return null;
      const accountIdentities = [
        fullYear[accountIdentityField],
        current[accountIdentityField],
        priorYtd[accountIdentityField],
      ].map((identity) =>
        accountIdentityField === "revenueAccountLabel"
          ? normalizedAccountLabel(identity)
          : (identity ?? ""),
      );
      if (
        !accountIdentities[0] ||
        !accountIdentities.every(
          (identity) => identity === accountIdentities[0],
        )
      )
        return null;
      if (
        accountIdentityField === "netIncomeConcept" &&
        (!fullYear.netIncomeAccount ||
          !current.netIncomeAccount ||
          current.netIncomeAccount !== priorYtd.netIncomeAccount ||
          !["3.09", "3.11"].includes(fullYear.netIncomeAccount) ||
          !["3.09", "3.11"].includes(current.netIncomeAccount))
      )
        return null;
      const values = [fullYear[field], current[field], priorYtd[field]].map(
        numericValue,
      );
      if (values.some((value) => value === null)) return null;
      return values[0]! + values[1]! - values[2]!;
    };
    const revenue = calculateFlow(
      "revenue",
      "revenueVersion",
      "revenueAccountLabel",
    );
    const netIncome = calculateFlow(
      "netIncome",
      "netIncomeVersion",
      "netIncomeConcept",
    );
    if (revenue === null && netIncome === null) return [];
    return [
      {
        ...current,
        referenceDate: currentPeriodEnd,
        periodStart: addUtcDay(priorYtdPeriodEnd),
        periodBasis: "trailing_twelve_months" as const,
        revenue: revenue?.toFixed(2) ?? null,
        netIncome: netIncome?.toFixed(2) ?? null,
        equity: null,
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
        isDerived: true,
      },
    ];
  });
}

export function calculateAnalysisIndicators(
  periods: FundamentalPeriod[],
  marketCap: number | null = null,
  marketDataDate: string | null = null,
): AnalysisIndicator[] {
  const ltm = ltmFlowPeriods(periods).sort((left, right) =>
    right.periodEnd!.localeCompare(left.periodEnd!),
  )[0];
  const unavailableMarketValue =
    "Indisponível: a fonte de mercado não informou o valor de mercado do ativo.";
  const annual = periods
    .filter(
      (period) =>
        period.sourceDocument === "DFP" &&
        period.periodBasis === "annual" &&
        period.periodStart === `${period.periodEnd?.slice(0, 4)}-01-01` &&
        period.periodEnd === `${period.periodEnd?.slice(0, 4)}-12-31` &&
        period.exerciseOrder === "last",
    )
    .sort((left, right) =>
      right.referenceDate.localeCompare(left.referenceDate),
    );
  const latest = periods
    .filter(
      (period) =>
        period.exerciseOrder !== "previous" &&
        (period.periodBasis === "annual" ||
          period.periodBasis === "year_to_date" ||
          period.periodBasis === "quarterly") &&
        Boolean(period.periodEnd ?? period.referenceDate),
    )
    .slice()
    .sort((left, right) =>
      (right.periodEnd ?? right.referenceDate).localeCompare(
        left.periodEnd ?? left.referenceDate,
      ),
    )[0];
  const latestAnnual = annual[0];
  const previousAnnual = annual[1];
  const netIncomeFlowPeriod =
    ltm && numericValue(ltm.netIncome) !== null ? ltm : latestAnnual;
  const marketFlowPeriod = netIncomeFlowPeriod;
  const marginPeriod = ltm ?? latest;
  const roeFlowPeriod = netIncomeFlowPeriod;
  const usesLtmRoe = roeFlowPeriod?.periodBasis === "trailing_twelve_months";
  const revenue = marginPeriod ? numericValue(marginPeriod.revenue) : null;
  const netIncome = marginPeriod ? numericValue(marginPeriod.netIncome) : null;
  const financialIntermediationRevenue =
    isFinancialIntermediationRevenue(marginPeriod);
  const netMargin =
    !financialIntermediationRevenue &&
    revenue !== null &&
    netIncome !== null &&
    revenue !== 0
      ? (netIncome / revenue) * 100
      : null;
  const latestBalance = periods
    .filter(
      (period) =>
        period.exerciseOrder !== "previous" &&
        numericValue(period.equity) !== null,
    )
    .sort((left, right) =>
      (right.periodEnd ?? right.referenceDate).localeCompare(
        left.periodEnd ?? left.referenceDate,
      ),
    )[0];
  const latestEquity = latestBalance
    ? numericValue(latestBalance.equity)
    : null;
  const latestBalanceAtFlowEnd = roeFlowPeriod
    ? periods.filter(
        (period) =>
          (period.periodEnd ?? period.referenceDate) ===
            roeFlowPeriod.periodEnd &&
          (period.exerciseOrder ?? "last") === "last",
      )
    : [];
  const openingBalances =
    usesLtmRoe && ltm
      ? periods.filter(
          (period) =>
            period.sourceDocument === "ITR" &&
            period.exerciseOrder === "previous" &&
            period.filingReferenceDate === ltm.filingReferenceDate &&
            (period.periodEnd ?? period.referenceDate) ===
              subtractUtcYear(ltm.periodEnd!),
        )
      : [];
  const openingBalance = usesLtmRoe
    ? openingBalances.length === 1
      ? openingBalances[0]
      : undefined
    : previousAnnual;
  const roeEndingEquity =
    latestBalanceAtFlowEnd.length === 1
      ? numericValue(latestBalanceAtFlowEnd[0]!.equity)
      : usesLtmRoe
        ? null
        : numericValue(latestAnnual?.equity ?? null);
  const previousEquity = numericValue(openingBalance?.equity ?? null);
  const supportedNetIncome = (period: FundamentalPeriod | undefined) =>
    period?.netIncomeConcept === "consolidated_net_income" &&
    ["3.09", "3.11"].includes(period.netIncomeAccount ?? "");
  const annualNetIncome = supportedNetIncome(roeFlowPeriod)
    ? numericValue(roeFlowPeriod.netIncome)
    : null;
  const hasMarketCap = marketCap !== null && marketCap > 0;
  const pe =
    hasMarketCap && annualNetIncome !== null && annualNetIncome > 0
      ? marketCap / annualNetIncome
      : null;
  const pb =
    hasMarketCap && latestEquity !== null && latestEquity > 0
      ? marketCap / latestEquity
      : null;
  const compatibleRoePeriod = usesLtmRoe
    ? Boolean(
        openingBalance &&
        latestBalanceAtFlowEnd.length === 1 &&
        latestBalanceAtFlowEnd[0]!.equityAccount &&
        latestBalanceAtFlowEnd[0]!.equityAccount ===
          openingBalance.equityAccount &&
        latestBalanceAtFlowEnd[0]!.equityConcept === "consolidated_equity" &&
        latestBalanceAtFlowEnd[0]!.equityConcept ===
          openingBalance.equityConcept &&
        latestBalanceAtFlowEnd[0]!.equityVersion &&
        latestBalanceAtFlowEnd[0]!.equityVersion ===
          openingBalance.equityVersion,
      )
    : Boolean(
        latestAnnual &&
        previousAnnual &&
        supportedNetIncome(latestAnnual) &&
        supportedNetIncome(previousAnnual) &&
        latestAnnual.equityConcept === "consolidated_equity" &&
        previousAnnual.equityConcept === "consolidated_equity" &&
        latestAnnual.equityAccount === previousAnnual.equityAccount &&
        ["2.03", "2.07", "2.08"].includes(latestAnnual.equityAccount ?? "") &&
        Number(latestAnnual.referenceDate.slice(0, 4)) -
          Number(previousAnnual.referenceDate.slice(0, 4)) ===
          1,
      );
  const roe =
    compatibleRoePeriod &&
    roeEndingEquity !== null &&
    previousEquity !== null &&
    annualNetIncome !== null &&
    roeEndingEquity + previousEquity > 0
      ? (annualNetIncome / ((roeEndingEquity + previousEquity) / 2)) * 100
      : null;
  const peUnavailableReason =
    pe !== null
      ? null
      : !hasMarketCap
        ? unavailableMarketValue
        : marketFlowPeriod?.periodBasis === "trailing_twelve_months"
          ? `Indisponível: o lucro líquido positivo não está disponível no LTM encerrado em ${marketFlowPeriod!.periodEnd}.`
          : "Indisponível: as demonstrações financeiras anuais mais recentes não informam lucro líquido positivo compatível.";
  const roeUnavailableReason =
    roe !== null
      ? null
      : usesLtmRoe
        ? `Indisponível: não foi possível reconciliar o lucro LTM encerrado em ${roeFlowPeriod!.periodEnd} com patrimônio líquido médio compatível nas datas-base e versões disponíveis.`
        : "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.";

  return [
    {
      key: "pe",
      value: pe,
      unavailableReason: peUnavailableReason,
      referenceDate: pe === null ? null : marketFlowPeriod!.periodEnd!,
      sourceDocument: pe === null ? null : marketFlowPeriod!.sourceDocument,
      periodBasis:
        pe === null
          ? null
          : marketFlowPeriod === ltm
            ? "trailing_twelve_months"
            : "annual",
      marketDataDate: pe === null ? null : marketDataDate,
    },
    {
      key: "pb",
      value: pb,
      unavailableReason:
        pb === null
          ? hasMarketCap
            ? "Indisponível: as demonstrações financeiras anuais mais recentes não informam patrimônio líquido positivo compatível."
            : unavailableMarketValue
          : null,
      referenceDate:
        pb === null
          ? null
          : (latestBalance!.periodEnd ?? latestBalance!.referenceDate),
      sourceDocument: pb === null ? null : latestBalance!.sourceDocument,
      periodBasis: pb === null ? null : "point_in_time",
      marketDataDate: pb === null ? null : marketDataDate,
    },
    {
      key: "roe",
      value: roe,
      unavailableReason: roeUnavailableReason,
      referenceDate: roe === null ? null : roeFlowPeriod!.periodEnd!,
      sourceDocument: roe === null ? null : roeFlowPeriod!.sourceDocument,
      periodBasis:
        roe === null ? null : usesLtmRoe ? "trailing_twelve_months" : "annual",
      marketDataDate: null,
    },
    {
      key: "netMargin",
      value: netMargin,
      unavailableReason:
        netMargin === null
          ? financialIntermediationRevenue
            ? "Indisponível: a receita de intermediação financeira não foi aprovada como denominador comparável para margem bancária."
            : "Indisponível: receita e lucro líquido precisam estar informados no mesmo demonstrativo, e a receita não pode ser zero."
          : null,
      referenceDate:
        marginPeriod?.periodEnd ?? marginPeriod?.referenceDate ?? null,
      sourceDocument: marginPeriod?.sourceDocument ?? null,
      periodBasis: marginPeriod?.periodBasis ?? null,
      marketDataDate: null,
    },
  ];
}

export type AnalysisIndicatorKey = "pe" | "pb" | "roe" | "netMargin";

export type AnalysisIndicator = {
  key: AnalysisIndicatorKey;
  value: number | null;
  unavailableReason: string | null;
  referenceDate: string | null;
  sourceDocument: "DFP" | "ITR" | null;
  periodBasis?:
    | "annual"
    | "year_to_date"
    | "quarterly"
    | "trailing_twelve_months"
    | "point_in_time"
    | null;
  marketDataDate: string | null;
};

export class StockAnalysisService {
  constructor(
    private readonly marketProvider: MarketDataProvider = new BrapiMarketDataProvider(),
    private readonly fundamentalsProvider: FundamentalsProvider = new CvmFundamentalsProvider(),
    private readonly repository: Pick<
      StockFundamentalsRepository,
      "listByTicker" | "save"
    > = stockFundamentalsRepository,
    private readonly screener: Pick<
      ScreenerRepository,
      "getValidatedAnalysisQuote"
    > = screenerRepository,
  ) {}

  async getByTicker(rawTicker: unknown, requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(parsed.error.issues[0]!.message, 400);

    let market: MarketData | null = null;
    let marketError: unknown = null;
    try {
      market = await this.marketProvider.getByTicker(parsed.data);
      if (market.ticker.toUpperCase() !== parsed.data) {
        marketError = new Error("Market provider returned a different ticker");
        market = null;
      }
    } catch (error) {
      marketError = error;
    }
    const expectedCnpj = market ? normalizeCnpj(market.cnpj) || null : null;
    const now = Date.now();
    const quoteTimestamp = market?.priceUpdatedAt
      ? Date.parse(market.priceUpdatedAt)
      : Number.NaN;
    const quoteAge = now - quoteTimestamp;
    const marketPriceIsUsable = Boolean(
      market &&
      market.price !== null &&
      market.price > 0 &&
      Number.isFinite(quoteTimestamp) &&
      quoteAge >= 0,
    );
    const hasCurrentQuote = Boolean(
      market &&
      marketPriceIsUsable &&
      market.marketCap !== null &&
      market.marketCap > 0 &&
      quoteAge <= quoteFreshnessMs,
    );
    let priceIsStale = marketPriceIsUsable && quoteAge > quoteFreshnessMs;
    if (!hasCurrentQuote) {
      const quote = await this.screener
        .getValidatedAnalysisQuote(parsed.data)
        .catch((error) => {
          logger.warn("stock_analysis_last_quote_lookup_failed", {
            ticker: parsed.data,
            error,
          });
          return null;
        });
      if (validLastObservedQuote(quote, parsed.data, expectedCnpj, now)) {
        const quoteDate = quote!.quoteObservedAt!.toISOString();
        // Screener stores isolated validated observations, not a daily time series.
        market = {
          ticker: parsed.data,
          companyName: market?.companyName ?? quote!.companyName,
          cnpj: quote!.issuerCnpj,
          price: Number(quote!.price),
          marketCap: Number(quote!.marketCap),
          changePercent: null,
          priceUpdatedAt: quoteDate,
          history: market?.history ?? [],
          historyStatus: market?.historyStatus ?? "unavailable",
        };
        priceIsStale = true;
      }
    }
    if (market && !marketPriceIsUsable && !priceIsStale) {
      market = {
        ...market,
        price: null,
        marketCap: null,
        changePercent: null,
        priceUpdatedAt: null,
      };
    }
    if (!market) {
      if (marketError instanceof ApplicationError) throw marketError;
      throw new ApplicationError(
        "Não foi possível consultar uma cotação válida para este ativo agora.",
        502,
      );
    }
    const cached = await this.repository.listByTicker(market.ticker);
    const cacheIdentityMatches =
      cached.length > 0 &&
      cached.every(
        (period) =>
          normalizeCnpj(period.cnpj) === normalizeCnpj(market.cnpj) &&
          normalizeCnpj(market.cnpj).length === 14,
      );
    const cacheValid =
      cached.length > 0 &&
      cacheIdentityMatches &&
      Date.now() - cached[0].fetchedAt.getTime() < cacheDurationMs;
    logger.info("stock_fundamentals_cache_checked", {
      requestId,
      ticker: market.ticker,
      cachedPeriods: cached.length,
      cacheValid,
      cacheIdentityMatches,
      cnpjAvailable: Boolean(market.cnpj),
    });
    let fundamentalsIsStale = false;
    let fundamentalsFetchedAt: string | null = cacheValid
      ? cached[0]!.fetchedAt.toISOString()
      : null;
    let periods: FundamentalPeriod[];
    if (cacheValid) periods = normalizeCachedPeriods(cached);
    else {
      try {
        const fetchedAt = new Date();
        const refreshed = await this.refreshFundamentals(
          market.ticker,
          market.cnpj,
          requestId,
        );
        fundamentalsFetchedAt = fetchedAt.toISOString();
        const validatedCache = refreshed.length
          ? null
          : validatedCachedFundamentals(cached, normalizeCnpj(market.cnpj));
        if (validatedCache) {
          periods = validatedCache.periods;
          fundamentalsFetchedAt = validatedCache.fetchedAt.toISOString();
          fundamentalsIsStale = true;
          logger.warn("stock_fundamentals_stale_cache_used", {
            requestId,
            ticker: market.ticker,
            cnpj: normalizeCnpj(market.cnpj),
            fetchedAt: fundamentalsFetchedAt,
            periods: periods.length,
          });
        } else periods = refreshed;
      } catch (error) {
        const validatedCache = validatedCachedFundamentals(
          cached,
          normalizeCnpj(market.cnpj),
        );
        if (!validatedCache) throw error;
        periods = validatedCache.periods;
        fundamentalsFetchedAt = validatedCache.fetchedAt.toISOString();
        fundamentalsIsStale = true;
        logger.warn("stock_fundamentals_stale_cache_used", {
          requestId,
          ticker: market.ticker,
          cnpj: normalizeCnpj(market.cnpj),
          fetchedAt: fundamentalsFetchedAt,
          periods: periods.length,
        });
      }
    }

    const ltmPeriods = ltmFlowPeriods(periods);
    return {
      ...market,
      priceIsStale,
      fundamentalsIsStale,
      fundamentalsFetchedAt,
      fundamentals: [...periods, ...ltmPeriods],
      indicators: calculateAnalysisIndicators(
        periods,
        market.marketCap,
        market.priceUpdatedAt,
      ),
    };
  }

  async getFundamentalsByIssuer(
    rawTicker: unknown,
    rawExpectedCnpj: unknown,
    requestId?: string,
  ): Promise<
    MarketData & {
      fundamentals: FundamentalPeriod[];
      indicators: AnalysisIndicator[];
    }
  > {
    const parsedTicker = tickerSchema.safeParse(rawTicker);
    if (!parsedTicker.success)
      throw new ApplicationError(parsedTicker.error.issues[0]!.message, 400);
    const expectedCnpj = normalizeCnpj(
      typeof rawExpectedCnpj === "string" ? rawExpectedCnpj : null,
    );
    if (expectedCnpj.length !== 14)
      throw new ApplicationError(
        "Não foi possível confirmar o CNPJ do emissor na CVM.",
        422,
      );

    const ticker = parsedTicker.data;
    const cached = await this.repository.listByTicker(ticker);
    const cacheIdentityMatches =
      cached.length > 0 &&
      cached.every((period) => normalizeCnpj(period.cnpj) === expectedCnpj);
    const cacheFresh =
      cached.length > 0 &&
      Date.now() - cached[0]!.fetchedAt.getTime() < cacheDurationMs;
    const cacheValid = cacheFresh && cacheIdentityMatches;
    logger.info("stock_fundamentals_cache_checked", {
      requestId,
      ticker,
      cachedPeriods: cached.length,
      cacheValid,
      cnpjAvailable: true,
      cacheIdentityMatches,
    });
    const periods = cacheValid
      ? normalizeCachedPeriods(cached)
      : await this.refreshFundamentals(ticker, expectedCnpj, requestId);
    const ltmPeriods = ltmFlowPeriods(periods);
    return {
      ticker,
      cnpj: expectedCnpj,
      companyName: null,
      price: null,
      marketCap: null,
      changePercent: null,
      priceUpdatedAt: null,
      history: [],
      fundamentals: [...periods, ...ltmPeriods],
      indicators: calculateAnalysisIndicators(periods),
    };
  }

  async searchTickers(rawQuery: unknown, requestId?: string) {
    const query = z.string().trim().min(2).max(80).safeParse(rawQuery);
    if (!query.success) return [];
    logger.info("stock_ticker_search_requested", {
      requestId,
      queryLength: query.data.length,
    });
    return this.marketProvider.searchTickers(query.data);
  }

  private async refreshFundamentals(
    ticker: string,
    cnpj: string | null,
    requestId?: string,
  ) {
    logger.info("stock_fundamentals_refresh_started", {
      requestId,
      ticker,
      cnpjAvailable: Boolean(cnpj),
    });
    try {
      const periods = await this.fundamentalsProvider.getByTicker({
        ticker,
        cnpj,
      });
      if (!cnpj)
        throw new ApplicationError(
          "Não foi possível associar o ativo à CVM.",
          422,
        );
      await this.repository.save(
        ticker,
        cnpj,
        String(new Date().getUTCFullYear()),
        periods,
      );
      logger.info("stock_fundamentals_persisted", {
        requestId,
        ticker,
        periods: periods.length,
      });
      return periods;
    } catch (error) {
      logger.error("stock_fundamentals_refresh_failed", {
        requestId,
        ticker,
        stage: "cvm_refresh",
        error,
      });
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "Não foi possível consultar os demonstrativos oficiais da CVM agora.",
        502,
      );
    }
  }
}

export const stockAnalysisService = new StockAnalysisService();
