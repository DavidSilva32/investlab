import { z } from "zod";

export const screenerFilterSchema = z.object({
  positiveProfitYears: z.number().int().min(1).max(5).optional(),
  equityPositive: z.boolean().optional(),
  minimumRoe: z.number().finite().min(-100).max(1000).optional(),
  minimumNetMargin: z.number().finite().min(-1000).max(1000).optional(),
  maximumPe: z.number().finite().positive().max(10000).optional(),
  maximumPb: z.number().finite().positive().max(10000).optional(),
});

export type ScreenerFilters = z.infer<typeof screenerFilterSchema>;

export type ScreenerFact = {
  referenceDate: string;
  accountCode: string;
  value: string | number;
  documentType: string;
  statementScope: string;
  exerciseOrder: string;
};

export type ScreenerSecurity = { ticker: string; name: string };

export type ScreenerCompany = {
  cnpj: string;
  cvmCode: string;
  name: string;
  sector: string | null;
  quantitativeEligible?: boolean;
  securities: ScreenerSecurity[];
  facts: ScreenerFact[];
  marketSnapshot: {
    marketCap: string | number | null;
    observedAt: Date;
    classSemanticsValidated: boolean;
  } | null;
};

export type ScreenerMetrics = {
  latestNetIncome: number | null;
  latestRevenue: number | null;
  latestEquity: number | null;
  roe: number | null;
  netMargin: number | null;
  pe: number | null;
  pb: number | null;
  positiveProfitYears: number;
};

export type ScreenerResult = Omit<
  ScreenerCompany,
  "facts" | "marketSnapshot"
> & {
  metrics: ScreenerMetrics;
};

const marketFreshnessMs = 7 * 24 * 60 * 60 * 1000;

function finiteValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isSupportedAnnualFact(fact: ScreenerFact) {
  return (
    fact.documentType === "DFP" &&
    fact.statementScope === "CONSOLIDATED" &&
    fact.exerciseOrder === "ULTIMO"
  );
}

function latestByAccount(facts: ScreenerFact[]) {
  const latest = new Map<string, { year: number; value: number }>();
  for (const fact of facts) {
    if (!isSupportedAnnualFact(fact)) continue;
    const value = finiteValue(fact.value);
    const year = Number(fact.referenceDate.slice(0, 4));
    if (value === null || !Number.isInteger(year) || year <= 0) continue;
    const current = latest.get(fact.accountCode);
    if (!current || year > current.year)
      latest.set(fact.accountCode, { year, value });
  }
  return latest;
}

function profitsByYear(facts: ScreenerFact[]) {
  const profits = new Map<number, number>();
  for (const fact of facts) {
    if (fact.accountCode !== "3.11" || !isSupportedAnnualFact(fact)) continue;
    const value = finiteValue(fact.value);
    const year = Number(fact.referenceDate.slice(0, 4));
    if (value === null || !Number.isInteger(year) || year <= 0) continue;
    const current = profits.get(year);
    if (current === undefined || value > current) profits.set(year, value);
  }
  return profits;
}

function latestFinancialYear(facts: ScreenerFact[]) {
  const years = facts.flatMap((fact) => {
    if (
      !isSupportedAnnualFact(fact) ||
      !["3.01", "3.11", "2.03"].includes(fact.accountCode)
    )
      return [];
    const year = Number(fact.referenceDate.slice(0, 4));
    return Number.isInteger(year) &&
      year > 0 &&
      finiteValue(fact.value) !== null
      ? [year]
      : [];
  });
  return years.length > 0 ? Math.max(...years) : null;
}

