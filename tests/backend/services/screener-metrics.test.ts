import { describe, expect, it } from "vitest";
import {
  assessCompanyForDiscovery,
  calculateScreenerMetrics,
  filterScreenerCompanies,
  screenerFilterSchema,
  type ScreenerCompany,
  type ScreenerFact,
} from "@/backend/services/screener-metrics";

const makeFact = (
  accountCode: string,
  year: number,
  value: string | number,
  overrides: Partial<ScreenerFact> = {},
): ScreenerFact => ({
  accountCode,
  accountLabel:
    overrides.accountLabel ??
    (
      {
        "3.01": "Receita de Venda de Bens e/ou Serviços",
        "3.11": "Lucro/Prejuízo Consolidado do Período",
        "2.03": "Patrimônio Líquido Consolidado",
      } as Record<string, string>
    )[accountCode] ??
    null,
  referenceDate: `${year}-12-31`,
  value,
  documentType: "DFP",
  statementScope: "CONSOLIDATED",
  exerciseOrder: "ULTIMO",
  version: 1,
  sourceFile: `DFP_con_${year}.csv`,
  ...overrides,
});

const facts = [
  makeFact("3.11", 2025, 100),
  makeFact("3.01", 2025, 500),
  makeFact("2.03", 2025, 400),
  makeFact("3.11", 2024, 50),
  makeFact("3.01", 2024, 300),
  makeFact("2.03", 2024, 300, { sourceFile: "DFP_con_2025.csv" }),
  makeFact("3.11", 2023, -10),
];
const company = (
  overrides: Partial<ScreenerCompany> = {},
): ScreenerCompany => ({
  cnpj: "33000167000101",
  cvmCode: "9512",
  name: "Petrobras",
  sector: "Petróleo e Gás",
  securities: [
    { ticker: "PETR3", name: "Petrobras ON" },
    { ticker: "PETR4", name: "Petrobras PN" },
  ],
  facts,
  marketSnapshot: {
    marketCap: 2000,
    observedAt: new Date("2026-09-20T00:00:00Z"),
    quoteObservedAt: new Date("2026-09-20T00:00:00Z"),
    sourceTicker: "PETR3",
    classSemanticsValidated: true,
  },
  ...overrides,
});
const now = new Date("2026-09-23T00:00:00Z");

