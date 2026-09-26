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
  sourceFile?: string;
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

function latestCompleteYear(facts: ScreenerFact[]) {
  return (
    [...annualConceptValues(facts)]
      .filter(([, values]) => {
        if (!["3.01", "3.11", "2.03"].every((code) => values.has(code)))
          return false;
        return (
          new Set(
            [...values.values()].map(({ referenceDate }) => referenceDate),
          ).size === 1
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
  const roe =
    income !== null &&
    equity !== null &&
    equity > 0 &&
    previousEquity !== null &&
    previousEquity > 0 &&
    sameAnnualPeriod(
      current?.get("2.03")?.referenceDate,
      previousEquityFact?.referenceDate,
    )
      ? (income / ((equity + previousEquity) / 2)) * 100
      : null;
  const netMargin =
    income !== null && revenue !== null && revenue > 0
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
            valuationMarketDate: null,
            valuationFinancialDate: null,
            valuationSourceTicker: null,
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

export type DiscoveryDimensionStatus = "available" | "unavailable";
export type DiscoveryEvidencePoint = {
  year: number;
  revenue: number | null;
  revenuePeriod: string | null;
  netIncome: number | null;
  netIncomePeriod: string | null;
  equity: number | null;
  equityPeriod: string | null;
  netMargin: number | null;
  roe: number | null;
  operatingCashFlow: number | null;
  operatingCashFlowPeriod: string | null;
};
export type DiscoveryDimension = {
  id: "results" | "profitability" | "cash" | "financial_structure" | "capital";
  label: string;
  status: DiscoveryDimensionStatus;
  explanation: string;
};
export type DiscoveryAssessment = {
  period: string | null;
  source: "CVM DFP consolidada anual";
  dimensions: DiscoveryDimension[];
  evidence: DiscoveryEvidencePoint[];
};

export function assessCompanyForDiscovery(
  company: ScreenerCompany,
): DiscoveryAssessment {
  const coveredSector = isValidatedSector(company.sector);
  const annual = annualConceptValues(company.facts);
  const alignedResults = [...annual.entries()]
    .flatMap(([year, values]) => {
      const revenue = values.get("3.01");
      const income = values.get("3.11");
      return revenue && income && revenue.referenceDate === income.referenceDate
        ? [{ year, period: income.referenceDate }]
        : [];
    })
    .sort((left, right) => right.year - left.year);
  const anchorYear = alignedResults[0]?.year ?? Math.max(...annual.keys(), 0);
  const windowYears =
    anchorYear > 0
      ? Array.from({ length: 5 }, (_, index) => anchorYear - 4 + index)
      : [];
  const evidence: DiscoveryEvidencePoint[] = windowYears.map((year) => {
    const values = annual.get(year) ?? new Map();
    const revenue = values.get("3.01");
    const income = values.get("3.11");
    const equity = values.get("2.03");
    const previousEquity = annual.get(year - 1)?.get("2.03");
    const resultPeriodMatches =
      revenue !== undefined &&
      income !== undefined &&
      revenue.referenceDate === income.referenceDate;
    const equityPeriodMatches =
      income !== undefined &&
      equity !== undefined &&
      income.referenceDate === equity.referenceDate;
    const roe =
      equityPeriodMatches &&
      previousEquity &&
      previousEquity.value > 0 &&
      equity.value > 0 &&
      sameAnnualPeriod(equity.referenceDate, previousEquity.referenceDate)
        ? (income!.value / ((equity.value + previousEquity.value) / 2)) * 100
        : null;
    const cashFlow = values.get("6.01");
    return {
      year,
      revenue: revenue?.value ?? null,
      revenuePeriod: revenue?.referenceDate ?? null,
      netIncome: income?.value ?? null,
      netIncomePeriod: income?.referenceDate ?? null,
      equity: equity?.value ?? null,
      equityPeriod: equity?.referenceDate ?? null,
      netMargin:
        resultPeriodMatches && revenue!.value > 0
          ? (income!.value / revenue!.value) * 100
          : null,
      roe,
      operatingCashFlow:
        cashFlow && income && cashFlow.referenceDate === income.referenceDate
          ? cashFlow.value
          : null,
      operatingCashFlowPeriod:
        cashFlow && income && cashFlow.referenceDate === income.referenceDate
          ? cashFlow.referenceDate
          : null,
    };
  });
  const dimension = (
    id: DiscoveryDimension["id"],
    label: string,
    available: boolean,
    explanation: string,
  ): DiscoveryDimension => ({
    id,
    label,
    status: coveredSector && available ? "available" : "unavailable",
    explanation: !coveredSector
      ? "A comparabilidade desta metodologia ainda não foi validada para o setor."
      : explanation,
  });
  return {
    period: alignedResults[0]?.period ?? null,
    source: "CVM DFP consolidada anual",
    dimensions: [
      dimension(
        "results",
        "Resultados",
        evidence.some(
          (item) => item.revenue !== null || item.netIncome !== null,
        ),
        "Receita, lucro e margem são apresentados por exercício para observar a evolução histórica; não geram aprovação ou reprovação automáticas.",
      ),
      dimension(
        "profitability",
        "Rentabilidade",
        evidence.some((item) => item.roe !== null),
        "ROE usa lucro do exercício e a média do patrimônio líquido entre saldos anuais compatíveis. Períodos sem os dois saldos ficam indisponíveis.",
      ),
      dimension(
        "cash",
        "Caixa",
        evidence.some((item) => item.operatingCashFlow !== null),
        "Fluxo operacional usa a conta 6.01 da DFC pelo método indireto (DFC-MI), comparada ao lucro do mesmo exercício. Sem essa fonte, o dado fica indisponível.",
      ),
      dimension(
        "financial_structure",
        "Estrutura financeira",
        false,
        "Dívida e caixa permanecem indisponíveis até validar as contas e conceitos CVM aplicáveis, incluindo diferenças setoriais.",
      ),
      dimension(
        "capital",
        "Capital",
        evidence.some((item) => item.equity !== null),
        "A evolução do patrimônio líquido é apresentada no histórico. Quantidade de ações e diluição não fazem parte desta versão.",
      ),
    ],
    evidence,
  };
}
