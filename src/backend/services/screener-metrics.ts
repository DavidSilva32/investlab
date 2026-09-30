import { z } from "zod";
import {
  classifyCvmSector,
  cvmSectorClassificationMessage,
  type CvmSectorClassification,
} from "@/lib/cvm-sector-classification";

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
  accountLabel: string | null;
  value: string | number;
  documentType: string;
  statementScope: string;
  exerciseOrder: string;
  version: number;
  sourceFile?: string;
};

export type ScreenerSecurity = { ticker: string; name: string };

export type ScreenerCompany = {
  cnpj: string;
  cvmCode: string;
  name: string;
  sector: string | null;

  securities: ScreenerSecurity[];
  facts: ScreenerFact[];
  marketSnapshot: {
    marketCap: string | number | null;
    observedAt: Date;
    quoteObservedAt: Date | null;
    sourceTicker: string;
    classSemanticsValidated: boolean;
    marketRefreshRunId?: string | null;
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
  valuationMarketDate: string | null;
  valuationFinancialDate: string | null;
  valuationSourceTicker: string | null;
  positiveProfitYears: number;
};

export type ScreenerResult = Omit<
  ScreenerCompany,
  "facts" | "marketSnapshot"
> & {
  sectorClassification: CvmSectorClassification;
  methodologyStatus: "evaluated" | "out_of_scope" | "not_assessed";
  methodologyMessage: string;
  filterStatus: "matches" | "not_assessed";
  metrics: ScreenerMetrics;
};

const marketFreshnessMs = 7 * 24 * 60 * 60 * 1000;
function normalizeAccountingLabel(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const accountLabelAliases: Record<string, ReadonlySet<string>> = {
  "3.01": new Set(["RECEITA DE VENDA DE BENS E OU SERVICOS"]),
  "3.11": new Set([
    "LUCRO PREJUIZO CONSOLIDADO DO PERIODO",
    "LUCRO PREJUIZO DO PERIODO",
  ]),
  "2.03": new Set(["PATRIMONIO LIQUIDO CONSOLIDADO"]),
  "6.01": new Set([
    "CAIXA LIQUIDO DAS ATIVIDADES OPERACIONAIS",
    "CAIXA LIQUIDO ATIVIDADES OPERACIONAIS",
  ]),
};

function isValidatedFact(fact: ScreenerFact) {
  return (
    isSupportedAnnualFact(fact) &&
    (fact.accountCode !== "6.01" ||
      /DFC_MI_con_/i.test(fact.sourceFile ?? "")) &&
    (accountLabelAliases[fact.accountCode]?.has(
      normalizeAccountingLabel(fact.accountLabel),
    ) ??
      false)
  );
}

type AnnualConceptValue = {
  referenceDate: string;
  value: number;
  version: number;
  packageYear: number | null;
};

function sourcePackageYear(sourceFile: string | undefined) {
  const match = sourceFile?.match(/_(\d{4})\.csv$/i);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year > 0 ? year : null;
}

function annualConceptValues(facts: ScreenerFact[]) {
  const byYear = new Map<number, Map<string, AnnualConceptValue>>();
  for (const fact of facts) {
    if (!isValidatedFact(fact)) continue;
    const value = finiteValue(fact.value);
    const year = Number(fact.referenceDate.slice(0, 4));
    if (value === null || !Number.isInteger(year) || year <= 0) continue;
    const yearValues = byYear.get(year) ?? new Map();
    const current = yearValues.get(fact.accountCode);
    const packageYear = sourcePackageYear(fact.sourceFile);
    if (
      !current ||
      (packageYear ?? 0) > (current.packageYear ?? 0) ||
      (packageYear === current.packageYear &&
        (fact.version > current.version ||
          (fact.version === current.version &&
            (fact.referenceDate > current.referenceDate ||
              (fact.referenceDate === current.referenceDate &&
                value > current.value)))))
    )
      yearValues.set(fact.accountCode, {
        referenceDate: fact.referenceDate,
        value,
        version: fact.version,
        packageYear,
      });
    byYear.set(year, yearValues);
  }
  return byYear;
}
function sameAnnualPeriod(
  currentDate: string | undefined,
  previousDate: string | undefined,
) {
  return (
    currentDate !== undefined &&
    previousDate !== undefined &&
    currentDate.slice(4) === previousDate.slice(4) &&
    Number(currentDate.slice(0, 4)) - Number(previousDate.slice(0, 4)) === 1
  );
}

function sameAnnualPackage(
  left: AnnualConceptValue | undefined,
  right: AnnualConceptValue | undefined,
) {
  return (
    left !== undefined &&
    right !== undefined &&
    left.packageYear !== null &&
    left.packageYear === right.packageYear
  );
}

function sameAnnualObservation(
  left: AnnualConceptValue | undefined,
  right: AnnualConceptValue | undefined,
) {
  return (
    left !== undefined &&
    right !== undefined &&
    sameAnnualPackage(left, right) &&
    left.referenceDate === right.referenceDate &&
    left.version === right.version
  );
}

function latestCompleteYear(facts: ScreenerFact[]) {
  return (
    [...annualConceptValues(facts)]
      .filter(([, values]) => {
        if (!["3.01", "3.11", "2.03"].every((code) => values.has(code)))
          return false;
        const coreValues = ["3.01", "3.11", "2.03"].map((code) =>
          values.get(code)!,
        );
        return (
          new Set(coreValues.map(({ referenceDate }) => referenceDate)).size ===
            1 &&
          new Set(coreValues.map(({ version }) => version)).size === 1 &&
          new Set(coreValues.map(({ packageYear }) => packageYear)).size ===
            1 &&
          coreValues.every(({ packageYear }) => packageYear !== null)
        );
      })
      .sort(([left], [right]) => right - left)[0] ?? null
  );
}

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

function profitsByYear(facts: ScreenerFact[]) {
  return new Map(
    [...annualConceptValues(facts)]
      .filter(([, values]) => values.has("3.11"))
      .map(([year, values]) => [year, values.get("3.11")!.value]),
  );
}

function latestFinancialYear(facts: ScreenerFact[]) {
  return Math.max(...profitsByYear(facts).keys(), 0) || null;
}

function assessPositiveProfitYears(
  facts: ScreenerFact[],
  requiredYears: number,
): "matches" | "fails" | "not_assessed" {
  const latestYear = latestFinancialYear(facts);
  if (latestYear === null) return "not_assessed";

  const profits = profitsByYear(facts);
  for (let offset = 0; offset < requiredYears; offset += 1) {
    const profit = profits.get(latestYear - offset);
    if (profit === undefined) return "not_assessed";
    if (profit <= 0) return "fails";
  }
  return "matches";
}

export function calculateScreenerMetrics(
  facts: ScreenerFact[],
  marketSnapshot: ScreenerCompany["marketSnapshot"],
  now = new Date(),
): ScreenerMetrics {
  const concepts = annualConceptValues(facts);
  const complete = latestCompleteYear(facts);
  const profits = profitsByYear(facts);
  const year = complete?.[0] ?? null;
  const current = complete?.[1] ?? null;
  const income = current?.get("3.11")?.value ?? null;
  const revenue = current?.get("3.01")?.value ?? null;
  const equity = current?.get("2.03")?.value ?? null;
  const previousEquityFact =
    year === null ? undefined : concepts.get(year - 1)?.get("2.03");
  const previousEquity = previousEquityFact?.value ?? null;
  const currentIncomeFact = current?.get("3.11");
  const currentRevenueFact = current?.get("3.01");
  const currentEquityFact = current?.get("2.03");
  const roe =
    income !== null &&
    equity !== null &&
    equity > 0 &&
    previousEquity !== null &&
    previousEquity > 0 &&
    sameAnnualObservation(currentIncomeFact, currentEquityFact) &&
    previousEquityFact?.packageYear !== null &&
    previousEquityFact !== undefined &&
    sameAnnualPeriod(
      currentEquityFact?.referenceDate,
      previousEquityFact?.referenceDate,
    )
      ? (income / ((equity + previousEquity) / 2)) * 100
      : null;
  const netMargin =
    sameAnnualObservation(currentIncomeFact, currentRevenueFact) &&
    income !== null &&
    revenue !== null &&
    revenue > 0
      ? (income / revenue) * 100
      : null;

  const observedAt = marketSnapshot?.quoteObservedAt?.getTime() ?? Number.NaN;
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

  const pe =
    freshMarketCap !== null && income !== null && income > 0
      ? freshMarketCap / income
      : null;
  const pb =
    freshMarketCap !== null && equity !== null && equity > 0
      ? freshMarketCap / equity
      : null;
  const valuationAvailable = pe !== null || pb !== null;
  const valuationFinancialDate = valuationAvailable
    ? current!.get("3.11")!.referenceDate
    : null;
  const latestProfitYear = latestFinancialYear(facts);
  let positiveProfitYears = 0;
  while (
    latestProfitYear !== null &&
    positiveProfitYears < 5 &&
    profits.get(latestProfitYear - positiveProfitYears) !== undefined &&
    profits.get(latestProfitYear - positiveProfitYears)! > 0
  )
    positiveProfitYears += 1;

  return {
    latestNetIncome: income,
    latestRevenue: revenue,
    latestEquity: equity,
    roe,
    netMargin,
    pe,
    pb,
    valuationMarketDate: valuationAvailable
      ? marketSnapshot!.quoteObservedAt!.toISOString()
      : null,
    valuationFinancialDate,
    valuationSourceTicker: valuationAvailable
      ? marketSnapshot!.sourceTicker
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
  const hasFilters = Object.values(parsedFilters).some(
    (value) => value !== undefined,
  );
  return companies
    .flatMap((company) => {
      const sectorClassification = classifyCvmSector(company.sector);
      const isNonFinancial = sectorClassification === "non_financial";
      const hasCompleteData =
        isNonFinancial && latestCompleteYear(company.facts) !== null;
      const metrics: ScreenerMetrics = hasCompleteData
        ? calculateScreenerMetrics(company.facts, company.marketSnapshot, now)
        : {
            latestNetIncome: null,
            latestRevenue: null,
            latestEquity: null,
            roe: null,
            netMargin: null,
            pe: null,
            pb: null,
            valuationMarketDate: null,
            valuationFinancialDate: null,
            valuationSourceTicker: null,
            positiveProfitYears: 0,
          };
      const positiveProfitAssessment =
        parsedFilters.positiveProfitYears !== undefined
          ? assessPositiveProfitYears(
              company.facts,
              parsedFilters.positiveProfitYears,
            )
          : "not_assessed";
      const failed =
        (parsedFilters.positiveProfitYears !== undefined &&
          positiveProfitAssessment === "fails") ||
        (parsedFilters.equityPositive !== undefined &&
          metrics.latestEquity !== null &&
          metrics.latestEquity > 0 !== parsedFilters.equityPositive) ||
        (parsedFilters.minimumRoe !== undefined &&
          metrics.roe !== null &&
          metrics.roe < parsedFilters.minimumRoe) ||
        (parsedFilters.minimumNetMargin !== undefined &&
          metrics.netMargin !== null &&
          metrics.netMargin < parsedFilters.minimumNetMargin) ||
        (parsedFilters.maximumPe !== undefined &&
          metrics.pe !== null &&
          metrics.pe > parsedFilters.maximumPe) ||
        (parsedFilters.maximumPb !== undefined &&
          metrics.pb !== null &&
          metrics.pb > parsedFilters.maximumPb);
      if (failed) return [];
      const unavailable =
        !hasCompleteData ||
        (parsedFilters.positiveProfitYears !== undefined &&
          positiveProfitAssessment === "not_assessed") ||
        (parsedFilters.equityPositive !== undefined &&
          metrics.latestEquity === null) ||
        (parsedFilters.minimumRoe !== undefined && metrics.roe === null) ||
        (parsedFilters.minimumNetMargin !== undefined &&
          metrics.netMargin === null) ||
        (parsedFilters.maximumPe !== undefined && metrics.pe === null) ||
        (parsedFilters.maximumPb !== undefined && metrics.pb === null);
      const methodologyStatus: ScreenerResult["methodologyStatus"] =
        sectorClassification === "financial"
          ? "out_of_scope"
          : hasCompleteData
            ? "evaluated"
            : "not_assessed";
      const methodologyMessage =
        sectorClassification === "non_financial" && !hasCompleteData
          ? "Setor não financeiro validado, mas faltam demonstrações anuais completas para avaliar."
          : cvmSectorClassificationMessage(sectorClassification);
      return [
        {
          cnpj: company.cnpj,
          cvmCode: company.cvmCode,
          name: company.name,
          sector: company.sector,
          securities: company.securities,
          sectorClassification,
          methodologyStatus,
          methodologyMessage,
          filterStatus: (hasFilters && unavailable
            ? "not_assessed"
            : "matches") as ScreenerResult["filterStatus"],
          metrics,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