describe("calculateScreenerMetrics", () => {
  it("calculates same-period ROE and margin and only class-safe fresh valuation ratios", () => {
    expect(
      calculateScreenerMetrics(facts, company().marketSnapshot, now),
    ).toEqual({
      latestNetIncome: 100,
      latestRevenue: 500,
      latestEquity: 400,
      roe: 28.57142857142857,
      netMargin: 20,
      pe: 20,
      pb: 5,
      valuationMarketDate: "2026-09-20T00:00:00.000Z",
      valuationFinancialDate: "2025-12-31",
      valuationSourceTicker: "PETR3",
      positiveProfitYears: 2,
    });
  });

  it.each([
    [null, "missing"],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        quoteObservedAt: new Date("2026-09-20T00:00:00Z"),
        sourceTicker: "PETR3",
        classSemanticsValidated: false,
      },
      "unvalidated",
    ],
    [
      {
        marketCap: null,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        quoteObservedAt: new Date("2026-09-20T00:00:00Z"),
        sourceTicker: "PETR3",
        classSemanticsValidated: true,
      },
      "missing market cap",
    ],
    [
      {
        marketCap: -1,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        quoteObservedAt: new Date("2026-09-20T00:00:00Z"),
        sourceTicker: "PETR3",
        classSemanticsValidated: true,
      },
      "nonpositive market cap",
    ],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-01T00:00:00Z"),
        quoteObservedAt: new Date("2026-09-01T00:00:00Z"),
        sourceTicker: "PETR3",
        classSemanticsValidated: true,
      },
      "stale",
    ],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-24T00:00:00Z"),
        quoteObservedAt: new Date("2026-09-24T00:00:00Z"),
        sourceTicker: "PETR3",
        classSemanticsValidated: true,
      },
      "future",
    ],
  ] as const)("leaves P/L and P/VP unavailable for %s", (snapshot, reason) => {
    expect(reason).toBeTruthy();
    const metrics = calculateScreenerMetrics(facts, snapshot, now);
    expect(metrics.pe).toBeNull();
    expect(metrics.pb).toBeNull();
  });

  it("requires positive annual earnings and equity for valuation multiples", () => {
    const lossFacts = facts.map((fact) =>
      fact.accountCode === "3.11" && fact.referenceDate === "2025-12-31"
        ? { ...fact, value: -100 }
        : fact,
    );
    const negativeEquityFacts = facts.map((fact) =>
      fact.accountCode === "2.03" && fact.referenceDate === "2025-12-31"
        ? { ...fact, value: -400 }
        : fact,
    );
    expect(
      calculateScreenerMetrics(lossFacts, company().marketSnapshot, now),
    ).toMatchObject({
      pe: null,
      pb: 5,
    });
    expect(
      calculateScreenerMetrics(
        negativeEquityFacts,
        company().marketSnapshot,
        now,
      ),
    ).toMatchObject({ pe: 20, pb: null });
  });

  it("requires matching year-end dates to calculate ROE", () => {
    const shiftedPreviousPeriod = facts.map((fact) =>
      fact.accountCode === "2.03" && fact.referenceDate === "2024-12-31"
        ? { ...fact, referenceDate: "2024-09-30" }
        : fact,
    );
    expect(
      calculateScreenerMetrics(
        shiftedPreviousPeriod,
        company().marketSnapshot,
        now,
      ),
    ).toMatchObject({ roe: null, pe: 20, pb: 5 });
  });
  it("rejects annual values that have different reference dates", () => {
    const differentDates = facts
      .filter((fact) => fact.referenceDate === "2025-12-31")
      .map((fact) =>
        fact.accountCode === "2.03"
          ? { ...fact, referenceDate: "2025-09-30" }
          : fact,
      );
    expect(
      calculateScreenerMetrics(differentDates, company().marketSnapshot, now),
    ).toMatchObject({
      latestNetIncome: null,
      latestEquity: null,
      pe: null,
      pb: null,
    });
  });
  it("uses the greatest annual profit when duplicate facts exist for one exercise", () => {
    const metrics = calculateScreenerMetrics(
      [
        makeFact("3.11", 2025, 20),
        makeFact("3.11", 2025, 10),
        makeFact("3.11", 2024, 5),
      ],
      null,
      now,
    );
    expect(metrics.positiveProfitYears).toBe(2);
  });

  it("does not turn missing or invalid facts into zero and rejects incompatible periods", () => {
    const metrics = calculateScreenerMetrics(
      [
        makeFact("3.11", 2025, ""),
        makeFact("3.01", 2024, 500),
        makeFact("2.03", 2025, "bad"),
        makeFact("2.03", 2024, 100),
        makeFact("2.03", 2023, "bad"),
        makeFact("3.11", 2024, 20, { statementScope: "INDIVIDUAL" }),
      ],
      null,
      now,
    );
    expect(metrics).toMatchObject({
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
    });
  });

  it("does not count year zero as a positive-profit exercise", () => {
    const metrics = calculateScreenerMetrics(
      [
        makeFact("3.11", 2025, 50, { referenceDate: "0000-12-31" }),
        makeFact("2.03", 2025, 100, { referenceDate: "0000-12-31" }),
      ],
      null,
      now,
    );
    expect(metrics).toMatchObject({ roe: null, positiveProfitYears: 0 });
  });

  it("uses explicit zero as data but does not make zero revenue a valid margin", () => {
    const metrics = calculateScreenerMetrics(
      [
        makeFact("3.11", 2025, 0),
        makeFact("3.01", 2025, 0),
        makeFact("2.03", 2025, 0),
      ],
      null,
      now,
    );
    expect(metrics.latestNetIncome).toBe(0);
    expect(metrics.latestRevenue).toBe(0);
    expect(metrics.netMargin).toBeNull();
    expect(metrics.latestEquity).toBe(0);
  });

  it("leaves equity-derived metrics unavailable when all equity facts are invalid", () => {
    const metrics = calculateScreenerMetrics(
      [makeFact("2.03", 2025, "not-a-number")],
      null,
      now,
    );
    expect(metrics.latestEquity).toBeNull();
    expect(metrics.roe).toBeNull();
  });

  it("does not compute ROE across missing or nonpositive equity years", () => {
    const metrics = calculateScreenerMetrics(
      [
        makeFact("3.11", 2025, 10),
        makeFact("2.03", 2025, 100),
        makeFact("2.03", 2023, 80),
      ],
      null,
      now,
    );
    expect(metrics.roe).toBeNull();
  });
});

