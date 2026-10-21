import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import type { FundamentalsProvider } from "@/backend/providers/fundamentals.provider";
import type {
  MarketData,
  MarketQuote,
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
const cacheDurationMs = 1000 * 60 * 60 * 24 * 7;
const quoteFreshnessMs = 7 * 24 * 60 * 60 * 1000;
const fundamentalsNormalizationRevision = "cvm-v7";
const unavailableMarketCapReason =
  "Não foi possível validar a capitalização total do emissor para este ticker e data da cotação.";

type MarketCapEvidence = {
  marketCap: number | null;
  marketDataDate: string | null;
  source: "ScreenerRepository.getValidatedAnalysisQuote" | null;
  unavailableReason: string | null;
};

const unavailableMarketCap: MarketCapEvidence = {
  marketCap: null,
  marketDataDate: null,
  source: null,
  unavailableReason: unavailableMarketCapReason,
};

function valuationMethod(key: "pe" | "pb") {
  return key === "pe"
    ? "market_cap_emissor / lucro_atribuido_controladora_cvm"
    : "market_cap_emissor / patrimonio_controladora_cvm";
}

function currentFundamentalsSourceVersion() {
  return `${new Date().getUTCFullYear()}-${fundamentalsNormalizationRevision}`;
}

function numericValue(value: string | null | undefined) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUsableConsolidatedEquity(period: FundamentalPeriod) {
  return (
    period.equityConcept === "consolidated_equity" &&
    ["2.03", "2.07", "2.08"].includes(period.equityAccount ?? "") &&
    Boolean(period.equityVersion) &&
    numericValue(period.equity) !== null
  );
}

function isUsableParentNetIncome(period: FundamentalPeriod) {
  return (
    period.parentNetIncomeConcept === "parent_attributable_net_income" &&
    period.parentNetIncomeAccount === "3.11.01" &&
    Boolean(period.parentNetIncomeVersion) &&
    numericValue(period.parentNetIncome) !== null
  );
}

function parentEquityValue(period: FundamentalPeriod) {
  if (
    !isUsableConsolidatedEquity(period) ||
    period.equityAccount !== "2.03" ||
    period.nonControllingEquityConcept !== "non_controlling_equity" ||
    period.nonControllingEquityAccount !== "2.03.09" ||
    !period.nonControllingEquityVersion ||
    period.nonControllingEquityVersion !== period.equityVersion ||
    numericValue(period.nonControllingEquity) === null ||
    (period.periodEnd ?? period.referenceDate) !== period.referenceDate ||
    !period.filingReferenceDate ||
    !period.equityVersion
  )
    return null;
  const total = numericValue(period.equity);
  const nonControlling = numericValue(period.nonControllingEquity);
  if (total === null || nonControlling === null || total <= 0) return null;
  const parentEquity = total - nonControlling;
  return Number.isFinite(parentEquity) && parentEquity > 0
    ? parentEquity
    : null;
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
    period.parentNetIncome !== null &&
    period.parentNetIncome !== undefined &&
    (period.parentNetIncomeAccount !== "3.11.01" ||
      period.parentNetIncomeConcept !== "parent_attributable_net_income" ||
      !period.parentNetIncomeVersion ||
      numericValue(period.parentNetIncome) === null)
  )
    return false;
  if (
    period.nonControllingNetIncome !== null &&
    period.nonControllingNetIncome !== undefined &&
    (period.nonControllingNetIncomeAccount !== "3.11.02" ||
      period.nonControllingNetIncomeConcept !== "non_controlling_net_income" ||
      !period.nonControllingNetIncomeVersion ||
      numericValue(period.nonControllingNetIncome) === null)
  )
    return false;
  if (
    period.equity !== null &&
    (!period.equityVersion || !period.equityAccount || !period.equityConcept)
  )
    return false;
  if (
    period.nonControllingEquity !== null &&
    period.nonControllingEquity !== undefined &&
    (period.nonControllingEquityAccount !== "2.03.09" ||
      period.nonControllingEquityConcept !== "non_controlling_equity" ||
      !period.nonControllingEquityVersion ||
      numericValue(period.nonControllingEquity) === null)
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

function validProviderQuote(
  quote: MarketQuote | null,
  ticker: string,
  expectedCnpj: string,
  now: number,
) {
  if (
    !quote ||
    quote.ticker.toUpperCase() !== ticker ||
    (quote.cnpj !== null && normalizeCnpj(quote.cnpj) !== expectedCnpj) ||
    quote.price === null ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0 ||
    !(quote.observedAt instanceof Date) ||
    !Number.isFinite(quote.observedAt.getTime())
  )
    return false;
  const age = now - quote.observedAt.getTime();
  return age >= 0 && age <= quoteFreshnessMs;
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
          fullYear.netIncomeAccount !== "3.11" ||
          current.netIncomeAccount !== "3.11")
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
    const parentNetIncome =
      current.parentNetIncomeAccount === "3.11.01" &&
      priorYtd.parentNetIncomeAccount === "3.11.01" &&
      fullYear.parentNetIncomeAccount === "3.11.01" &&
      current.parentNetIncomeConcept === "parent_attributable_net_income" &&
      priorYtd.parentNetIncomeConcept === "parent_attributable_net_income" &&
      fullYear.parentNetIncomeConcept === "parent_attributable_net_income" &&
      current.parentNetIncomeVersion &&
      current.parentNetIncomeVersion === priorYtd.parentNetIncomeVersion &&
      current.parentNetIncomeVersion === fullYear.parentNetIncomeVersion
        ? [
            fullYear.parentNetIncome,
            current.parentNetIncome,
            priorYtd.parentNetIncome,
          ].map(numericValue)
        : null;
    const parentNetIncomeLtm =
      parentNetIncome && parentNetIncome.every((value) => value !== null)
        ? parentNetIncome[0]! + parentNetIncome[1]! - parentNetIncome[2]!
        : null;
    if (revenue === null && netIncome === null && parentNetIncomeLtm === null)
      return [];
    return [
      {
        ...current,
        referenceDate: currentPeriodEnd,
        periodStart: addUtcDay(priorYtdPeriodEnd),
        periodBasis: "trailing_twelve_months" as const,
        revenue: revenue?.toFixed(2) ?? null,
        netIncome: netIncome?.toFixed(2) ?? null,
        parentNetIncome: parentNetIncomeLtm?.toFixed(2) ?? null,
        equity: null,
        nonControllingNetIncome: null,
        nonControllingNetIncomeVersion: null,
        nonControllingNetIncomeAccount: null,
        nonControllingNetIncomeConcept: null,
        nonControllingEquity: null,
        nonControllingEquityVersion: null,
        nonControllingEquityAccount: null,
        nonControllingEquityConcept: null,
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
        isDerived: true,
      },
    ];
  });
}

