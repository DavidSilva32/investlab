import { describe, expect, it } from "vitest";
import {
  portfolioObjectiveAllocationStateLimit,
  solvePortfolioObjectiveAllocation,
  type AllocationPosition,
  type AllocationTarget,
} from "@/backend/services/portfolio-objective-allocation";

describe("solvePortfolioObjectiveAllocation", () => {
  it("finds the exact joint allocation for two measured goals and leaves excess positions free", () => {
    const positions: AllocationPosition[] = [
      { assetKey: "a", valueCents: 600n, objectiveId: null },
      { assetKey: "b", valueCents: 400n, objectiveId: null },
      { assetKey: "c", valueCents: 500n, objectiveId: "goal-b" },
      { assetKey: "d", valueCents: 300n, objectiveId: null },
    ];
    const targets: AllocationTarget[] = [
      { objectiveId: "goal-a", amountCents: 1000n },
      { objectiveId: "goal-b", amountCents: 500n },
    ];
    const result = solvePortfolioObjectiveAllocation(positions, targets);
    expect(result).toMatchObject({ optimal: true, differenceCents: 0n });
    expect(result.allocation).toEqual({
      a: "goal-a",
      b: "goal-a",
      c: "goal-b",
      d: null,
    });
  });

  it("prefers no transfer when equal-difference allocations exist", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "owned", valueCents: 500n, objectiveId: "goal-a" },
        { assetKey: "free", valueCents: 500n, objectiveId: null },
      ],
      [{ objectiveId: "goal-a", amountCents: 500n }],
    );
    expect(result.optimal).toBe(true);
    expect(result.allocation).toEqual({ owned: "goal-a", free: null });
    expect(result.transferCount).toBe(0);
  });

  it("keeps an over-target position when it is closer than leaving the target empty", () => {
    const result = solvePortfolioObjectiveAllocation(
      [{ assetKey: "eleven", valueCents: 11n, objectiveId: null }],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 0n },
      ],
    );
    expect(result.differenceCents).toBe(1n);
    expect(result.allocation.eleven).toBe("goal-a");
  });

  it("marks a required move from an existing objective as a transfer", () => {
    const result = solvePortfolioObjectiveAllocation(
      [{ assetKey: "owned-a", valueCents: 100n, objectiveId: "goal-a" }],
      [
        { objectiveId: "goal-a", amountCents: 0n },
        { objectiveId: "goal-b", amountCents: 100n },
      ],
    );
    expect(result.allocation["owned-a"]).toBe("goal-b");
    expect(result.transferCount).toBe(1);
    expect(result.changedAssignmentCount).toBe(1);
  });

  it("falls back to bounded branch and bound when more than two goals are measured", () => {
    const result = solvePortfolioObjectiveAllocation(
      [{ assetKey: "owned-a", valueCents: 100n, objectiveId: "goal-a" }],
      [
        { objectiveId: "goal-a", amountCents: 0n },
        { objectiveId: "goal-b", amountCents: 100n },
        { objectiveId: "goal-c", amountCents: 0n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.allocation["owned-a"]).toBe("goal-b");
    expect(result.transferCount).toBe(1);
  });

  it("returns partial when the meet-in-the-middle storage cap is reached", () => {
    const result = solvePortfolioObjectiveAllocation(
      [{ assetKey: "a", valueCents: 1n, objectiveId: null }],
      [
        { objectiveId: "goal-a", amountCents: 1n },
        { objectiveId: "goal-b", amountCents: 1n },
      ],
      1,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(1);
  });

  it("reports the search as partial when the query traversal reaches its state cap", () => {
    const result = solvePortfolioObjectiveAllocation(
      [{ assetKey: "a", valueCents: 1n, objectiveId: null }],
      [
        { objectiveId: "goal-a", amountCents: 1n },
        { objectiveId: "goal-b", amountCents: 1n },
      ],
      4,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(4);
  });

  it("uses BigInt branch and bound when candidate totals exceed signed 64-bit storage", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        {
          assetKey: "large-value",
          valueCents: 9_223_372_036_854_775_808n,
          objectiveId: null,
        },
      ],
      [
        { objectiveId: "goal-a", amountCents: 9_223_372_036_854_775_808n },
        { objectiveId: "goal-b", amountCents: 0n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.allocation["large-value"]).toBe("goal-a");
  });

  it("uses stable key order to resolve remaining ties", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "b", valueCents: 100n, objectiveId: null },
        { assetKey: "a", valueCents: 100n, objectiveId: null },
      ],
      [{ objectiveId: "goal-a", amountCents: 100n }],
    );
    expect(result.allocation).toEqual({ a: null, b: "goal-a" });
  });

  it("returns the best known result as partial when the state budget is reached", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "a", valueCents: 1n, objectiveId: null },
        { assetKey: "b", valueCents: 2n, objectiveId: null },
      ],
      [{ objectiveId: "goal-a", amountCents: 2n }],
      1,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(1);
  });

  it("handles empty positions and empty measured targets exactly", () => {
    expect(
      solvePortfolioObjectiveAllocation(
        [],
        [{ objectiveId: "goal-a", amountCents: 50n }],
      ),
    ).toMatchObject({
      optimal: true,
      differenceCents: 50n,
      allocation: {},
    });
    expect(
      solvePortfolioObjectiveAllocation(
        [{ assetKey: "a", valueCents: 50n, objectiveId: null }],
        [],
      ),
    ).toMatchObject({
      optimal: true,
      differenceCents: 0n,
      allocation: { a: null },
    });
    expect(
      solvePortfolioObjectiveAllocation(
        [{ assetKey: "a", valueCents: 50n, objectiveId: null }],
        [],
      ),
    ).toMatchObject({
      optimal: true,
      exploredStates: 1,
      allocation: { a: null },
    });
  });

  it("benchmarks an adversarial synthetic 25-position portfolio with two objectives", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 25 },
      (_, index) => ({
        assetKey: `synthetic-${String(index).padStart(2, "0")}`,
        valueCents: BigInt(10_000 + index * 137),
        objectiveId: null,
      }),
    );
    const targets: AllocationTarget[] = [
      {
        objectiveId: "goal-a",
        amountCents: positions
          .slice(0, 8)
          .reduce((sum, position) => sum + position.valueCents, 0n),
      },
      {
        objectiveId: "goal-b",
        amountCents: positions
          .slice(8, 16)
          .reduce((sum, position) => sum + position.valueCents, 0n),
      },
    ];
    const startedAt = performance.now();
    const result = solvePortfolioObjectiveAllocation(positions, targets);
    const elapsedMs = performance.now() - startedAt;
    console.info("Synthetic 25-position allocation benchmark", {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      exploredStates: result.exploredStates,
      stateLimit: portfolioObjectiveAllocationStateLimit,
      optimal: result.optimal,
      differenceCents: result.differenceCents.toString(),
    });
    expect(result.optimal).toBe(false);
    expect(result.differenceCents).toBe(0n);
  }, 60_000);

  it("benchmarks a synthetic 25-position allocation already aligned with two references", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 25 },
      (_, index) => ({
        assetKey: `aligned-${String(index).padStart(2, "0")}`,
        valueCents: BigInt(1_000 + index * 101),
        objectiveId: index < 10 ? "goal-a" : index < 20 ? "goal-b" : null,
      }),
    );
    const targets: AllocationTarget[] = [
      {
        objectiveId: "goal-a",
        amountCents: positions
          .slice(0, 10)
          .reduce((sum, position) => sum + position.valueCents, 0n),
      },
      {
        objectiveId: "goal-b",
        amountCents: positions
          .slice(10, 20)
          .reduce((sum, position) => sum + position.valueCents, 0n),
      },
    ];
    const startedAt = performance.now();
    const result = solvePortfolioObjectiveAllocation(positions, targets);
    const elapsedMs = performance.now() - startedAt;
    console.info("Synthetic aligned 25-position allocation benchmark", {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      exploredStates: result.exploredStates,
      stateLimit: portfolioObjectiveAllocationStateLimit,
      optimal: result.optimal,
      differenceCents: result.differenceCents.toString(),
    });
    expect(result.optimal).toBe(true);
    expect(result.exploredStates).toBe(1);
    expect(result.differenceCents).toBe(0n);
  });
});
