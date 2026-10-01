import { describe, expect, it } from "vitest";
import { getPortfolioInsights } from "@/lib/portfolio-insights";

describe("getPortfolioInsights", () => {
  it("summarizes allocation, concentration and upcoming maturities from positions", () => {
    const insights = getPortfolioInsights(
      [
        {
          product: "CDB A",
          institution: "Banco A",
          maturityAt: "2026-10-01",
          totalValue: "700",
        },
        {
          product: "CDB B",
          institution: "Banco B",
          maturityAt: "2027-01-01",
          totalValue: "300",
        },
        {
          product: "Título sem valor",
          institution: null,
          maturityAt: "2026-01-01",
          totalValue: null,
        },
      ],
      new Date("2026-09-16T00:00:00Z"),
    );

    expect(insights).toMatchObject({
      totalValue: 1000,
      valuedPositions: 2,
      institutions: 2,
      largestPosition: { product: "CDB A", value: 700, percentage: 70 },
    });
    expect(insights.allocations).toEqual([
      { institution: "Banco A", value: 700, percentage: 70 },
      { institution: "Banco B", value: 300, percentage: 30 },
    ]);
    expect(insights.upcomingMaturities).toEqual([
      { product: "CDB A", maturityAt: "2026-10-01", value: 700 },
      { product: "CDB B", maturityAt: "2027-01-01", value: 300 },
    ]);
  });

  it("prioritizes CDI estimates in portfolio totals and allocations", () => {
    expect(
      getPortfolioInsights(
        [
          {
            product: "CDB",
            institution: "Banco",
            maturityAt: "2027-01-01",
            totalValue: "100",
            estimatedValue: 100.52,
          },
        ],
        new Date("2026-09-16T00:00:00Z"),
      ),
    ).toMatchObject({
      totalValue: 100.52,
      allocations: [{ institution: "Banco", value: 100.52 }],
      largestPosition: { value: 100.52 },
      upcomingMaturities: [{ value: 100.52 }],
    });
  });

  it("handles a portfolio without current values or future maturities", () => {
    expect(
      getPortfolioInsights(
        [
          {
            product: "Sem dados",
            institution: null,
            maturityAt: "2020-01-01",
            totalValue: null,
          },
        ],
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toMatchObject({
      totalValue: 0,
      valuedPositions: 0,
      institutions: 0,
      largestPosition: null,
      allocations: [],
      upcomingMaturities: [],
    });
  });
  it("keeps zero-valued allocations and future items without a value explicit", () => {
    expect(
      getPortfolioInsights(
        [
          {
            product: "Saldo zero",
            institution: "Banco A",
            maturityAt: "2027-01-01",
            totalValue: "0",
          },
          {
            product: "Sem valor",
            institution: null,
            maturityAt: "2027-02-01",
            totalValue: null,
          },
        ],
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toMatchObject({
      totalValue: 0,
      allocations: [{ institution: "Banco A", value: 0, percentage: 0 }],
      upcomingMaturities: [
        { product: "Saldo zero", value: 0 },
        { product: "Sem valor", value: null },
      ],
    });
  });
  it("uses the reported value when an estimate is not available", () => {
    expect(
      getPortfolioInsights([
        {
          product: "Título",
          institution: "Banco",
          maturityAt: null,
          totalValue: "10",
          estimatedValue: null,
        },
      ]),
    ).toMatchObject({ totalValue: 10 });
  });
  it("groups valued assets without an institution under a clear fallback label", () => {
    expect(
      getPortfolioInsights([
        {
          product: "Sem instituição",
          institution: null,
          maturityAt: null,
          totalValue: "10",
        },
      ]),
    ).toMatchObject({
      allocations: [
        {
          institution: "Instituição não informada",
          value: 10,
          percentage: 100,
        },
      ],
    });
  });

  it("prepares an institution chart remainder from the exact cent totals", () => {
    const manyPositions = Array.from({ length: 7 }, (_, index) => ({
      product: `Ativo ${index}`,
      institution: `Banco ${index}`,
      maturityAt: null,
      canonicalValueCents: String((7 - index) * 100),
      totalValue: null,
    }));

    const result = getPortfolioInsights(manyPositions);

    expect(result.chartAllocations).toHaveLength(6);
    expect(result.chartAllocations.at(-1)).toEqual({
      institution: "Demais instituições",
      value: 3,
      percentage: expect.closeTo((300 / 2800) * 100),
    });
  });

  it("handles null canonical amounts, valuation dates and tied positions deterministically", () => {
    const result = getPortfolioInsights(
      [
        {
          product: "Ativo B",
          institution: null,
          maturityAt: "2027-01-01",
          totalValue: "900",
          canonicalValueCents: "1000",
          estimatedValueCents: "1000",
          referenceDate: "2026-09-01",
          cdbEstimateStatus: "provisional",
        },
        {
          product: "Ativo A",
          institution: "Banco A",
          maturityAt: "2027-01-01",
          totalValue: "500",
          canonicalValueCents: "1000",
          estimatedValue: 10,
          referenceDate: "2026-09-02",
          cdbEstimateStatus: "unavailable",
        },
        {
          product: "Sem valor",
          institution: "Banco B",
          maturityAt: null,
          totalValue: "300",
          canonicalValueCents: null,
        },
      ],
      new Date("2026-09-30T00:00:00Z"),
    );

    expect(result).toMatchObject({
      totalValueCents: "2000",
      provisionalEstimates: 1,
      unavailableEstimates: 1,
      allocations: [{ institution: "Banco A", value: 10 }, { value: 10 }],
      topPositions: [{ product: "Ativo A" }, { product: "Ativo B" }],
      upcomingMaturities: [
        { product: "Ativo A", value: 10 },
        { product: "Ativo B", value: 10 },
      ],
    });
    expect(result.allocations[1]?.institution).toContain("Institui");
    expect(result.upcomingMaturities[0]?.value).toBe(10);
  });

  it("uses a null position value for upcoming maturities with an absent canonical amount", () => {
    expect(
      getPortfolioInsights(
        [
          {
            product: "Sem valor futuro",
            institution: "Banco",
            maturityAt: "2027-01-01",
            totalValue: null,
            canonicalValueCents: null,
          },
        ],
        new Date("2026-09-30T00:00:00Z"),
      ).upcomingMaturities,
    ).toEqual([
      {
        product: "Sem valor futuro",
        maturityAt: "2027-01-01",
        value: null,
      },
    ]);
  });

  it("orders equal allocations, positions, and maturities deterministically", () => {
    const result = getPortfolioInsights(
      [
        {
          product: "Mesmo produto",
          institution: "Banco Z",
          maturityAt: "2026-09-30",
          totalValue: "10",
        },
        {
          product: "Mesmo produto",
          institution: null,
          maturityAt: "2026-09-30",
          totalValue: "10",
        },
        {
          product: "Mesmo produto",
          institution: "Banco A",
          maturityAt: "2026-10-01",
          totalValue: "10",
        },
      ],
      new Date("2026-09-30T00:00:00Z"),
    );

    expect(result.allocations.map(({ institution }) => institution)).toEqual([
      "Banco A",
      "Banco Z",
      "Instituição não informada",
    ]);
    expect(result.topPositions.map(({ institution }) => institution)).toEqual([
      null,
      "Banco A",
      "Banco Z",
    ]);
    expect(
      result.upcomingMaturities.map(({ maturityAt }) => maturityAt),
    ).toEqual(["2026-09-30", "2026-09-30", "2026-10-01"]);
  });

  it("keeps zero value chart remainders at zero percent", () => {
    const result = getPortfolioInsights(
      Array.from({ length: 7 }, (_, index) => ({
        product: `Ativo ${index}`,
        institution: `Banco ${index}`,
        maturityAt: null,
        totalValue: "0",
      })),
    );

    expect(result.chartAllocations).toHaveLength(6);
    expect(result.chartAllocations.at(-1)).toMatchObject({
      value: 0,
      percentage: 0,
    });
  });
});