function deduplicateEquivalentBalances(periods: FundamentalPeriod[]) {
  const unique = new Map<string, FundamentalPeriod>();
  const unverified: FundamentalPeriod[] = [];
  for (const period of periods) {
    const periodEnd = period.periodEnd ?? period.referenceDate;
    const exerciseOrder = period.exerciseOrder ?? "last";
    if (
      !period.sourceDocument ||
      !period.filingReferenceDate ||
      !period.equityVersion ||
      !period.equityAccount ||
      !period.equityConcept ||
      numericValue(period.equity) === null
    ) {
      unverified.push(period);
      continue;
    }
    const key = JSON.stringify([
      period.sourceDocument,
      periodEnd,
      period.filingReferenceDate,
      exerciseOrder,
      period.equityVersion,
      period.equityAccount,
      period.equityConcept,
      period.equity,
    ]);
    if (!unique.has(key)) unique.set(key, period);
  }
  return [...unique.values(), ...unverified];
}

export function calculateAnalysisIndicators(
  periods: FundamentalPeriod[],
  marketEvidence: MarketCapEvidence = unavailableMarketCap,
): AnalysisIndicator[] {
  const { marketCap, marketDataDate } = marketEvidence;
  const ltm = ltmFlowPeriods(periods).sort((left, right) =>
    right.periodEnd!.localeCompare(left.periodEnd!),
  )[0];
  const unavailableMarketValue =
    marketEvidence.unavailableReason ?? unavailableMarketCapReason;
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
  const parentAnnualPeriod =
    latestAnnual && isUsableParentNetIncome(latestAnnual)
      ? latestAnnual
      : undefined;
  const parentLtmPeriod = ltmFlowPeriods(periods)
    .filter(isUsableParentNetIncome)
    .sort((left, right) => right.periodEnd!.localeCompare(left.periodEnd!))[0];
  const parentNetIncomeFlowPeriod = parentLtmPeriod ?? parentAnnualPeriod;
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
  const latestBalanceDate = periods
    .filter((period) => period.exerciseOrder !== "previous")
    .filter((period) => numericValue(period.equity) !== null)
    .map((period) => period.periodEnd ?? period.referenceDate)
    .sort((left, right) => right.localeCompare(left))[0];
  const latestBalanceRecords = latestBalanceDate
    ? periods.filter(
        (period) =>
          period.exerciseOrder !== "previous" &&
          numericValue(period.equity) !== null &&
          (period.periodEnd ?? period.referenceDate) === latestBalanceDate,
      )
    : [];
  const latestParentEquityRecords = latestBalanceRecords.map((period) => ({
    period,
    value: parentEquityValue(period),
  }));
  const parentEquityBalance =
    latestParentEquityRecords.length > 0 &&
    latestParentEquityRecords.every(
      ({ value }) =>
        value !== null && value === latestParentEquityRecords[0]!.value,
    )
      ? {
          period: latestParentEquityRecords[0]!.period,
          value: latestParentEquityRecords[0]!.value!,
        }
      : undefined;
  const latestParentEquity = parentEquityBalance?.value ?? null;
  const latestBalanceAtFlowEnd = roeFlowPeriod
    ? deduplicateEquivalentBalances(
        periods.filter(
          (period) =>
            (period.periodEnd ?? period.referenceDate) ===
              roeFlowPeriod.periodEnd &&
            (period.exerciseOrder ?? "last") === "last" &&
            isUsableConsolidatedEquity(period),
        ),
      )
    : [];
  const currentFilingOpeningBalances =
    usesLtmRoe && ltm
      ? deduplicateEquivalentBalances(
          periods.filter(
            (period) =>
              period.sourceDocument === "ITR" &&
              period.exerciseOrder === "previous" &&
              period.filingReferenceDate === ltm.filingReferenceDate &&
              isUsableConsolidatedEquity(period) &&
              (period.periodEnd ?? period.referenceDate) ===
                subtractUtcYear(ltm.periodEnd!),
          ),
        )
      : [];
  const priorFilingOpeningBalances =
    usesLtmRoe && ltm && currentFilingOpeningBalances.length === 0
      ? deduplicateEquivalentBalances(
          periods.filter(
            (period) =>
              period.sourceDocument === "ITR" &&
              period.exerciseOrder === "last" &&
              isUsableConsolidatedEquity(period) &&
              (period.periodEnd ?? period.referenceDate) ===
                subtractUtcYear(ltm.periodEnd!),
          ),
        )
      : [];
  const openingBalances =
    currentFilingOpeningBalances.length > 0
      ? currentFilingOpeningBalances
      : priorFilingOpeningBalances;
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
    period.netIncomeAccount === "3.11";
  const annualNetIncome = supportedNetIncome(roeFlowPeriod)
    ? numericValue(roeFlowPeriod.netIncome)
    : null;
  const hasMarketCap = Boolean(
    marketCap !== null &&
    marketCap > 0 &&
    marketEvidence.source &&
    marketDataDate &&
    Number.isFinite(Date.parse(marketDataDate)),
  );
  const usableMarketCap = hasMarketCap ? marketCap : null;
  const parentNetIncome = parentNetIncomeFlowPeriod
    ? numericValue(parentNetIncomeFlowPeriod.parentNetIncome)
    : null;
  const pe =
    usableMarketCap !== null && parentNetIncome !== null && parentNetIncome > 0
      ? usableMarketCap / parentNetIncome
      : null;
  const pb =
    usableMarketCap !== null &&
    latestParentEquity !== null &&
    latestParentEquity > 0
      ? usableMarketCap / latestParentEquity
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
        openingBalance.equityVersion &&
        (openingBalance.filingReferenceDate !==
          latestBalanceAtFlowEnd[0]!.filingReferenceDate ||
          latestBalanceAtFlowEnd[0]!.equityVersion ===
            openingBalance.equityVersion),
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
        : parentNetIncomeFlowPeriod?.periodBasis === "trailing_twelve_months"
          ? `Indisponível: o lucro atribuível à controladora não está disponível no LTM encerrado em ${parentNetIncomeFlowPeriod.periodEnd}.`
          : "Indisponível: as demonstrações financeiras mais recentes não informam lucro positivo atribuível à controladora.";
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
      referenceDate: pe === null ? null : parentNetIncomeFlowPeriod!.periodEnd!,
      sourceDocument:
        pe === null ? null : parentNetIncomeFlowPeriod!.sourceDocument,
      periodBasis:
        pe === null
          ? null
          : parentNetIncomeFlowPeriod === parentLtmPeriod
            ? "trailing_twelve_months"
            : parentNetIncomeFlowPeriod!.periodBasis,
      marketDataDate,
      valuationSource: hasMarketCap ? marketEvidence.source : null,
      valuationMethod: hasMarketCap ? valuationMethod("pe") : null,
    },
    {
      key: "pb",
      value: pb,
      unavailableReason:
        pb === null
          ? hasMarketCap
            ? "Indisponível: não foi possível reconciliar o patrimônio consolidado com a participação dos sócios não controladores na mesma demonstração."
            : unavailableMarketValue
          : null,
      referenceDate:
        pb === null
          ? null
          : (parentEquityBalance!.period.periodEnd ??
            parentEquityBalance!.period.referenceDate),
      sourceDocument:
        pb === null ? null : parentEquityBalance!.period.sourceDocument,
      periodBasis: pb === null ? null : "point_in_time",
      marketDataDate,
      valuationSource: hasMarketCap ? marketEvidence.source : null,
      valuationMethod: hasMarketCap ? valuationMethod("pb") : null,
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
  valuationSource?: string | null;
  valuationMethod?: string | null;
};

