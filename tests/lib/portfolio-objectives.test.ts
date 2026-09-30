import { describe, expect, it } from "vitest";
import {
  calculateObjectiveValue,
  reserveObjectiveId,
  type ObjectivePosition,
} from "@/lib/portfolio-objectives";

const position = (
  overrides: Partial<ObjectivePosition> = {},
): ObjectivePosition => ({
  assetKey: "asset-a",
  product: "CDB",
  assetCode: "CDB1",
  institution: "Banco A",
  assetClass: "Renda fixa",
  positionCount: 1,
  value: 100,
  knownValue: 100,
  unvaluedPositions: 0,
  referenceDate: "2026-09-30",
  source: "B3",
  ...overrides,
});

describe("calculateObjectiveValue", () => {
  it("returns zero for an objective without assigned positions", () => {
    expect(calculateObjectiveValue([], [position()])).toEqual({
      currentValue: 0,
      knownValue: 0,
      missingPositionCount: 0,
      unvaluedPositionCount: 0,
    });
  });

  it("sums current values for all assigned known positions", () => {
    expect(
      calculateObjectiveValue(
        ["asset-a", "asset-b"],
        [
          position(),
          position({ assetKey: "asset-b", value: 50, knownValue: 50 }),
          position({ assetKey: "asset-c", value: 1000 }),
        ],
      ),
    ).toEqual({
      currentValue: 150,
      knownValue: 150,
      missingPositionCount: 0,
      unvaluedPositionCount: 0,
    });
  });

  it("does not turn stale or unvalued assignments into zero", () => {
    expect(
      calculateObjectiveValue(
        ["asset-a", "stale"],
        [
          position({
            assetKey: "asset-a",
            value: 100,
            unvaluedPositions: 1,
            positionCount: 2,
          }),
        ],
      ),
    ).toEqual({
      currentValue: null,
      knownValue: 100,
      missingPositionCount: 1,
      unvaluedPositionCount: 1,
    });
  });

  it("exposes the stable reserve objective identifier", () => {
    expect(reserveObjectiveId).toBe("00000000-0000-4000-8000-000000000010");
  });
});
