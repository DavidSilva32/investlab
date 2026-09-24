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
      positiveProfitYears: 2,
    });
  });

  it.each([
    [null, "missing"],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        classSemanticsValidated: false,
      },
      "unvalidated",
    ],
    [
      {
        marketCap: null,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        classSemanticsValidated: true,
      },
      "missing market cap",
    ],
    [
      {
        marketCap: -1,
        observedAt: new Date("2026-09-20T00:00:00Z"),
        classSemanticsValidated: true,
      },
      "nonpositive market cap",
    ],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-01T00:00:00Z"),
        classSemanticsValidated: true,
      },
      "stale",
    ],
    [
      {
        marketCap: 2000,
        observedAt: new Date("2026-09-24T00:00:00Z"),
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
      latestRevenue: 500,
      latestEquity: 100,
      roe: null,
      netMargin: null,
      pe: null,
      pb: null,
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
    const unvalidated = company({ quantitativeEligible: false });
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
});