describe("calculateScreenerMetrics", () => {
  it("leaves derived metrics unavailable across source packages and retains the issuer", () => {
    const mismatchedPackageFacts = facts.map((fact) =>
      fact.accountCode === "3.01" && fact.referenceDate === "2025-12-31"
        ? { ...fact, sourceFile: "DFP_con_2024.csv" }
        : fact,
    );
    const metrics = calculateScreenerMetrics(
      mismatchedPackageFacts,
      company().marketSnapshot,
      now,
    );
    expect(metrics).toMatchObject({
      latestNetIncome: null,
      latestRevenue: null,
      netMargin: null,
      roe: null,
      valuationFinancialDate: null,
    });

    const result = filterScreenerCompanies(
      [company({ facts: mismatchedPackageFacts })],
      {},
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].metrics).toMatchObject({
      latestNetIncome: null,
      latestRevenue: null,
      netMargin: null,
      roe: null,
    });
  });
});

describe("calculateScreenerMetrics package boundaries", () => {
  it("keeps core metrics when operating cash flow is from another package", () => {
    const factsWithMismatchedCash = [
      ...facts,
      makeFact("6.01", 2025, 125, {
        accountLabel: "Caixa Líquido das Atividades Operacionais",
        sourceFile: "DFP_cia_aberta_DFC_MI_con_2024.csv",
      }),
    ];
    expect(
      calculateScreenerMetrics(
        factsWithMismatchedCash,
        company().marketSnapshot,
        now,
      ),
    ).toMatchObject({
      latestNetIncome: 100,
      latestRevenue: 500,
      latestEquity: 400,
      roe: 28.57142857142857,
      netMargin: 20,
    });

    expect(
      assessCompanyForDiscovery(
        company({ facts: factsWithMismatchedCash }),
      ).evidence.at(-1),
    ).toMatchObject({
      operatingCashFlow: 125,
      operatingCashFlowPackageYear: 2024,
      operatingCashFlowComparableToNetIncome: false,
    });
  });

  it("accepts an adjacent opening equity balance from its own annual package", () => {
    const priorPackageOpeningEquity = facts.map((fact) =>
      fact.accountCode === "2.03" && fact.referenceDate === "2024-12-31"
        ? { ...fact, sourceFile: "DFP_con_2024.csv" }
        : fact,
    );
    expect(
      calculateScreenerMetrics(
        priorPackageOpeningEquity,
        company().marketSnapshot,
        now,
      ),
    ).toMatchObject({
      latestNetIncome: 100,
      latestEquity: 400,
      roe: 28.57142857142857,
    });
  });
});

