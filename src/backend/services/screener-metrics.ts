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
  accountLabel: string | null;
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
function normalizeAccountingLabel(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSector(value: string | null) {
  return normalizeAccountingLabel(value);
}

const validatedNonFinancialSectors = new Set([
  "PETROLEO",
  "PETROLEO E GAS",
  "EXTRACAO MINERAL",
  "MINERACAO",
  "COMERCIO ATACADO E VAREJO",
  "CONSTRUCAO CIVIL MAT CONSTR E DECORACAO",
  "SERVICOS TRANSPORTE E LOGISTICA",
  "MAQS EQUIP VEIC E PECAS",
  "AGRICULTURA ACUCAR ALCOOL E CANA",
  "METALURGIA E SIDERURGIA",
  "TEXTIL E VESTUARIO",
  "ENERGIA ELETRICA",
]);

const validatedSectorAliases: Record<string, string> = {
  PETROLEO: "PETROLEO E GAS",
  MINERACAO: "EXTRACAO MINERAL",
  "MAQUINAS EQUIPAMENTOS VEICULOS E PECAS": "MAQS EQUIP VEIC E PECAS",
  "CONST CIVIL MAT CONSTR E DECORACAO":
    "CONSTRUCAO CIVIL MAT CONSTR E DECORACAO",
  "EMP ADM PART COMERCIO ATACADO E VAREJO": "COMERCIO ATACADO E VAREJO",
  "EMP ADM PART CONST CIVIL MAT CONST E DECORACAO":
    "CONSTRUCAO CIVIL MAT CONSTR E DECORACAO",
  "EMP ADM PART SERVICOS TRANSPORTE E LOGISTICA":
    "SERVICOS TRANSPORTE E LOGISTICA",
  "EMP ADM PART MAQS EQUIP VEIC E PECAS": "MAQS EQUIP VEIC E PECAS",
  "EMP ADM PART AGRICULTURA ACUCAR ALCOOL E CANA":
    "AGRICULTURA ACUCAR ALCOOL E CANA",
  "EMP ADM PART METALURGIA E SIDERURGIA": "METALURGIA E SIDERURGIA",
  "EMP ADM PART TEXTIL E VESTUARIO": "TEXTIL E VESTUARIO",
  "EMP ADM PART ENERGIA ELETRICA": "ENERGIA ELETRICA",
  "EMP ADM PART PETROLEO E GAS": "PETROLEO E GAS",
  "EMP ADM PART EXTRACAO MINERAL": "EXTRACAO MINERAL",
};
const financialSectors = new Set([
  "BANCOS",
  "SEGURADORAS E CORRETORAS",
  "EMP ADM PART SEGURADORAS E CORRETORAS",
  "EMP ADM PART INTERMEDIACAO FINANCEIRA",
  "BOLSAS DE VALORES MERCADORIAS E FUTUROS",
]);

const accountLabelAliases: Record<string, ReadonlySet<string>> = {
  "3.01": new Set(["RECEITA DE VENDA DE BENS E OU SERVICOS"]),
  "3.11": new Set([
    "LUCRO PREJUIZO CONSOLIDADO DO PERIODO",
    "LUCRO PREJUIZO DO PERIODO",
  ]),
  "2.03": new Set(["PATRIMONIO LIQUIDO CONSOLIDADO"]),
};

function isValidatedFact(fact: ScreenerFact) {
  return (
    isSupportedAnnualFact(fact) &&
    (accountLabelAliases[fact.accountCode]?.has(
      normalizeAccountingLabel(fact.accountLabel),
    ) ??
      false)
  );
}

function isValidatedSector(sector: string | null) {
  const normalizedSector = normalizeSector(sector);
  if (financialSectors.has(normalizedSector)) return false;
  return validatedNonFinancialSectors.has(
    validatedSectorAliases[normalizedSector] ?? normalizedSector,
  );
}

function annualConceptValues(facts: ScreenerFact[]) {
  const byYear = new Map<
    number,
    Map<string, { referenceDate: string; value: number }>
  >();
  for (const fact of facts) {
    if (!isValidatedFact(fact)) continue;
    const value = finiteValue(fact.value);
    const year = Number(fact.referenceDate.slice(0, 4));
    if (value === null || !Number.isInteger(year) || year <= 0) continue;
    const yearValues = byYear.get(year) ?? new Map();
    const current = yearValues.get(fact.accountCode);
    if (
      !current ||
      fact.referenceDate > current.referenceDate ||
      (fact.referenceDate === current.referenceDate && value > current.value)
    )
      yearValues.set(fact.accountCode, {
        referenceDate: fact.referenceDate,
        value,
      });
    byYear.set(year, yearValues);
  }
  return byYear;
}

function latestCompleteYear(facts: ScreenerFact[]) {
  return (
    [...annualConceptValues(facts)]
      .filter(([, values]) =>
        ["3.01", "3.11", "2.03"].every((code) => values.has(code)),
      )
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
  const previousEquity =
    year === null ? null : (concepts.get(year - 1)?.get("2.03")?.value ?? null);
  const roe =
    income !== null &&
    equity !== null &&
    equity > 0 &&
    previousEquity !== null &&
    previousEquity > 0
      ? (income / ((equity + previousEquity) / 2)) * 100
      : null;
  const netMargin =
    income !== null && revenue !== null && revenue > 0
      ? (income / revenue) * 100
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
    latestNetIncome: income,
    latestRevenue: revenue,
    latestEquity: equity,
    roe,
    netMargin,
    pe:
      freshMarketCap !== null && income !== null && income > 0
        ? freshMarketCap / income
        : null,
    pb:
      freshMarketCap !== null && equity !== null && equity > 0
        ? freshMarketCap / equity
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
      const quantitativeEligible =
        isValidatedSector(company.sector) &&
        latestCompleteYear(company.facts) !== null;
      const metrics = quantitativeEligible
        ? calculateScreenerMetrics(company.facts, company.marketSnapshot, now)
        : {
            latestNetIncome: null,
            latestRevenue: null,
            latestEquity: null,
            roe: null,
            netMargin: null,
            pe: null,
            pb: null,
            positiveProfitYears: 0,
          };
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
        quantitativeEligible: _previousEligibility,
        ...identity
      } = company;
      return [{ ...identity, quantitativeEligible, metrics }];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
