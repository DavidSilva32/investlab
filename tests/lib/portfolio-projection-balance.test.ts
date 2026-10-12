import { describe, expect, it } from "vitest";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
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
    });
  });

  it("requires all non-reserve positions and assignments to be valued at one date", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [
          position(),
          position({ assetKey: "asset-b", referenceDate: "2026-10-02" }),
        ],
        [],
      ),
    ).toBeNull();
    expect(
      resolvePortfolioProjectionBalance(
        [position()],
        [objective({ missingPositionCount: 1 })],
      ),
    ).toBeNull();
  });

  it("rejects invalid effective dates", () => {
    expect(
      resolvePortfolioProjectionBalance(
        [position({ referenceDate: "2026-02-30" })],
        [],
      ),
    ).toBeNull();
  });

  it("treats missing position values as incomplete instead of adding zero", () => {
    expect(
      resolvePortfolioProjectionBalance([position({ value: null })], []),
    ).toBeNull();
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