export type FundamentalsRefreshState = {
  status: "idle" | "running" | "completed" | "failed";
  retryAfter: string | null;
  errorCode: string | null;
};

export class StockAnalysisService {
  constructor(
    private readonly marketProvider: MarketDataProvider = new BrapiMarketDataProvider(),
    private readonly fundamentalsProvider: FundamentalsProvider = new CvmFundamentalsProvider(),
    private readonly repository: Pick<
      StockFundamentalsRepository,
      "listByTicker"
    > &
      Partial<
        Pick<
          StockFundamentalsRepository,
          | "getRefresh"
          | "claimRefresh"
          | "completeRefresh"
          | "failRefresh"
          | "listDueRefreshes"
        >
      > = stockFundamentalsRepository,
    private readonly screener: Pick<
      ScreenerRepository,
      "getValidatedAnalysisQuote"
    > &
      Partial<
        Pick<ScreenerRepository, "getComparisonMetadata">
      > = screenerRepository,
  ) {}

  private async resolveValuationMarketData(
    ticker: string,
    expectedCnpj: string | null,
    requestId?: string,
  ) {
    let quote: Awaited<
      ReturnType<ScreenerRepository["getValidatedAnalysisQuote"]>
    > | null = null;
    try {
      quote = this.screener.getValidatedAnalysisQuote
        ? await this.screener.getValidatedAnalysisQuote(ticker)
        : null;
    } catch (error) {
      logger.warn("stock_analysis_valuation_quote_lookup_failed", {
        requestId,
        ticker,
        error,
      });
    }

    if (!validLastObservedQuote(quote, ticker, expectedCnpj, Date.now()))
      return { evidence: unavailableMarketCap, quote: null };
    const validatedQuote = quote!;

    return {
      evidence: {
        marketCap: Number(validatedQuote.marketCap),
        marketDataDate: validatedQuote.quoteObservedAt!.toISOString(),
        source: "ScreenerRepository.getValidatedAnalysisQuote" as const,
        unavailableReason: null,
      },
      quote: validatedQuote,
    };
  }

