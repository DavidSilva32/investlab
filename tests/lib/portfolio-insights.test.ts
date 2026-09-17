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
    ).toEqual({
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
});
