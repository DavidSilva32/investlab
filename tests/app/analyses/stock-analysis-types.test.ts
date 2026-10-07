import { describe, expect, it } from "vitest";
import { annualAnalysisPeriods } from "@/app/analyses/_components/stock-analysis-types";

describe("annualAnalysisPeriods", () => {
  it("keeps annual DFP periods and selects the latest filing per year", () => {
    const result = annualAnalysisPeriods([
      {
        referenceDate: "2022-12-31",
        sourceDocument: "DFP",
        revenue: null,
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2022-12-31",
        sourceDocument: "DFP",
        revenue: "90",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2023-12-31",
        filingReferenceDate: "2024-03-15",
        sourceDocument: "DFP",
        revenue: "100",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2023-12-31",
        filingReferenceDate: "2024-04-15",
        sourceDocument: "DFP",
        revenue: "120",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2023-12-31",
        filingReferenceDate: "2024-04-15",
        sourceDocument: "DFP",
        revenue: "125",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2024-06-30",
        sourceDocument: "ITR",
        revenue: "130",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2024-12-31",
        periodType: "interim",
        sourceDocument: "DFP",
        revenue: "140",
        netIncome: null,
        equity: null,
      },
      {
        referenceDate: "2025-12-31",
        periodBasis: "quarterly",
        sourceDocument: "DFP",
        revenue: "150",
        netIncome: null,
        equity: null,
      },
    ]);

    expect(
      result.map(({ referenceDate, revenue }) => [referenceDate, revenue]),
    ).toEqual([
      ["2022-12-31", null],
      ["2023-12-31", "120"],
    ]);
  });
});