  async getMarketByTicker(rawTicker: unknown, requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(parsed.error.issues[0]!.message, 400);
    const ticker = parsed.data;
    const startedAt = Date.now();
    const [quote, issuers] = await Promise.all([
      this.marketProvider.getQuoteByTicker(ticker),
      this.screener.getComparisonMetadata?.([ticker]) ?? Promise.resolve([]),
    ]);
    const matches = issuers.filter(
      (issuer) =>
        issuer.ticker === ticker && normalizeCnpj(issuer.cnpj).length === 14,
    );
    const cnpis = [
      ...new Set(matches.map((issuer) => normalizeCnpj(issuer.cnpj))),
    ];
    if (
      quote.ticker.toUpperCase() !== ticker ||
      cnpis.length !== 1 ||
      (quote.cnpj !== null && normalizeCnpj(quote.cnpj) !== cnpis[0])
    )
      throw new ApplicationError(
        "Não foi possível confirmar o CNPJ do emissor para este ticker.",
        422,
      );
    logger.info("stock_analysis_market_stage_timing", {
      requestId,
      ticker,
      durationMs: Date.now() - startedAt,
    });
    return {
      ticker,
      cnpj: cnpis[0]!,
      companyName: quote.companyName,
      logoUrl: quote.logoUrl,
      price: quote.price,
      marketCap: null,
      changePercent: null,
      priceUpdatedAt: quote.observedAt?.toISOString() ?? null,
    };
  }

