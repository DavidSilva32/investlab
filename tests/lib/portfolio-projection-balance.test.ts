import { describe, expect, it } from "vitest";
import {
  resolveObjectiveProjectionBalance,
  resolvePortfolioProjectionBalance,
} from "@/lib/portfolio-projection-balance";

type ProjectionPosition = {
  value?: number | null;
  unvaluedPositions?: number;
  referenceDate: string | null;
  estimatedThrough?: string | null;
};

const position = (
  changes: Partial<ProjectionPosition> = {},
): ProjectionPosition => ({
  value: 1200,
  referenceDate: "2026-10-01",
  unvaluedPositions: 0,
  ...changes,
});

const objective = (
  observedAmountCents: string | null = "120000",
  observedOn = "2026-10-01",
) =>
  observedAmountCents === null
    ? null
    : {
        balanceTracking: {
          observedAmountCents,
          observedOn,
        },
      };

describe("portfolio projection balance sources", () => {
  it("uses the whole portfolio position values at a common effective date", () => {
    expect(
      resolvePortfolioProjectionBalance([
        position(),
        position({ value: 5000, estimatedThrough: "2026-10-01" }),
      ]),
    ).toEqual({
      amount: 6200,
      referenceDate: "2026-10-01",
      source: "portfolio",
      completeness: "complete",
    });
  });

  it("uses an objective's reported balance and date without reading positions", () => {
    expect(resolveObjectiveProjectionBalance(objective("400000"))).toEqual({
      amount: 4000,
      referenceDate: "2026-10-01",
      source: "objective",
      completeness: "complete",
    });
  });

  it("accepts a reported zero balance as a valid objective starting point", () => {
    expect(resolveObjectiveProjectionBalance(objective("0"))).toEqual({
      amount: 0,
      referenceDate: "2026-10-01",
      source: "objective",
      completeness: "complete",
    });
  });

  it("marks an invalid observation date partial without inventing a date", () => {
    expect(
      resolveObjectiveProjectionBalance(objective("120000", "2026-02-30")),
    ).toEqual({
      amount: 1200,
      referenceDate: null,
      source: "objective",
      completeness: "partial",
    });
  });

  it.each([null, "", "invalid", "-100", "1.25"])(
    "does not infer an objective balance from legacy positions when the observation is absent or invalid (%s)",
    (observedAmountCents) => {
      expect(
        resolveObjectiveProjectionBalance(
          observedAmountCents === null ? null : objective(observedAmountCents),
        ),
      ).toBeNull();
    },
  );

  it("uses known portfolio totals and reports incomplete coverage when positions are unvalued", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position({ value: null }), position({ value: 900 })],
        {
          knownTotal: 900,
          missingPositionCount: 0,
          unvaluedPositionCount: 1,
          valuedPositionCount: 1,
        },
      ),
    ).toEqual({
      amount: 900,
      referenceDate: null,
      source: "portfolio",
      completeness: "partial",
    });
  });

  it("uses the explicit total when supplied", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position()],
        {
          knownTotal: 1200,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          valuedPositionCount: 1,
        },
        63_171.81,
      ),
    ).toMatchObject({
      amount: 63_171.81,
      source: "portfolio",
      completeness: "complete",
    });
  });

  it("marks mixed or missing valuation dates as partial", () => {
    expect(
      resolvePortfolioProjectionBalance([
        position(),
        position({ referenceDate: "2026-10-02" }),
      ]),
    ).toMatchObject({
      amount: 2400,
      referenceDate: null,
      completeness: "partial",
    });
    expect(
      resolvePortfolioProjectionBalance([position({ referenceDate: null })]),
    ).toMatchObject({
      amount: 1200,
      referenceDate: null,
      completeness: "partial",
    });
  });

  it("marks invalid effective dates as partial", () => {
    expect(
      resolvePortfolioProjectionBalance([
        position({ referenceDate: "2026-02-30" }),
      ]),
    ).toMatchObject({
      amount: 1200,
      referenceDate: null,
      completeness: "partial",
    });
  });

  it("rejects invalid or negative portfolio totals", () => {
    expect(
      resolvePortfolioProjectionBalance([], undefined, Number.NaN),
    ).toBeNull();
    expect(resolvePortfolioProjectionBalance([], undefined, -1)).toBeNull();
  });

  it("uses no inferred total when all portfolio data is absent", () => {
    expect(resolvePortfolioProjectionBalance([], undefined, 0)).toEqual({
      amount: 0,
      referenceDate: null,
      source: "portfolio",
      completeness: "partial",
    });
  });

  it("defaults omitted per-position completeness fields and values safely", () => {
    expect(
      resolvePortfolioProjectionBalance([
        { referenceDate: null },
        { value: null, referenceDate: null },
      ]),
    ).toEqual({
      amount: 0,
      referenceDate: null,
      source: "portfolio",
      completeness: "partial",
    });
  });

  it("rejects an observed balance that cannot be represented as a finite number", () => {
    expect(
      resolveObjectiveProjectionBalance(
        objective("9".repeat(400), "2026-10-01"),
      ),
    ).toBeNull();
  });
});