export function calculateScreenerMetrics(
  facts: ScreenerFact[],
  marketSnapshot: ScreenerCompany["marketSnapshot"],
  now = new Date(),
): ScreenerMetrics {
  const latest = latestByAccount(facts);
  const profits = profitsByYear(facts);
  const income = latest.get("3.11") ?? null;
  const revenue = latest.get("3.01") ?? null;
  const equity = latest.get("2.03") ?? null;
  const previousEquity =
    [...facts]
      .filter(
        (fact) =>
          fact.accountCode === "2.03" &&
          isSupportedAnnualFact(fact) &&
          Number(fact.referenceDate.slice(0, 4)) > 0 &&
          Number(fact.referenceDate.slice(0, 4)) < (equity?.year ?? Infinity),
      )
      .sort((left, right) =>
        right.referenceDate.localeCompare(left.referenceDate),
      )
      .map((fact) => finiteValue(fact.value))
      .find((value) => value !== null) ?? null;

  const consecutiveEquity =
    equity !== null &&
    previousEquity !== null &&
    [...facts].some(
      (fact) =>
        fact.accountCode === "2.03" &&
        isSupportedAnnualFact(fact) &&
        Number(fact.referenceDate.slice(0, 4)) === equity.year - 1 &&
        finiteValue(fact.value) === previousEquity,
    );
  const roe =
    consecutiveEquity &&
    income !== null &&
    equity !== null &&
    income.year === equity.year &&
    equity.value > 0 &&
    previousEquity !== null &&
    previousEquity > 0
      ? (income.value / ((equity.value + previousEquity) / 2)) * 100
      : null;
  const netMargin =
    revenue !== null &&
    income !== null &&
    revenue.year === income.year &&
    revenue.value > 0
      ? (income.value / revenue.value) * 100
      : null;

  const observedAt = marketSnapshot?.observedAt.getTime() ?? Number.NaN;
  const marketCap = marketSnapshot?.classSemanticsValidated
    ? finiteValue(marketSnapshot.marketCap)
    : null;
  const freshMarketCap =
    marketCap !== null &&
    marketCap > 0 &&
    observedAt <= now.getTime() &&
    now.getTime() - observedAt <= marketFreshnessMs
      ? marketCap
      : null;

  const latestProfitYear = latestFinancialYear(facts);
  let positiveProfitYears = 0;
  while (
    latestProfitYear !== null &&
    profits.get(latestProfitYear - positiveProfitYears) !== undefined &&
    profits.get(latestProfitYear - positiveProfitYears)! > 0
  )
    positiveProfitYears += 1;

  return {
    latestNetIncome: income?.value ?? null,
    latestRevenue: revenue?.value ?? null,
    latestEquity: equity?.value ?? null,
    roe,
    netMargin,
    pe:
      freshMarketCap !== null && income !== null && income.value > 0
        ? freshMarketCap / income.value
        : null,
    pb:
      freshMarketCap !== null && equity !== null && equity.value > 0
        ? freshMarketCap / equity.value
        : null,
    positiveProfitYears,
  };
}

export function filterScreenerCompanies(
  companies: ScreenerCompany[],
  filters: ScreenerFilters,
  now = new Date(),
): ScreenerResult[] {
  const parsedFilters = screenerFilterSchema.parse(filters);
  return companies
    .flatMap((company) => {
      const metrics =
        company.quantitativeEligible === false
          ? {
              latestNetIncome: null,
              latestRevenue: null,
              latestEquity: null,
              roe: null,
              netMargin: null,
              pe: null,
              pb: null,
              positiveProfitYears: 0,
            }
          : calculateScreenerMetrics(
              company.facts,
              company.marketSnapshot,
              now,
            );
      if (
        parsedFilters.positiveProfitYears !== undefined &&
        metrics.positiveProfitYears < parsedFilters.positiveProfitYears
      )
        return [];
      if (
        parsedFilters.equityPositive &&
        !(metrics.latestEquity !== null && metrics.latestEquity > 0)
      )
        return [];
      if (
        parsedFilters.minimumRoe !== undefined &&
        !(metrics.roe !== null && metrics.roe >= parsedFilters.minimumRoe)
      )
        return [];
      if (
        parsedFilters.minimumNetMargin !== undefined &&
        !(
          metrics.netMargin !== null &&
          metrics.netMargin >= parsedFilters.minimumNetMargin
        )
      )
        return [];
      if (
        parsedFilters.maximumPe !== undefined &&
        !(metrics.pe !== null && metrics.pe <= parsedFilters.maximumPe)
      )
        return [];
      if (
        parsedFilters.maximumPb !== undefined &&
        !(metrics.pb !== null && metrics.pb <= parsedFilters.maximumPb)
      )
        return [];
      const {
        facts: _facts,
        marketSnapshot: _marketSnapshot,
        ...identity
      } = company;
      return [{ ...identity, metrics }];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
