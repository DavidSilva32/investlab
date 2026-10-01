import { describe, expect, it } from "vitest";
import {
  centsToDecimalString,
  centsToNumber,
  decimalToCents,
  formatCurrencyCents,
  resolvePositionMoney,
  sumMoneyCents,
} from "@/lib/portfolio-money";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { suggestEmergencyReservePositions } from "@/backend/services/emergency-reserve-position-suggestions";
import { calculateObjectiveValue } from "@/lib/portfolio-objectives";

describe("portfolio money", () => {
  it("converts decimal strings and numbers to cents with half-up rounding", () => {
    expect(decimalToCents("1.005")).toBe(101n);
    expect(decimalToCents("-1.005")).toBe(-101n);
    expect(decimalToCents("0.1")).toBe(10n);
    expect(decimalToCents(0.2)).toBe(20n);
    expect(decimalToCents("1.234e2")).toBe(12340n);
    expect(decimalToCents("1.234e-2")).toBe(1n);
  });

  it("rejects absent and malformed decimal amounts", () => {
    expect(decimalToCents(null)).toBeNull();
    expect(decimalToCents(undefined)).toBeNull();
    expect(decimalToCents(Number.NaN)).toBeNull();
    expect(decimalToCents("R$ 1,23")).toBeNull();
    expect(decimalToCents("1e101")).toBeNull();
    expect(decimalToCents("1e-101")).toBeNull();
  });

  it("resolves an estimate before the official imported value", () => {
    expect(
      resolvePositionMoney({
        totalValue: "100.00",
        estimatedValueCents: "10125",
        estimatedValue: 101.24,
      }),
    ).toEqual({ cents: 10125n, source: "CDB_ESTIMATE" });
    expect(
      resolvePositionMoney({ totalValue: "100.00", estimatedValue: "101.255" }),
    ).toEqual({ cents: 10126n, source: "CDB_ESTIMATE" });
  });

  it("keeps B3 and manual reported and converted values distinguishable", () => {
    expect(resolvePositionMoney({ totalValue: "100.005" })).toEqual({
      cents: 10001n,
      source: "B3_IMPORTED",
    });
    expect(
      resolvePositionMoney({
        source: "MANUAL",
        currency: "BRL",
        totalValue: "100",
      }),
    ).toEqual({ cents: 10000n, source: "MANUAL_REPORTED" });
    expect(
      resolvePositionMoney({
        source: "MANUAL",
        currency: "USD",
        totalValue: "150",
      }),
    ).toEqual({ cents: 15000n, source: "MANUAL_CONVERTED" });
    expect(
      resolvePositionMoney({ totalValue: null, convertedValueBrl: "175.25" }),
    ).toEqual({ cents: 17525n, source: "MANUAL_CONVERTED" });
  });

  it("leaves an unvalued position explicit and sums only known cents", () => {
    expect(
      resolvePositionMoney({ totalValue: null, convertedValueBrl: null }),
    ).toEqual({
      cents: null,
      source: "UNVALUED",
    });
    expect(sumMoneyCents([123n, null, 456n, undefined])).toBe(579n);
  });

  it("falls back from malformed estimate cents to the imported amount", () => {
    expect(
      resolvePositionMoney({
        estimatedValueCents: "not-cents",
        estimatedValue: null,
        totalValue: "12.34",
      }),
    ).toEqual({ cents: 1234n, source: "B3_IMPORTED" });
  });

  it("converts cents for numeric compatibility and formats without floating point", () => {
    expect(centsToDecimalString(-123456n)).toBe("-1234.56");
    expect(centsToNumber(123n)).toBe(1.23);
    expect(centsToNumber(null)).toBeNull();
    expect(formatCurrencyCents("4732295")).toBe("R$ 47.322,95");
    expect(formatCurrencyCents(-123n)).toBe("-R$ 1,23");
    expect(formatCurrencyCents(null)).toBe("—");
  });

  it("uses identical canonical cents in portfolio, reserve combinations, and objectives", () => {
    const position = {
      product: "CDB DI",
      institution: "Banco A",
      maturityAt: null,
      totalValue: "47296.00520902593",
      estimatedValue: 47322.08,
      estimatedValueCents: "4732208",
      canonicalValueCents: "4732208",
    };
    const assetKey = "asset-1";
    const insights = getPortfolioInsights([position]);
    const combination = suggestEmergencyReservePositions(47322.08, [
      {
        assetKey,
        product: position.product,
        institution: position.institution,
        value: position.estimatedValue,
        valueCents: position.canonicalValueCents,
      },
    ]);
    const objective = calculateObjectiveValue(
      [assetKey],
      [
        {
          assetKey,
          product: position.product,
          assetCode: null,
          institution: position.institution,
          assetClass: "Renda fixa",
          positionCount: 1,
          value: position.estimatedValue,
          valueCents: position.canonicalValueCents,
          knownValue: position.estimatedValue,
          knownValueCents: position.canonicalValueCents,
          unvaluedPositions: 0,
          referenceDate: "2026-09-18",
          source: "IMPORT",
        },
      ],
    );

    expect(insights.totalValueCents).toBe("4732208");
    expect(combination).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: [{ totalCents: "4732208", differenceCents: "0" }],
    });
    expect(objective.currentValueCents).toBe("4732208");
    expect(objective.knownValueCents).toBe("4732208");
  });
});
