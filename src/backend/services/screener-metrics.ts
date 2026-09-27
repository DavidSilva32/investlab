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
  version: number;
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
  equityVersion: number | null;
  equityPackageYear: number | null;
  equityOpeningPeriod: string | null;
  equityOpeningVersion: number | null;
  equityOpeningPackageYear: number | null;
  revenueVersion: number | null;
  revenuePackageYear: number | null;
  netIncomeVersion: number | null;
  netIncomePackageYear: number | null;
  netMargin: number | null;
  roe: number | null;
  operatingCashFlow: number | null;
  operatingCashFlowPeriod: string | null;
  operatingCashFlowVersion: number | null;
  operatingCashFlowPackageYear: number | null;
  operatingCashFlowComparableToNetIncome: boolean | null;
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
  sectorComparability: "not_validated";
  dimensions: DiscoveryDimension[];
  evidence: DiscoveryEvidencePoint[];
};

export function assessCompanyForDiscovery(
  company: ScreenerCompany,
): DiscoveryAssessment {
  const annual = annualConceptValues(company.facts);
  const alignedResults = [...annual.entries()]
    .flatMap(([year, values]) => {
      const revenue = values.get("3.01");
      const income = values.get("3.11");
      return sameAnnualObservation(revenue, income) && income
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
    const resultPeriodMatches = sameAnnualObservation(revenue, income);
    const equityPeriodMatches = sameAnnualObservation(income, equity);
    const roe =
      equityPeriodMatches &&
      previousEquity &&
      previousEquity.value > 0 &&
      equity.value > 0 &&
      previousEquity.packageYear !== null &&
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
      equityVersion: equity?.version ?? null,
      equityPackageYear: equity?.packageYear ?? null,
      equityOpeningPeriod: roe !== null ? previousEquity!.referenceDate : null,
      equityOpeningVersion: roe !== null ? previousEquity!.version : null,
      equityOpeningPackageYear:
        roe !== null ? previousEquity!.packageYear : null,
      revenueVersion: revenue?.version ?? null,
      revenuePackageYear: revenue?.packageYear ?? null,
      netIncomeVersion: income?.version ?? null,
      netIncomePackageYear: income?.packageYear ?? null,
      netMargin:
        resultPeriodMatches && revenue!.value > 0
          ? (income!.value / revenue!.value) * 100
          : null,
      roe,
      operatingCashFlow: cashFlow?.value ?? null,
      operatingCashFlowPeriod: cashFlow?.referenceDate ?? null,
      operatingCashFlowVersion: cashFlow?.version ?? null,
      operatingCashFlowPackageYear: cashFlow?.packageYear ?? null,
      operatingCashFlowComparableToNetIncome:
        cashFlow && income ? sameAnnualObservation(cashFlow, income) : null,
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
    status: available ? "available" : "unavailable",
    explanation,
  });
  return {
    period: alignedResults[0]?.period ?? null,
    source: "CVM DFP consolidada anual",
    sectorComparability: "not_validated",
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
        "O status desta dimensão indica apenas a disponibilidade do ROE, calculado com lucro e PL médio entre saldos anuais adjacentes compatíveis. A margem líquida aparece em Resultados.",
      ),
      dimension(
        "cash",
        "Caixa",
        evidence.some((item) => item.operatingCashFlow !== null),
        "Esta dimensão indica a disponibilidade do fluxo de caixa operacional bruto da conta 6.01 da DFC-MI. A comparação com o lucro só fica disponível quando data, versão e pacote coincidem; nos demais casos, permanece indisponível.",
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
