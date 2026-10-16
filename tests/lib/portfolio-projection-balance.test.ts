import { describe, expect, it } from "vitest";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";
import type { ObjectivePosition } from "@/app/(private)/portfolio/_components/portfolio-objective-assignment";
import {
  resolveObjectiveProjectionBalance,
  resolvePortfolioProjectionBalance,
} from "@/lib/portfolio-projection-balance";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const position = (
  changes: Partial<ObjectivePosition> = {},
): ObjectivePosition => ({
  assetKey: "asset-a",
  product: "Tesouro",
  assetCode: "SELIC",
  institution: "Custodiante",
  assetClass: "fixed_income",
  positionCount: 1,
  value: 1200,
  referenceDate: "2026-10-01",
  unvaluedPositions: 0,
  objectiveId: null,
  objectiveName: null,
  objectivePurpose: null,
  ...changes,
});

const objective = (
  changes: Partial<PortfolioObjective> = {},
): PortfolioObjective => ({
  id: "goal-a",
  kind: "PERSONAL",
  name: "Viagem",
  purpose: "PERSONAL_GOAL",
  targetAmount: 10000,
  monthlyPlannedAmount: 500,
  currentValue: 1200,
  knownValue: 1200,
  remainingAmount: 8800,
  progressPercent: 12,
  assignedPositionCount: 1,
  missingPositionCount: 0,
  unvaluedPositionCount: 0,
  assignedAssetKeys: ["asset-a"],
  canEditAssignments: true,
  ...changes,
});

describe("portfolio projection balance sources", () => {
  it("uses a complete portfolio balance at its common effective date, including Reserve positions", () => {
    const result = resolvePortfolioProjectionBalance(
      [
        position(),
        position({
          assetKey: "reserve-asset",
          value: 5000,
          objectiveId: reserveObjectiveId,
          objectivePurpose: "RESERVE",
        }),
      ],
      [objective({ kind: "RESERVE", id: reserveObjectiveId })],
    );

    expect(result).toEqual({
      amount: 6200,
      referenceDate: "2026-10-01",
      source: "portfolio",
      completeness: "complete",
    });
  });

  it("keeps the known total available while marking mixed dates or missing assignments as partial", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [
          position(),
          position({ assetKey: "asset-b", referenceDate: "2026-10-02" }),
        ],
        [],
      ),
    ).toEqual({
      amount: 2400,
      referenceDate: null,
      source: "portfolio",
      completeness: "partial",
    });
    expect(
      resolvePortfolioProjectionBalance(
        [position()],
        [objective({ missingPositionCount: 1 })],
      ),
    ).toMatchObject({ amount: 1200, completeness: "partial" });
  });

  it("marks invalid effective dates as partial", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position({ referenceDate: "2026-02-30" })],
        [],
      ),
    ).toMatchObject({
      amount: 1200,
      referenceDate: null,
      completeness: "partial",
    });
  });

  it("rejects an invalid date for an objective balance", () => {
    expect(
      resolveObjectiveProjectionBalance(objective(), [
        position({ referenceDate: "2026-02-30" }),
      ]),
    ).toBeNull();
  });

  it("rejects objective balances whose positions use different dates", () => {
    expect(
      resolveObjectiveProjectionBalance(objective(), [
        position(),
        position({ referenceDate: "2026-10-02" }),
      ]),
    ).toBeNull();
  });

  it("treats missing position values as incomplete instead of adding zero", () => {
    expect(
      resolvePortfolioProjectionBalance([position({ value: null })], []),
    ).toMatchObject({ amount: 0, completeness: "partial" });
    expect(
      resolvePortfolioProjectionBalance(
        [position({ value: undefined }) as unknown as ObjectivePosition],
        [],
      ),
    ).toMatchObject({ amount: 0, completeness: "partial" });
  });

  it("uses the known portfolio total supplied by the dashboard data", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position()],
        [],
        {
          knownTotal: 1200,
          missingPositionCount: 0,
          unvaluedPositionCount: 1,
          valuedPositionCount: 1,
        },
        63_171.81,
      ),
    ).toMatchObject({
      amount: 63_171.81,
      source: "portfolio",
      completeness: "partial",
    });
  });

  it("uses position values and optional counters when no summary is supplied", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position({ unvaluedPositions: undefined })],
        [],
      ),
    ).toEqual({
      amount: 1200,
      referenceDate: "2026-10-01",
      source: "portfolio",
      completeness: "complete",
    });
  });

  it("rejects invalid or negative portfolio totals", () => {
    expect(
      resolvePortfolioProjectionBalance([], [], undefined, Number.NaN),
    ).toBe(null);
    expect(resolvePortfolioProjectionBalance([], [], undefined, -1)).toBeNull();
  });

  it("uses only the selected objective and never falls back to the portfolio", () => {
    expect(
      resolveObjectiveProjectionBalance(
        objective({ missingPositionCount: 1 }),
        [position(), position({ assetKey: "other" })],
      ),
    ).toBeNull();

    expect(
      resolveObjectiveProjectionBalance(objective(), [position()]),
    ).toEqual({
      amount: 1200,
      referenceDate: "2026-10-01",
      source: "objective",
      completeness: "complete",
    });
  });

  it("does not use an observed Reserve balance as an objective source", () => {
    expect(
      resolveObjectiveProjectionBalance(
        objective({ id: reserveObjectiveId, kind: "RESERVE" }),
        [
          position({
            objectiveId: reserveObjectiveId,
            objectivePurpose: "RESERVE",
          }),
        ],
      ),
    ).toBeNull();
  });
});
