import { describe, expect, it } from "vitest";
import {
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
  ...overrides,
});

const facts = [
  makeFact("3.11", 2025, 100),
  makeFact("3.01", 2025, 500),
  makeFact("2.03", 2025, 400),
  makeFact("3.11", 2024, 50),
  makeFact("3.01", 2024, 300),
  makeFact("2.03", 2024, 300),
  makeFact("3.11", 2023, -10),
];
const company = (
  overrides: Partial<ScreenerCompany> = {},
): ScreenerCompany => ({
  cnpj: "33000167000101",
  cvmCode: "9512",
  name: "Petrobras",
  sector: "Petróleo",
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

  it("anchors the profit window to the latest year present in the consolidated DFP", () => {
    const missingRecentProfit = company({
      facts: [makeFact("2.03", 2025, 100), makeFact("3.11", 2024, 20)],
    });
    expect(
      filterScreenerCompanies(
        [missingRecentProfit],
        { positiveProfitYears: 1 },
        now,
      ),
    ).toHaveLength(0);
  });

  it("keeps unvalidated sectors browsable with unavailable metrics", () => {
    const unvalidated = company({
      sector: "Bancos",
      quantitativeEligible: true,
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
    ).toEqual([]);
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

  it("excludes a company when positive equity was requested but is unavailable", () => {
    expect(
      filterScreenerCompanies(
        [company({ facts: [] })],
        { equityPositive: true },
        now,
      ),
    ).toEqual([]);
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
    "Emp. Adm. Part. - Const. Civil, Mat. Const. e Decoração",
    "Serviços Transporte e Logística",
    "Emp. Adm. Part. - Máqs., Equip., Veíc. e Peças",
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
      const result = filterScreenerCompanies(
        [company({ sector, quantitativeEligible: false })],
        {},
        now,
      );
      expect(result[0]).toMatchObject({
        quantitativeEligible: true,
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
    "Emp. Adm. Part. - Seguradoras e Corretoras",
    "Emp. Adm. Part. - Intermediação Financeira",
    "Bolsas de Valores/Mercadorias e Futuros",
  ])("keeps financial sector %s outside quantitative eligibility", (sector) => {
    const result = filterScreenerCompanies(
      [company({ sector, quantitativeEligible: true })],
      {},
      now,
    );
    expect(result[0]?.quantitativeEligible).toBe(false);
    expect(result[0]?.metrics.latestNetIncome).toBeNull();
    expect(result[0]?.metrics.latestEquity).toBeNull();
    expect(result[0]?.metrics.netMargin).toBeNull();
  });

  it("does not infer accounting concepts from a familiar account code alone", () => {
    const mislabeled = company({
      facts: facts.map((fact) =>
        fact.accountCode === "3.01"
          ? { ...fact, accountLabel: "Patrimônio Líquido Consolidado" }
          : fact,
      ),
    });
    const result = filterScreenerCompanies([mislabeled], {}, now);
    expect(result[0]?.quantitativeEligible).toBe(false);
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
    expect(result[0]?.quantitativeEligible).toBe(false);
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
    expect(result[0]?.quantitativeEligible).toBe(true);
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
    expect(result[0]?.quantitativeEligible).toBe(false);
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
        makeFact("2.03", 2024, 100),
        makeFact("3.01", 2025, 400),
        makeFact("3.11", 2025, 80),
        makeFact("2.03", 2025, 200),
        makeFact("2.03", 2024, 100),
      ],
    });
    const result = filterScreenerCompanies([commerce, industry], {}, now);
    expect(result.map(({ metrics }) => metrics.netMargin)).toEqual([20, 20]);
    expect(result.map(({ metrics }) => metrics.roe)).toEqual([
      53.333333333333336, 28.57142857142857,
    ]);
  });
});
