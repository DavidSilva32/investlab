import { describe, expect, it } from "vitest";
import {
  evaluateStockCriteria,
  type StockCriteriaEvaluationInput,
  type StockCriteriaIndicator,
} from "@/lib/stock-criteria-evaluation";

const sector = "Alimentos";

function indicator(
  key: StockCriteriaIndicator["key"],
  value: number | null,
  referenceDate: string | null = "2025-12-31",
  periodBasis: StockCriteriaIndicator["periodBasis"] = key === "pe" ||
  key === "roe"
    ? "annual"
    : null,
): StockCriteriaIndicator {
  return {
    key,
    value,
    unavailableReason: value === null ? "Sem dados" : null,
    referenceDate,
    sourceDocument: referenceDate ? "DFP" : null,
    periodBasis,
  };
}

function input(
  overrides: Partial<StockCriteriaEvaluationInput> = {},
): StockCriteriaEvaluationInput {
  return {
    instrument: "stock",
    sector,
    indicators: [indicator("pe", 12), indicator("roe", 18)],
    equity: 120,
    equityReferenceDate: "2025-12-31",
    ...overrides,
  };
}

describe("evaluateStockCriteria", () => {
  it("meets the default P/L and ROE thresholds at their boundaries", () => {
    const result = evaluateStockCriteria(
      input({
        indicators: [indicator("pe", 15), indicator("roe", 15)],
      }),
    );

    expect(result.qualityCriteria.pe).toMatchObject({
      status: "meets",
      value: 15,
      threshold: 15,
    });
    expect(result.qualityCriteria.roe).toMatchObject({
      status: "meets",
      value: 15,
      threshold: 15,
    });
  });

  it("fails P/L above its configured maximum and ROE below its configured minimum", () => {
    const result = evaluateStockCriteria(
      input({
        indicators: [indicator("pe", 20), indicator("roe", 12)],
        preferences: { maximumPe: 18, minimumRoePercent: 14 },
      }),
    );

    expect(result.qualityCriteria.pe).toMatchObject({
      status: "fails",
      value: 20,
      threshold: 18,
    });
    expect(result.qualityCriteria.roe).toMatchObject({
      status: "fails",
      value: 12,
      threshold: 14,
    });
  });

  it.each([0, -1])("fails known non-positive P/L value %s", (pe) => {
    const result = evaluateStockCriteria(
      input({ indicators: [indicator("pe", pe), indicator("roe", 18)] }),
    );
    expect(result.qualityCriteria.pe.status).toBe("fails");
  });

  it("keeps missing canonical indicators unavailable", () => {
    const result = evaluateStockCriteria(
      input({ indicators: [indicator("pe", null), indicator("roe", null)] }),
    );
    expect(result.qualityCriteria.pe).toMatchObject({
      status: "unavailable",
      reason: "indicator_unavailable",
    });
    expect(result.qualityCriteria.roe.status).toBe("unavailable");
  });

  it.each([
    { equity: null, equityReferenceDate: "2025-12-31" },
    { equity: 0, equityReferenceDate: "2025-12-31" },
    { equity: -100, equityReferenceDate: "2025-12-31" },
    { equity: 100, equityReferenceDate: "2024-12-31" },
    { equity: 100, equityReferenceDate: null },
  ])("does not assess ROE without positive, same-date equity: %o", (equity) => {
    const result = evaluateStockCriteria(
      input({
        indicators: [indicator("pe", 12), indicator("roe", 20)],
        ...equity,
      }),
    );
    expect(result.qualityCriteria.roe.status).toBe("unavailable");
  });

  it("keeps industrial ratios unavailable for non-financial stocks", () => {
    const result = evaluateStockCriteria(input());
    expect(result.qualityCriteria.netDebtToEbitda).toMatchObject({
      status: "unavailable",
      reason: "industrial_indicator_not_in_contract",
    });
    expect(result.qualityCriteria.roic).toMatchObject({
      status: "unavailable",
      reason: "industrial_indicator_not_in_contract",
    });
  });

  it("does not apply industrial metrics to financial companies", () => {
    const result = evaluateStockCriteria(
      input({
        sector: "Bancos",
        indicators: [
          indicator("pe", 12),
          indicator("roe", 18, "2025-12-31", "trailing_twelve_months"),
        ],
      }),
    );
    expect(result.sectorClassification).toBe("financial");
    expect(result.qualityCriteria.netDebtToEbitda).toMatchObject({
      status: "not_applicable",
      reason: "financial_sector_methodology_required",
    });
    expect(result.qualityCriteria.roic.status).toBe("not_applicable");
    expect(result.qualityCriteria.pe).toMatchObject({
      status: "not_applicable",
      reason: "financial_sector_methodology_required",
    });
    expect(result.qualityCriteria.roe.status).toBe("meets");
  });

  it.each(["annual", "year_to_date", "quarterly", "unknown"] as const)(
    "does not assess bank ROE when its period basis is %s",
    (periodBasis) => {
      const result = evaluateStockCriteria(
        input({
          sector: "Bancos",
          indicators: [
            indicator("pe", 12),
            indicator("roe", 18, "2025-12-31", periodBasis),
          ],
        }),
      );
      expect(result.qualityCriteria.roe).toMatchObject({
        status: "unavailable",
        reason: "financial_roe_requires_ltm",
      });
    },
  );

  it.each(["Seguradoras e Corretoras", "Intermediação Financeira"])(
    "does not apply simplified bank ROE to financial sector %s",
    (financialSector) => {
      const result = evaluateStockCriteria(input({ sector: financialSector }));
      expect(result.sectorClassification).toBe("financial");
      expect(result.qualityCriteria.roe).toMatchObject({
        status: "not_applicable",
        reason: "financial_sector_methodology_required",
      });
      expect(result.qualityCriteria.pe.status).toBe("not_applicable");
    },
  );

  it.each(["Emp. Adm. Part. - Bancos", "Setor sem mapeamento", null])(
    "fails closed for ambiguous or unknown sector %s",
    (unknownSector) => {
      const result = evaluateStockCriteria(input({ sector: unknownSector }));
      expect(result.qualityCriteria.pe).toMatchObject({
        status: "unavailable",
        reason: "sector_not_supported",
      });
      expect(result.qualityCriteria.roe.status).toBe("unavailable");
      expect(result.qualityCriteria.roic.status).toBe("unavailable");
    },
  );

  it.each(["fii", "etf", "bdr"] as const)(
    "excludes confirmed %s without ticker or name heuristics",
    (instrument) => {
      const result = evaluateStockCriteria(input({ instrument }));
      expect(
        Object.values(result.qualityCriteria).every(
          (item) => item.status === "not_applicable",
        ),
      ).toBe(true);
      expect(result.priceReferences.bazin.status).toBe("not_applicable");
      expect(result.priceReferences.graham.status).toBe("not_applicable");
    },
  );

  it("keeps all criteria unavailable when the instrument type is unconfirmed", () => {
    const result = evaluateStockCriteria(input({ instrument: "unknown" }));
    expect(result.qualityCriteria.pe).toMatchObject({
      status: "unavailable",
      reason: "instrument_type_unconfirmed",
    });
    expect(result.qualityCriteria.roe.status).toBe("unavailable");
    expect(result.qualityCriteria.netDebtToEbitda.status).toBe("unavailable");
    expect(result.qualityCriteria.roic.status).toBe("unavailable");
    expect(result.priceReferences.bazin.status).toBe("unavailable");
    expect(result.priceReferences.graham.status).toBe("unavailable");
  });

  it("keeps Bazin unavailable when dividend coverage is absent or incomplete", () => {
    const absent = evaluateStockCriteria(
      input({
        price: 20,
        bazinReferencePrice: 25,
      }),
    );
    const incomplete = evaluateStockCriteria(
      input({
        price: 20,
        bazinReferencePrice: 25,
        dividend: {
          annualPerShare: 2,
          asOf: "2025-12-31",
          recurringCoverageComplete: false,
        },
      }),
    );

    expect(absent.priceReferences.bazin).toMatchObject({
      status: "unavailable",
      reason: "recurring_dividend_coverage_unavailable",
    });
    expect(incomplete.priceReferences.bazin.status).toBe("unavailable");
  });

  it("keeps extraordinary or unconfirmed dividends out of Bazin references", () => {
    const result = evaluateStockCriteria(
      input({
        price: 20,
        bazinReferencePrice: 25,
        dividend: {
          annualPerShare: 4,
          asOf: "2025-12-31",
          recurringCoverageComplete: false,
        },
      }),
    );
    expect(result.priceReferences.bazin.status).toBe("unavailable");
  });

  it("requires a price and an existing reference value for price comparisons", () => {
    const unavailable = evaluateStockCriteria(
      input({
        bazinReferencePrice: 21,
        dividend: {
          annualPerShare: 2,
          asOf: "2025-12-31",
          recurringCoverageComplete: true,
        },
      }),
    );
    expect(unavailable.priceReferences.bazin).toMatchObject({
      status: "unavailable",
      reason: "price_comparison_required",
    });

    const valid = evaluateStockCriteria(
      input({
        price: 20,
        bazinReferencePrice: 21,
        grahamReferencePrice: 18,
        dividend: {
          annualPerShare: 2,
          asOf: "2025-12-31",
          recurringCoverageComplete: true,
        },
      }),
    );
    expect(valid.priceReferences.bazin.status).toBe("meets");
    expect(valid.priceReferences.graham.status).toBe("fails");
    expect(Object.keys(valid.qualityCriteria)).not.toContain("bazin");
  });
});