  async getByTicker(rawTicker: unknown, requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(parsed.error.issues[0]!.message, 400);

    const startedAt = Date.now();
    logger.info("stock_analysis_service_started", {
      requestId,
      ticker: parsed.data,
    });
    const issuerMetadataStartedAt = Date.now();
    const issuerMetadataPromise = this.screener.getComparisonMetadata
      ? this.screener.getComparisonMetadata([parsed.data]).catch((error) => {
          logger.warn("stock_analysis_issuer_lookup_failed", {
            requestId,
            ticker: parsed.data,
            error,
          });
          return [];
        })
      : Promise.resolve([]);
    let market: MarketData | null = null;
    let marketError: unknown = null;
    const marketStartedAt = Date.now();
    try {
      market = await (this.marketProvider.getAnalysisByTicker
        ? this.marketProvider.getAnalysisByTicker(parsed.data)
        : this.marketProvider.getByTicker(parsed.data));
      if (market.ticker.toUpperCase() !== parsed.data) {
        marketError = new Error("Market provider returned a different ticker");
        market = null;
      }
    } catch (error) {
      marketError = error;
    }
    const marketProviderMs = Date.now() - marketStartedAt;
    let issuerIdentityConflict = false;
    let issuerMetadataMs = 0;
    let issuerSector: string | null = null;
    let issuerSubType: string | null = null;
    let issuerMetadataUpdatedAt: Date | null = null;
    let cvmTickerCnpj: string | null = null;
    const issuerMatches = await issuerMetadataPromise;
    issuerMetadataMs = Date.now() - issuerMetadataStartedAt;
    const exactMatches = issuerMatches.filter(
      (issuer) =>
        issuer.ticker === parsed.data &&
        normalizeCnpj(issuer.cnpj).length === 14,
    );
    const linkedCnpis = [
      ...new Set(exactMatches.map((issuer) => normalizeCnpj(issuer.cnpj))),
    ];
    if (linkedCnpis.length === 1) cvmTickerCnpj = linkedCnpis[0]!;
    const linkedIssuer = exactMatches.filter(
      (issuer) => normalizeCnpj(issuer.cnpj) === cvmTickerCnpj,
    );
    if (linkedIssuer.length === 1) {
      issuerSector = linkedIssuer[0]!.sector;
      issuerSubType = linkedIssuer[0]!.subType;
      issuerMetadataUpdatedAt = linkedIssuer[0]!.issuerMetadataUpdatedAt;
    }
    if (market) {
      const providerCnpj = normalizeCnpj(market.cnpj);
      if (providerCnpj.length !== 14 && linkedCnpis.length === 1) {
        market = { ...market, cnpj: linkedCnpis[0]! };
      } else if (providerCnpj.length !== 14) {
        market = { ...market, cnpj: null };
      } else if (
        linkedCnpis.length > 1 ||
        (linkedCnpis.length === 1 && linkedCnpis[0] !== providerCnpj)
      ) {
        issuerIdentityConflict = true;
      }
    }
    if (issuerIdentityConflict) {
      throw new ApplicationError(
        "Não foi possível confirmar o CNPJ do emissor para este ticker.",
        422,
      );
    }
    if (market && normalizeCnpj(market.cnpj).length !== 14) {
      market = { ...market, cnpj: null };
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
    let priceIsStale = marketPriceIsUsable && quoteAge > quoteFreshnessMs;
    // A BRAPI quote is tied to one security class. It cannot establish total
    // issuer capitalization across common, preferred, and unit classes.
    let valuationResolution = {
      evidence: unavailableMarketCap,
      quote: null as Awaited<
        ReturnType<ScreenerRepository["getValidatedAnalysisQuote"]>
      > | null,
    };
    let quoteFallbackMs = 0;
    if (!marketPriceIsUsable || priceIsStale || cvmTickerCnpj !== null) {
      const quoteFallbackStartedAt = Date.now();
      valuationResolution = await this.resolveValuationMarketData(
        parsed.data,
        cvmTickerCnpj ?? expectedCnpj,
        requestId,
      );
      quoteFallbackMs = Date.now() - quoteFallbackStartedAt;
    }
    if (valuationResolution.quote && (!marketPriceIsUsable || priceIsStale)) {
      const quote = valuationResolution.quote;
      market = {
        ...(market ?? {
          ticker: parsed.data,
          companyName: quote.companyName,
          cnpj: quote.issuerCnpj,
          price: null,
          marketCap: null,
          changePercent: null,
          priceUpdatedAt: null,
          history: [],
        }),
        ticker: parsed.data,
        companyName: market?.companyName ?? quote.companyName,
        cnpj: quote.issuerCnpj,
        price: Number(quote.price),
        marketCap: null,
        changePercent: null,
        priceUpdatedAt: quote.quoteObservedAt!.toISOString(),
        history: market?.history ?? [],
        historyStatus: market?.historyStatus ?? "unavailable",
      };
      priceIsStale = true;
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
    const marketCapEvidence = cvmTickerCnpj
      ? valuationResolution.evidence
      : unavailableMarketCap;
    market = {
      ...market,
      marketCap: marketCapEvidence.marketCap,
    };
    const cacheReadStartedAt = Date.now();
    const cached = await this.repository.listByTicker(market.ticker);
    const cacheReadMs = Date.now() - cacheReadStartedAt;
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
      cached.every(
        (period) => period.sourceVersion === currentFundamentalsSourceVersion(),
      ) &&
      Date.now() - cached[0].fetchedAt.getTime() < cacheDurationMs;
    logger.info("stock_fundamentals_cache_checked", {
      requestId,
      ticker: market.ticker,
      cachedPeriods: cached.length,
      cacheValid,
      cacheIdentityMatches,
      cnpjAvailable: Boolean(market.cnpj),
      repositoryReadMs: cacheReadMs,
    });
    const validatedCache = validatedCachedFundamentals(
      cached,
      normalizeCnpj(market.cnpj),
    );
    const fundamentalsIsStale = Boolean(
      validatedCache &&
      (!cacheValid ||
        Date.now() - validatedCache.fetchedAt.getTime() >= cacheDurationMs),
    );
    const fundamentalsFetchedAt =
      validatedCache?.fetchedAt.toISOString() ?? null;
    const periods = cacheValid
      ? normalizeCachedPeriods(cached)
      : (validatedCache?.periods ?? []);
    const fundamentalsRefresh = await this.getRefreshState(
      market.ticker,
      normalizeCnpj(market.cnpj),
    );

    const normalizationStartedAt = Date.now();
    const ltmPeriods = ltmFlowPeriods(periods);
    const indicators = calculateAnalysisIndicators(periods, marketCapEvidence);
    const normalizationMs = Date.now() - normalizationStartedAt;
    logger.info("stock_analysis_stage_timing", {
      requestId,
      ticker: market.ticker,
      marketProviderMs,
      issuerMetadataMs,
      quoteFallbackMs,
      cacheReadMs,
      fundamentalsCacheHit: cacheValid,
      fundamentalsRefreshMs: 0,
      normalizationMs,
      normalizedPeriods: periods.length + ltmPeriods.length,
      marketCapIdentityVerified: marketCapEvidence.marketCap !== null,
      valuationSource: marketCapEvidence.source,
      valuationMarketDataDate: marketCapEvidence.marketDataDate,
      valuationMethod:
        marketCapEvidence.marketCap === null ? null : "issuer_market_cap",
      valuationUnavailableReason: marketCapEvidence.unavailableReason,
      totalMs: Date.now() - startedAt,
    });
    return {
      ...market,
      marketCapIdentityVerified: marketCapEvidence.marketCap !== null,
      issuerSector,
      issuerMetadataUpdatedAt,
      instrumentType:
        issuerSubType === "stock" || issuerSubType === "unit"
          ? ("stock" as const)
          : ("unknown" as const),
      priceIsStale,
      fundamentalsIsStale,
      fundamentalsFetchedAt,
      fundamentalsRefresh,
      fundamentals: [...periods, ...ltmPeriods],
      indicators,
    };
  }

  async getHistoryByTicker(rawTicker: unknown, requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(parsed.error.issues[0]!.message, 400);
    if (!this.marketProvider.getHistoryByTicker)
      throw new ApplicationError(
        "A fonte atual não permite atualizar o histórico isoladamente.",
        501,
      );
    logger.info("stock_analysis_history_requested", {
      requestId,
      ticker: parsed.data,
    });
    const history = await this.marketProvider.getHistoryByTicker(parsed.data);
    logger.info("stock_analysis_history_responded", {
      requestId,
      ticker: history.ticker,
      status: history.historyStatus,
      points: history.history.length,
      failureReason: history.historyFailure?.reason,
    });
    return history;
  }

  async getFundamentalsByIssuer(
    rawTicker: unknown,
    rawExpectedCnpj: unknown,
    requestId?: string,
  ): Promise<
    MarketData & {
      fundamentals: FundamentalPeriod[];
      indicators: AnalysisIndicator[];
      marketDataIdentityVerified: boolean;
      marketCapIdentityVerified: boolean;
      fundamentalsIsStale: boolean;
      fundamentalsFetchedAt: string | null;
      fundamentalsRefresh?: FundamentalsRefreshState;
    }
  > {
    const startedAt = Date.now();
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
    const quoteStartedAt = Date.now();
    let marketDataSource: "screener_snapshot" | "brapi_quote" | null = null;
    let marketDataFallbackAttempted = false;
    let valuationEvidence = unavailableMarketCap;
    const quotePromise = Promise.resolve().then(async () => {
      const resolution = await this.resolveValuationMarketData(
        ticker,
        expectedCnpj,
        requestId,
      );
      valuationEvidence = resolution.evidence;
      if (resolution.quote) {
        marketDataSource = "screener_snapshot";
        return {
          price: Number(resolution.quote.price),
          observedAt: resolution.quote.quoteObservedAt!,
        };
      }

      marketDataFallbackAttempted = true;
      try {
        const providerQuote =
          await this.marketProvider.getQuoteByTicker(ticker);
        if (
          !validProviderQuote(providerQuote, ticker, expectedCnpj, Date.now())
        )
          return null;
        marketDataSource = "brapi_quote";
        // Keep the quote for its price only. Valuation ratios require the
        // class-reconciled issuer snapshot resolved above.
        valuationEvidence = unavailableMarketCap;
        return {
          price: providerQuote.price!,
          observedAt: providerQuote.observedAt!,
        };
      } catch (error) {
        logger.warn("stock_comparison_quote_lookup_failed", {
          requestId,
          ticker,
          source: "brapi_quote",
          error,
        });
        return null;
      }
    });
    const cacheReadStartedAt = Date.now();
    const cached = await this.repository.listByTicker(ticker);
    const cacheReadMs = Date.now() - cacheReadStartedAt;
    const cacheIdentityMatches =
      cached.length > 0 &&
      cached.every((period) => normalizeCnpj(period.cnpj) === expectedCnpj);
    const cacheFresh =
      cached.length > 0 &&
      cached.every(
        (period) => period.sourceVersion === currentFundamentalsSourceVersion(),
      ) &&
      Date.now() - cached[0]!.fetchedAt.getTime() < cacheDurationMs;
    const cacheValid = cacheFresh && cacheIdentityMatches;
    logger.info("stock_fundamentals_cache_checked", {
      requestId,
      ticker,
      cachedPeriods: cached.length,
      cacheValid,
      cnpjAvailable: true,
      cacheIdentityMatches,
      repositoryReadMs: cacheReadMs,
    });
    const stale = validatedCachedFundamentals(cached, expectedCnpj);
    const periods = cacheValid
      ? normalizeCachedPeriods(cached)
      : (stale?.periods ?? []);
    const fundamentalsIsStale = Boolean(stale && !cacheValid);
    const fundamentalsFetchedAt = stale?.fetchedAt.toISOString() ?? null;
    const fundamentalsRefresh = await this.getRefreshState(
      ticker,
      expectedCnpj,
    );
    const validatedQuote = await quotePromise;
    const marketDataIdentityVerified = validatedQuote !== null;
    const marketCapIdentityVerified = valuationEvidence.marketCap !== null;
    const marketCap = valuationEvidence.marketCap;
    const marketPrice = validatedQuote?.price ?? null;
    const marketPriceDate = validatedQuote?.observedAt.toISOString() ?? null;
    logger.info("stock_issuer_fundamentals_stage_timing", {
      requestId,
      ticker,
      repositoryReadMs: cacheReadMs,
      fundamentalsCacheHit: cacheValid,
      refreshMs: 0,
      quoteMs: Date.now() - quoteStartedAt,
      marketDataIdentityVerified,
      marketCapIdentityVerified,
      marketDataSource,
      marketDataFallbackAttempted,
      marketDataFallbackAvailable: marketDataSource === "brapi_quote",
      fundamentalsIsStale,
      fundamentalsFetchedAt,
      fundamentalsRefresh,
      valuationSource: valuationEvidence.source,
      valuationMarketDataDate: valuationEvidence.marketDataDate,
      valuationMethod: marketCapIdentityVerified ? "issuer_market_cap" : null,
      valuationUnavailableReason: valuationEvidence.unavailableReason,
      totalMs: Date.now() - startedAt,
    });
    const ltmPeriods = ltmFlowPeriods(periods);
    return {
      ticker,
      cnpj: expectedCnpj,
      companyName: null,
      price: marketPrice,
      marketCap,
      changePercent: null,
      priceUpdatedAt: marketPriceDate,
      history: [],
      fundamentals: [...periods, ...ltmPeriods],
      indicators: calculateAnalysisIndicators(periods, valuationEvidence),
      marketDataIdentityVerified,
      marketCapIdentityVerified,
      fundamentalsIsStale,
      fundamentalsFetchedAt,
      fundamentalsRefresh,
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

  private async getRefreshState(
    ticker: string,
    cnpj: string,
  ): Promise<FundamentalsRefreshState> {
    if (!this.repository.getRefresh)
      return { status: "idle", retryAfter: null, errorCode: null };
    return this.repository.getRefresh(
      ticker,
      cnpj,
      currentFundamentalsSourceVersion(),
    );
  }

  async getFundamentalsRefreshState(
    rawTicker: unknown,
    rawCnpj: unknown,
  ): Promise<FundamentalsRefreshState> {
    const parsedTicker = tickerSchema.safeParse(rawTicker);
    if (!parsedTicker.success)
      throw new ApplicationError(parsedTicker.error.issues[0]!.message, 400);
    const cnpj = normalizeCnpj(typeof rawCnpj === "string" ? rawCnpj : null);
    if (cnpj.length !== 14)
      throw new ApplicationError(
        "Não foi possível confirmar o CNPJ do emissor.",
        422,
      );
    return this.getRefreshState(parsedTicker.data, cnpj);
  }

  async requestFundamentalsRefresh(
    rawTicker: unknown,
    rawCnpj: unknown,
    requestId?: string,
  ) {
    const parsedTicker = tickerSchema.safeParse(rawTicker);
    if (!parsedTicker.success)
      throw new ApplicationError(parsedTicker.error.issues[0]!.message, 400);
    const cnpj = normalizeCnpj(typeof rawCnpj === "string" ? rawCnpj : null);
    if (cnpj.length !== 14)
      throw new ApplicationError(
        "Não foi possível confirmar o CNPJ do emissor.",
        422,
      );
    if (!this.repository.claimRefresh)
      throw new ApplicationError(
        "Atualização de fundamentos indisponível.",
        503,
      );
    const ticker = parsedTicker.data;
    const sourceVersion = currentFundamentalsSourceVersion();
    const leaseToken = await this.repository.claimRefresh(
      ticker,
      cnpj,
      sourceVersion,
    );
    const state = leaseToken
      ? { status: "running" as const, retryAfter: null, errorCode: null }
      : await this.getRefreshState(ticker, cnpj);
    logger.info("stock_fundamentals_refresh_claimed", {
      requestId,
      ticker,
      claimed: Boolean(leaseToken),
      status: state.status,
    });
    return {
      claimed: Boolean(leaseToken),
      state,
      run: leaseToken
        ? () =>
            this.runClaimedRefresh(
              ticker,
              cnpj,
              sourceVersion,
              leaseToken,
              requestId,
            )
        : null,
    };
  }

  async refreshDueFundamentals(requestId?: string, batchSize = 5) {
    if (!this.repository.listDueRefreshes)
      throw new ApplicationError(
        "A atualização programada dos fundamentos não está disponível.",
        503,
      );
    const due = await this.repository.listDueRefreshes(
      currentFundamentalsSourceVersion(),
      batchSize,
    );
    let attemptedIssuers = 0;
    let updatedIssuers = 0;
    let unavailableIssuers = 0;

    for (const item of due) {
      const refresh = await this.requestFundamentalsRefresh(
        item.ticker,
        item.cnpj,
        requestId,
      );
      if (!refresh.run) continue;
      attemptedIssuers += 1;
      await refresh.run();
      const state = await this.getRefreshState(item.ticker, item.cnpj);
      if (state.status === "completed") updatedIssuers += 1;
      else unavailableIssuers += 1;
    }

    return {
      selectedIssuers: due.length,
      attemptedIssuers,
      updatedIssuers,
      unavailableIssuers,
      remainingIssuers: due.length === batchSize ? 1 : 0,
    };
  }

  private async runClaimedRefresh(
    ticker: string,
    cnpj: string,
    sourceVersion: string,
    leaseToken: string,
    requestId?: string,
  ) {
    const startedAt = Date.now();
    try {
      const periods = await this.fundamentalsProvider.getByTicker({
        ticker,
        cnpj,
      });
      if (!periods.length) {
        await this.markRefreshFailed(
          ticker,
          cnpj,
          sourceVersion,
          leaseToken,
          "NO_VALID_DATA",
          requestId,
        );
        return;
      }
      const saved = await this.repository.completeRefresh?.(
        ticker,
        cnpj,
        sourceVersion,
        leaseToken,
        periods,
      );
      logger.info("stock_fundamentals_refresh_finished", {
        requestId,
        ticker,
        fenced: saved === false,
        periods: saved ? periods.length : 0,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await this.markRefreshFailed(
        ticker,
        cnpj,
        sourceVersion,
        leaseToken,
        error instanceof ApplicationError
          ? "PROVIDER_REJECTED"
          : "PROVIDER_ERROR",
        requestId,
      );
      logger.error("stock_fundamentals_refresh_failed", {
        requestId,
        ticker,
        errorType: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async markRefreshFailed(
    ticker: string,
    cnpj: string,
    sourceVersion: string,
    leaseToken: string,
    errorCode: string,
    requestId?: string,
  ) {
    try {
      await this.repository.failRefresh?.(
        ticker,
        cnpj,
        sourceVersion,
        leaseToken,
        errorCode,
      );
    } catch (error) {
      logger.error("stock_fundamentals_refresh_failure_record_failed", {
        requestId,
        ticker,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  }
}

export const stockAnalysisService = new StockAnalysisService();