describe("filterScreenerCompanies", () => {
  it("combines all supported filters and returns issuer groups without facts", () => {
    const result = filterScreenerCompanies(
      [company()],
      {
        positiveProfitYears: 2,
        equityPositive: true,
        minimumRoe: 20,
        minimumNetMargin: 15,
        maximumPe: 25,
        maximumPb: 6,
      },
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      cnpj: "33000167000101",
      securities: [{ ticker: "PETR3" }, { ticker: "PETR4" }],
      metrics: { positiveProfitYears: 2, pe: 20, pb: 5 },
    });
    expect(result[0]).not.toHaveProperty("facts");
    expect(result[0]).not.toHaveProperty("marketSnapshot");
  });

  it.each([
    [{ positiveProfitYears: 3 }, 0],
    [{ equityPositive: true }, 1],
    [{ minimumRoe: 30 }, 0],
    [{ minimumNetMargin: 25 }, 0],
    [{ maximumPe: 10 }, 0],
    [{ maximumPb: 4 }, 0],
  ] as const)(
    "filters out companies that do not meet %s",
    (filters, expectedCount) => {
      expect(filterScreenerCompanies([company()], filters, now)).toHaveLength(
        expectedCount,
      );
    },
  );

  it("keeps companies visible when a selected filter cannot be assessed", () => {
    const missingRecentProfit = company({
      facts: [makeFact("2.03", 2025, 100), makeFact("3.11", 2024, 20)],
    });
    expect(
      filterScreenerCompanies(
        [missingRecentProfit],
        { positiveProfitYears: 1 },
        now,
      )[0],
    ).toMatchObject({ filterStatus: "not_assessed" });
  });

  it("keeps the issuer visible when a required historical profit year is missing", () => {
    const issuerWithMissingYear = company({
      facts: [
        makeFact("3.11", 2025, 100),
        makeFact("3.01", 2025, 500),
        makeFact("2.03", 2025, 400),
      ],
    });
    const results = filterScreenerCompanies(
      [issuerWithMissingYear],
      { positiveProfitYears: 2 },
      now,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      cnpj: issuerWithMissingYear.cnpj,
      filterStatus: "not_assessed",
      metrics: { positiveProfitYears: 1 },
    });
  });

  it("keeps unvalidated sectors browsable with unavailable metrics", () => {
    const unvalidated = company({
      sector: "Bancos",
    });
    const result = filterScreenerCompanies([unvalidated], {}, now);
    expect(result).toHaveLength(1);
    expect(result[0]?.metrics).toEqual({
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
    });
    expect(
      filterScreenerCompanies([unvalidated], { minimumRoe: 1 }, now),
    ).toMatchObject([
      { filterStatus: "not_assessed", sectorClassification: "financial" },
    ]);
  });

  it("does not filter when profit history or data is absent and no filter was selected", () => {
    expect(
      filterScreenerCompanies([company({ facts: [] })], {}, now),
    ).toHaveLength(1);
  });

  it("sorts companies by localized name and supports explicit false equity filter", () => {
    const companies = [
      company({ name: "Vale", facts: [] }),
      company({ cnpj: "00000000000000", name: "Açúcar", facts: [] }),
    ];
    expect(
      filterScreenerCompanies(companies, { equityPositive: false }, now).map(
        (item) => item.name,
      ),
    ).toEqual(["Açúcar", "Vale"]);
  });

  it("keeps a company visible as unassessed when positive equity data is unavailable", () => {
    expect(
      filterScreenerCompanies(
        [company({ facts: [] })],
        { equityPositive: true },
        now,
      ),
    ).toMatchObject([{ filterStatus: "not_assessed" }]);
  });

  it("rejects out-of-range filter values", () => {
    expect(
      screenerFilterSchema.safeParse({ positiveProfitYears: 6 }).success,
    ).toBe(false);
    expect(() =>
      filterScreenerCompanies([company()], { maximumPe: 0 }, now),
    ).toThrow();
  });
  it.each([
    "Comércio (Atacado e Varejo)",
    "Construção Civil, Mat. Constr. e Decoração",
    "Serviços Transporte e Logística",
    "Máquinas, Equipamentos, Veículos e Peças",
    "Agricultura (Açúcar, Álcool e Cana)",
    "Metalurgia e Siderurgia",
    "Têxtil e Vestuário",
    "Energia Elétrica",
    "Petróleo e Gás",
    "Extração Mineral",
  ])(
    "enables %s only with a complete labeled consolidated triplet",
    (sector) => {
      const result = filterScreenerCompanies([company({ sector })], {}, now);
      expect(result[0]).toMatchObject({
        metrics: {
          latestNetIncome: 100,
          latestRevenue: 500,
          latestEquity: 400,
        },
      });
    },
  );

  it.each([
    "Bancos",
    "Seguradoras e Corretoras",
    "Bolsas de Valores/Mercadorias e Futuros",
  ])("keeps financial sector %s outside quantitative eligibility", (sector) => {
    const result = filterScreenerCompanies([company({ sector })], {}, now);
    expect(result[0]?.metrics.latestNetIncome).toBeNull();
    expect(result[0]?.metrics.latestEquity).toBeNull();
    expect(result[0]?.metrics.netMargin).toBeNull();
  });

  it.each([
    ["Bancos", "financial", "out_of_scope"],
    ["Emp. Adm. Part. - Bancos", "ambiguous", "not_assessed"],
    ["Setor CVM novo", "unknown", "not_assessed"],
    [null, "unknown", "not_assessed"],
  ] as const)(
    "keeps %s visible without applying nonfinancial filters",
    (sector, classification, status) => {
      const result = filterScreenerCompanies(
        [company({ sector })],
        { minimumRoe: 10 },
        now,
      );
      expect(result[0]).toMatchObject({
        sectorClassification: classification,
        methodologyStatus: status,
        filterStatus: "not_assessed",
        metrics: { latestNetIncome: null, roe: null },
      });
    },
  );
  it("does not infer accounting concepts from a familiar account code alone", () => {
    const mislabeled = company({
      facts: facts.map((fact) =>
        fact.accountCode === "3.01"
          ? { ...fact, accountLabel: "Patrimônio Líquido Consolidado" }
          : fact,
      ),
    });
    const result = filterScreenerCompanies([mislabeled], {}, now);
    expect(result[0]?.metrics.latestNetIncome).toBeNull();
    expect(result[0]?.metrics.latestRevenue).toBeNull();
    expect(result[0]?.metrics.latestEquity).toBeNull();
  });

  it("ignores null labels and account codes without a validated concept alias", () => {
    const invalidFacts = facts.map((fact) =>
      fact.accountCode === "3.01" ? { ...fact, accountLabel: null } : fact,
    );
    invalidFacts.push({
      ...makeFact("3.02", 2025, 900),
      accountLabel: null,
    });
    const result = filterScreenerCompanies(
      [company({ facts: invalidFacts })],
      {},
      now,
    );
    expect(result[0]?.metrics.latestRevenue).toBeNull();
  });
  it("accepts the explicit non-consolidated wording alias for net income", () => {
    const aliasFacts = facts.map((fact) =>
      fact.accountCode === "3.11"
        ? { ...fact, accountLabel: "Lucro/Prejuízo do Período" }
        : fact,
    );
    const result = filterScreenerCompanies(
      [company({ sector: "Energia Elétrica", facts: aliasFacts })],
      {},
      now,
    );
    expect(result[0]?.sectorClassification).toBe("non_financial");
    expect(result[0]?.metrics.latestNetIncome).toBe(100);
  });
  it("does not combine concepts reported in different years", () => {
    const splitYears = company({
      facts: [
        makeFact("3.11", 2025, 100),
        makeFact("2.03", 2025, 400),
        makeFact("3.01", 2024, 500),
        makeFact("2.03", 2024, 300),
      ],
    });
    const result = filterScreenerCompanies([splitYears], {}, now);
    expect(result[0]?.metrics.latestNetIncome).toBeNull();
  });

  it("uses the most recent complete year for each sector and issuer", () => {
    const commerce = company({ sector: "Comércio (Atacado e Varejo)" });
    const industry = company({
      cnpj: "22000167000101",
      name: "Indústria",
      sector: "Metalurgia e Siderurgia",
      facts: [
        makeFact("3.01", 2024, 200),
        makeFact("3.11", 2024, 20),
        makeFact("2.03", 2024, 100, { sourceFile: "DFP_con_2025.csv" }),
        makeFact("3.01", 2025, 400),
        makeFact("3.11", 2025, 80),
        makeFact("2.03", 2025, 200),
        makeFact("2.03", 2024, 100, { sourceFile: "DFP_con_2025.csv" }),
      ],
    });
    const result = filterScreenerCompanies([commerce, industry], {}, now);
    expect(result.map(({ metrics }) => metrics.netMargin)).toEqual([20, 20]);
    expect(result.map(({ metrics }) => metrics.roe)).toEqual([
      53.333333333333336, 28.57142857142857,
    ]);
  });
});

