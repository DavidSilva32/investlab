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

  it("keeps the current assignment when meet-in-the-middle storage truncates before searching", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 25 },
      (_, index) => ({
        assetKey: `owned-${index}`,
        valueCents: BigInt(index + 10),
        objectiveId: index < 12 ? "goal-a" : null,
      }),
    );
    const result = solvePortfolioObjectiveAllocation(
      positions,
      [
        { objectiveId: "goal-a", amountCents: 1n },
        { objectiveId: "goal-b", amountCents: 1n },
      ],
      1,
    );
    expect(result.optimal).toBe(false);
    expect(result.allocation).toEqual(
      Object.fromEntries(
        positions.map(({ assetKey, objectiveId }) => [assetKey, objectiveId]),
      ),
    );
    expect(result.transferCount).toBe(0);
    expect(result.changedAssignmentCount).toBe(0);
  });

  it("returns the current candidate when the exact-search state budget is exhausted", () => {
    const positions: AllocationPosition[] = [
      { assetKey: "owned", valueCents: 40n, objectiveId: "goal-a" },
      { assetKey: "free-b", valueCents: 80n, objectiveId: null },
      { assetKey: "free-c", valueCents: 130n, objectiveId: null },
    ];
    const result = solvePortfolioObjectiveAllocation(
      positions,
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
      9,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(9);
    expect(result.allocation).toEqual({
      owned: "goal-a",
      "free-b": null,
      "free-c": null,
    });
  });

  it("stops unwinding exact-search branches as soon as the state limit is reached", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "owned", valueCents: 40n, objectiveId: "goal-a" },
        { assetKey: "free-b", valueCents: 80n, objectiveId: null },
        { assetKey: "free-c", valueCents: 130n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
      10,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(10);
  });

  it("reports a partial candidate when the exact-radius search reaches its state budget", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "owned", valueCents: 9n, objectiveId: "goal-a" },
        { assetKey: "four", valueCents: 4n, objectiveId: null },
        { assetKey: "seven", valueCents: 7n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 0n },
      ],
      13,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(13);
  });

  it("improves a near-exact existing assignment with a better candidate from the radius search", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "owned-eight", valueCents: 8n, objectiveId: "goal-a" },
        { assetKey: "free-nine", valueCents: 9n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 0n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(1n);
    expect(result.allocation["free-nine"]).toBe("goal-a");
  });

  it("reports a partial candidate when kd-tree construction reaches its state budget", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "four", valueCents: 4n, objectiveId: null },
        { assetKey: "eight", valueCents: 8n, objectiveId: null },
        { assetKey: "thirteen", valueCents: 13n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
      13,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(13);
  });

  it("reports a partial candidate when kd-tree querying reaches its state budget", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "four", valueCents: 4n, objectiveId: null },
        { assetKey: "eight", valueCents: 8n, objectiveId: null },
        { assetKey: "thirteen", valueCents: 13n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
      22,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(22);
  });

  it("stops before the first kd-tree query when the node-build budget is fully consumed", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "four", valueCents: 4n, objectiveId: null },
        { assetKey: "eight", valueCents: 8n, objectiveId: null },
        { assetKey: "thirteen", valueCents: 13n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
      21,
    );
    expect(result.optimal).toBe(false);
    expect(result.exploredStates).toBe(21);
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

  it("accepts repeated target IDs as a stable zero-difference input", () => {
    expect(
      solvePortfolioObjectiveAllocation(
        [],
        [
          { objectiveId: "same", amountCents: 0n },
          { objectiveId: "same", amountCents: 0n },
        ],
      ),
    ).toMatchObject({ optimal: true, differenceCents: 0n, allocation: {} });
  });

  it("uses the bounded exact kd-tree path when no exact or two-cent candidate exists", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "four", valueCents: 4n, objectiveId: null },
        { assetKey: "eight", valueCents: 8n, objectiveId: null },
        { assetKey: "thirteen", valueCents: 13n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(5n);
    expect(result.exploredStates).toBeGreaterThan(12);
  });

  it("uses allocation-key string order when target IDs sort differently by locale", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "a", valueCents: 100n, objectiveId: null },
        { assetKey: "b", valueCents: 100n, objectiveId: null },
      ],
      [
        { objectiveId: "a-goal", amountCents: 100n },
        { objectiveId: "B-goal", amountCents: 100n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.allocation).toEqual({ a: "B-goal", b: "a-goal" });
  });

  it("improves the current assignment through the kd-tree while preserving transfer tie-breaks", () => {
    const result = solvePortfolioObjectiveAllocation(
      [
        { assetKey: "four", valueCents: 4n, objectiveId: "goal-a" },
        { assetKey: "eight", valueCents: 8n, objectiveId: "goal-b" },
        { assetKey: "thirteen", valueCents: 13n, objectiveId: null },
      ],
      [
        { objectiveId: "goal-a", amountCents: 10n },
        { objectiveId: "goal-b", amountCents: 10n },
      ],
    );
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(5n);
    expect(result.changedAssignmentCount).toBeGreaterThan(0);
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

  it("uses bounded branch and bound above the meet-in-the-middle position limit", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 26 },
      (_, index) => ({
        assetKey: `large-${index}`,
        valueCents: 1n,
        objectiveId: null,
      }),
    );
    const result = solvePortfolioObjectiveAllocation(positions, [
      { objectiveId: "goal-a", amountCents: 1n },
      { objectiveId: "goal-b", amountCents: 1n },
    ]);
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(0n);
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
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(0n);
  }, 60_000);

  it("proves an exact 25-position result with existing owners, free positions, and transfers", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 25 },
      (_, index) => ({
        assetKey: `owned-synthetic-${String(index).padStart(2, "0")}`,
        valueCents: BigInt(145_000 + index * 7_319),
        objectiveId: index < 12 ? "goal-a" : index < 20 ? "goal-b" : null,
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
          .slice(10, 16)
          .reduce((sum, position) => sum + position.valueCents, 0n),
      },
    ];
    const startedAt = performance.now();
    const result = solvePortfolioObjectiveAllocation(positions, targets);
    const elapsedMs = performance.now() - startedAt;
    console.info("Synthetic 25-position owner/transfer benchmark", {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      exploredStates: result.exploredStates,
      stateLimit: portfolioObjectiveAllocationStateLimit,
      optimal: result.optimal,
      differenceCents: result.differenceCents.toString(),
      transferCount: result.transferCount,
    });
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(0n);
    expect(result.transferCount).toBeGreaterThan(0);
    expect(result.exploredStates).toBeLessThan(
      portfolioObjectiveAllocationStateLimit,
    );
  }, 60_000);

  it("benchmarks the reported 25-position shape with an exact goal and a two-cent offset", () => {
    const positions: AllocationPosition[] = Array.from(
      { length: 25 },
      (_, index) => ({
        assetKey: `reported-shape-${String(index).padStart(2, "0")}`,
        valueCents: BigInt(205_037 + index * 7_319),
        objectiveId: index < 11 ? "goal-a" : index < 22 ? "goal-b" : null,
      }),
    );
    const canonicalGoalASum = positions
      .slice(0, 11)
      .reduce((sum, position) => sum + position.valueCents, 0n);
    const canonicalGoalBSum = positions
      .slice(11, 22)
      .reduce((sum, position) => sum + position.valueCents, 0n);
    const targets: AllocationTarget[] = [
      { objectiveId: "goal-a", amountCents: canonicalGoalASum + 2n },
      { objectiveId: "goal-b", amountCents: canonicalGoalBSum },
    ];
    const startedAt = performance.now();
    const result = solvePortfolioObjectiveAllocation(positions, targets);
    const elapsedMs = performance.now() - startedAt;
    console.info("Synthetic 25-position two-cent-offset benchmark", {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      exploredStates: result.exploredStates,
      stateLimit: portfolioObjectiveAllocationStateLimit,
      optimal: result.optimal,
      differenceCents: result.differenceCents.toString(),
    });
    expect(result.optimal).toBe(true);
    expect(result.differenceCents).toBe(2n);
    expect(result.totals["goal-b"]).toBe(canonicalGoalBSum);
    expect(result.exploredStates).toBeLessThan(
      portfolioObjectiveAllocationStateLimit,
    );
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