describe("assessCompanyForDiscovery", () => {
  it("returns five historical dimensions and up to five comparable annual evidence points", () => {
    const fiveYearFacts = Array.from({ length: 6 }, (_, index) => {
      const year = 2025 - index;
      return [
        makeFact("3.01", year, 500, { sourceFile: "DFP_con_2025.csv" }),
        makeFact("3.11", year, 100, { sourceFile: "DFP_con_2025.csv" }),
        makeFact("2.03", year, (6 - index) * 100, {
          sourceFile: "DFP_con_2025.csv",
        }),
        makeFact("6.01", year, 120, {
          accountLabel: "Caixa Líquido das Atividades Operacionais",
          sourceFile: "DFP_cia_aberta_DFC_MI_con_2025.csv",
        }),
      ];
    }).flat();
    const assessment = assessCompanyForDiscovery(
      company({ facts: fiveYearFacts }),
    );
    expect(assessment.period).toBe("2025-12-31");
    expect(assessment.source).toBe("CVM DFP consolidada anual");
    expect(assessment.dimensions.map(({ id }) => id)).toEqual([
      "results",
      "profitability",
      "cash",
      "financial_structure",
      "capital",
    ]);
    expect(assessment.evidence).toHaveLength(5);
    expect(assessment.evidence.every((point) => point.roe !== null)).toBe(true);
    expect(assessment.evidence.at(-1)).toMatchObject({
      year: 2025,
      revenue: 500,
      netIncome: 100,
      equity: 600,
      equityPeriod: "2025-12-31",
      equityPackageYear: 2025,
      equityOpeningPeriod: "2024-12-31",
      equityOpeningPackageYear: 2025,
      netMargin: 20,
      roe: 18.181818181818183,
      operatingCashFlow: 120,
    });
    expect(assessment.dimensions[3]?.status).toBe("unavailable");
    expect(assessment.dimensions[1]?.explanation).toContain(
      "disponibilidade do ROE",
    );
    expect(assessment.dimensions[1]?.explanation).toContain(
      "margem líquida aparece em Resultados",
    );
    expect(assessment.dimensions[2]?.explanation).toContain(
      "fluxo de caixa operacional bruto",
    );
    expect(assessment.dimensions[2]?.explanation).toContain(
      "data, versão e pacote coincidem",
    );
  });

  it("requires matching report versions for derived metrics and retains raw facts", () => {
    const versionedFacts = [
      makeFact("3.01", 2025, 500, { version: 2 }),
      makeFact("3.11", 2025, 100, { version: 1 }),
      makeFact("2.03", 2025, 300, { version: 1 }),
      makeFact("2.03", 2024, 250, {
        version: 7,
        sourceFile: "DFP_con_2025.csv",
      }),
      makeFact("6.01", 2025, 125, {
        accountLabel: "Caixa Líquido das Atividades Operacionais",
        sourceFile: "DFP_cia_aberta_DFC_MI_con_2025.csv",
        version: 2,
      }),
    ];
    const assessment = assessCompanyForDiscovery(
      company({ facts: versionedFacts }),
    );
    expect(assessment.evidence.at(-1)).toMatchObject({
      revenue: 500,
      revenueVersion: 2,
      netIncome: 100,
      netIncomeVersion: 1,
      equity: 300,
      equityVersion: 1,
      netMargin: null,
      roe: 36.36363636363637,
      equityOpeningPeriod: "2024-12-31",
      equityOpeningVersion: 7,
      operatingCashFlow: 125,
      operatingCashFlowVersion: 2,
      operatingCashFlowComparableToNetIncome: false,
    });
  });

  it("requires a shared source package year for derived values while retaining raw facts", () => {
    const mismatchedPackageFacts = [
      makeFact("3.01", 2025, 500, { sourceFile: "DFP_con_2024.csv" }),
      makeFact("3.11", 2025, 100, { sourceFile: "DFP_con_2025.csv" }),
      makeFact("2.03", 2025, 300, { sourceFile: "DFP_con_2025.csv" }),
      makeFact("2.03", 2024, 250, { sourceFile: "DFP_con_2025.csv" }),
      makeFact("6.01", 2025, 125, {
        accountLabel: "Caixa Líquido das Atividades Operacionais",
        sourceFile: "DFP_cia_aberta_DFC_MI_con_2024.csv",
      }),
    ];
    const assessment = assessCompanyForDiscovery(
      company({ facts: mismatchedPackageFacts }),
    );
    expect(assessment.evidence.at(-1)).toMatchObject({
      revenue: 500,
      revenuePackageYear: 2024,
      netIncome: 100,
      netIncomePackageYear: 2025,
      equity: 300,
      equityPackageYear: 2025,
      netMargin: null,
      roe: 36.36363636363637,
      equityOpeningPackageYear: 2025,
      operatingCashFlow: 125,
      operatingCashFlowPackageYear: 2024,
      operatingCashFlowComparableToNetIncome: false,
    });

    const openingEquityFromPriorFiling = mismatchedPackageFacts.map((fact) =>
      fact.accountCode === "2.03" && fact.referenceDate === "2024-12-31"
        ? { ...fact, sourceFile: "DFP_con_2024.csv" }
        : fact,
    );
    expect(
      assessCompanyForDiscovery(
        company({ facts: openingEquityFromPriorFiling }),
      ).evidence.at(-1),
    ).toMatchObject({
      roe: 36.36363636363637,
      equityOpeningPeriod: "2024-12-31",
      equityOpeningPackageYear: 2024,
    });
  });

  it("rejects a source package year of zero", () => {
    const factsWithInvalidPackageYear = facts.map((fact) => ({
      ...fact,
      sourceFile: "DFP_con_0000.csv",
    }));
    expect(
      calculateScreenerMetrics(
        factsWithInvalidPackageYear,
        company().marketSnapshot,
        now,
      ),
    ).toMatchObject({
      latestNetIncome: null,
      latestRevenue: null,
      latestEquity: null,
      netMargin: null,
      roe: null,
    });
    expect(
      assessCompanyForDiscovery(
        company({ facts: factsWithInvalidPackageYear }),
      ).evidence.at(-1),
    ).toMatchObject({
      revenue: 500,
      netIncome: 100,
      equity: 400,
      revenuePackageYear: null,
      netIncomePackageYear: null,
      equityPackageYear: null,
      netMargin: null,
      roe: null,
    });
  });

  it("does not derive metrics when source package provenance is missing", () => {
    const factsWithoutProvenance = facts.map((fact) => ({
      ...fact,
      sourceFile: undefined,
    }));
    const assessment = assessCompanyForDiscovery(
      company({ facts: factsWithoutProvenance }),
    );
    expect(assessment.evidence.at(-1)).toMatchObject({
      revenue: 500,
      netIncome: 100,
      equity: 400,
      netMargin: null,
      roe: null,
      revenuePackageYear: null,
      netIncomePackageYear: null,
      equityPackageYear: null,
    });
  });

  it("leaves ROE and margin unavailable when same-date facts use incompatible versions", () => {
    const incompatibleFacts = [
      makeFact("3.01", 2025, 500, { version: 2 }),
      makeFact("3.11", 2025, 100, { version: 1 }),
      makeFact("2.03", 2025, 300, { version: 2 }),
      makeFact("2.03", 2024, 250, { version: 1 }),
    ];
    const assessment = assessCompanyForDiscovery(
      company({ facts: incompatibleFacts }),
    );
    expect(assessment.evidence.at(-1)).toMatchObject({
      revenue: 500,
      netIncome: 100,
      equity: 300,
      netMargin: null,
      roe: null,
      equityOpeningPeriod: null,
    });
  });

  it("keeps results visible when equity is missing for an exercise", () => {
    const withoutCurrentEquity = facts.filter(
      (fact) =>
        !(fact.accountCode === "2.03" && fact.referenceDate === "2025-12-31"),
    );
    const assessment = assessCompanyForDiscovery(
      company({ facts: withoutCurrentEquity }),
    );
    expect(assessment.period).toBe("2025-12-31");
    expect(assessment.evidence.at(-1)).toMatchObject({
      year: 2025,
      revenue: 500,
      netIncome: 100,
      equity: null,
      equityOpeningPeriod: null,
      netMargin: 20,
      roe: null,
    });
    expect(assessment.dimensions[0]?.status).toBe("available");
    expect(assessment.dimensions[4]?.status).toBe("available");
  });
  it("does not classify shorter histories as failed and keeps unavailable facts distinct", () => {
    const assessment = assessCompanyForDiscovery(company());
    expect(assessment.evidence).toHaveLength(5);
    expect(assessment.dimensions[0]?.status).toBe("available");
    expect(assessment.dimensions[1]?.status).toBe("available");
    expect(assessment.dimensions[2]?.status).toBe("unavailable");
    expect(assessment.dimensions[3]?.status).toBe("unavailable");
    expect(assessment.dimensions[1]?.explanation).toContain(
      "disponibilidade do ROE",
    );
    expect(assessment.dimensions[1]?.explanation).toContain(
      "margem líquida aparece em Resultados",
    );
    expect(assessment.dimensions[2]?.explanation).toContain(
      "fluxo de caixa operacional bruto",
    );
    expect(assessment.dimensions[2]?.explanation).toContain(
      "data, versão e pacote coincidem",
    );
    expect(assessment.dimensions[4]?.status).toBe("available");
  });

  it("keeps a fixed five-exercise window and represents missing years as unavailable", () => {
    const sparseFacts = [
      makeFact("3.01", 2025, 500),
      makeFact("3.11", 2025, 100),
      makeFact("2.03", 2025, 300),
      makeFact("3.01", 2023, 400),
      makeFact("3.11", 2023, 80),
      makeFact("2.03", 2023, 250),
    ];
    const assessment = assessCompanyForDiscovery(
      company({ facts: sparseFacts }),
    );
    expect(assessment.evidence.map(({ year }) => year)).toEqual([
      2021, 2022, 2023, 2024, 2025,
    ]);
    expect(assessment.evidence[1]).toMatchObject({
      revenue: null,
      netIncome: null,
      equity: null,
      netMargin: null,
      roe: null,
    });
    expect(assessment.evidence[2]).toMatchObject({
      revenue: 400,
      netIncome: 80,
      equity: 250,
    });
  });

  it("keeps incompatible statement dates explicit and does not derive cross-period metrics", () => {
    const incompatibleFacts = [
      makeFact("3.01", 2025, 500, { referenceDate: "2025-12-31" }),
      makeFact("3.11", 2025, 100, { referenceDate: "2025-09-30" }),
      makeFact("2.03", 2025, 300, { referenceDate: "2025-12-31" }),
      makeFact("2.03", 2024, 250, { referenceDate: "2024-12-31" }),
      makeFact("6.01", 2025, 125, {
        accountLabel: "Caixa Líquido das Atividades Operacionais",
        sourceFile: "DFP_cia_aberta_DFC_MI_con_2025.csv",
        referenceDate: "2025-12-31",
      }),
    ];
    const assessment = assessCompanyForDiscovery(
      company({ facts: incompatibleFacts }),
    );
    expect(assessment.period).toBeNull();
    expect(assessment.evidence.at(-1)).toMatchObject({
      revenue: 500,
      revenuePeriod: "2025-12-31",
      netIncome: 100,
      netIncomePeriod: "2025-09-30",
      equity: 300,
      equityPeriod: "2025-12-31",
      equityOpeningPeriod: null,
      netMargin: null,
      roe: null,
      operatingCashFlow: 125,
      operatingCashFlowPeriod: "2025-12-31",
      operatingCashFlowComparableToNetIncome: false,
    });
  });
  it("uses only indirect-method cash flow and same-period observations", () => {
    const mi = makeFact("6.01", 2025, 125, {
      accountLabel: "Caixa Líquido das Atividades Operacionais",
      sourceFile: "DFP_cia_aberta_DFC_MI_con_2025.csv",
    });
    const md = {
      ...mi,
      value: 900,
      sourceFile: "DFP_cia_aberta_DFC_MD_con_2025.csv",
    };
    const mismatchedPeriod = {
      ...mi,
      referenceDate: "2025-09-30",
      sourceFile: "DFP_cia_aberta_DFC_MI_con_2025.csv",
    };
    const assessment = assessCompanyForDiscovery(
      company({ facts: [...facts, mi, md, mismatchedPeriod] }),
    );
    expect(assessment.evidence.at(-1)?.operatingCashFlow).toBe(125);
  });

  it("leaves ROE unavailable when the prior annual equity balance is missing or incompatible", () => {
    const assessment = assessCompanyForDiscovery(
      company({
        facts: facts.filter(
          (fact) =>
            !(
              fact.accountCode === "2.03" && fact.referenceDate === "2024-12-31"
            ),
        ),
      }),
    );
    expect(assessment.evidence.at(-1)?.roe).toBeNull();
  });

  it("keeps dimension availability independent of sector and distinguishes missing annual data", () => {
    const unsupported = assessCompanyForDiscovery(
      company({ sector: "Energia Elétrica" }),
    );
    expect(unsupported.dimensions.map(({ status }) => status)).toEqual([
      "available",
      "available",
      "unavailable",
      "unavailable",
      "available",
    ]);
    expect(unsupported.sectorComparability).toBe("not_validated");
    const missing = assessCompanyForDiscovery(company({ facts: [] }));
    expect(missing.period).toBeNull();
    expect(missing.methodologyStatus).toBe("not_assessed");
    expect(missing.methodologyMessage).toContain("avaliar.");
    expect(missing.evidence).toEqual([]);
    expect(missing.dimensions.map(({ status }) => status)).toEqual(
      Array(5).fill("unavailable"),
    );
  });

  it("does not anchor the period to a newer partial annual report", () => {
    const newerPartial = [...facts, makeFact("3.11", 2026, 200)];
    const assessment = assessCompanyForDiscovery(
      company({ facts: newerPartial }),
    );
    expect(assessment.period).toBe("2025-12-31");
  });
  it("keeps companies visible when positive-profit history is unavailable", () => {
    const results = filterScreenerCompanies(
      [company({ facts: [] })],
      { positiveProfitYears: 2 },
      now,
    );
    expect(results).toMatchObject([
      { filterStatus: "not_assessed", metrics: { positiveProfitYears: 0 } },
    ]);
  });
});
