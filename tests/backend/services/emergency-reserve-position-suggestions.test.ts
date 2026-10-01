import { describe, expect, it } from "vitest";
import {
  mergePartialPositionCandidates,
  suggestEmergencyReservePositions,
} from "@/backend/services/emergency-reserve-position-suggestions";

const holding = (
  assetKey: string,
  value: number | null,
  product = `CDB ${assetKey}`,
) => ({ assetKey, product, institution: "Banco Inter", value });

describe("suggestEmergencyReservePositions", () => {
  it("merges partial candidates by distance and prefers no transfer on ties", () => {
    const result = mergePartialPositionCandidates(
      [
        { assetKeys: ["z-free"], differenceCents: "100" },
        { assetKeys: ["b-free"], differenceCents: "-100" },
        { assetKeys: ["far-free"], differenceCents: "200" },
      ],
      [
        {
          assetKeys: ["a-transfer"],
          differenceCents: "100",
          transfers: [{}],
        },
        {
          assetKeys: ["z-free"],
          differenceCents: "0",
          transfers: [{}],
        },
        {
          assetKeys: ["c-transfer"],
          differenceCents: "-100",
          transfers: [{}],
        },
      ],
      false,
    );

    expect(result.candidates.map((candidate) => candidate.assetKeys)).toEqual([
      ["b-free"],
      ["z-free"],
      ["a-transfer"],
    ]);
    expect(result.alternativesLimited).toBe(true);
  });

  it("keeps explicit alternative limits and leaves complete small merges untruncated", () => {
    const candidates = [{ assetKeys: ["free"], differenceCents: "0" }];

    expect(mergePartialPositionCandidates(candidates, [], true)).toMatchObject({
      alternativesLimited: true,
    });
    expect(mergePartialPositionCandidates(candidates, [], false)).toMatchObject(
      {
        candidates,
        alternativesLimited: false,
      },
    );
  });

  it("finds exact combinations and returns distinct alternatives", () => {
    const result = suggestEmergencyReservePositions(100, [
      holding("a", 70),
      holding("b", 30),
      holding("c", 100),
    ]);

    expect(result).toEqual({
      status: "suggestions",
      kind: "exact",
      candidates: [
        {
          assetKeys: ["c"],
          totalCents: "10000",
          differenceCents: "0",
          total: 100,
          difference: 0,
          positions: [
            {
              assetKey: "c",
              institution: "Banco Inter",
              product: "CDB c",
              value: 100,
              valueCents: "10000",
            },
          ],
        },
        {
          assetKeys: ["a", "b"],
          totalCents: "10000",
          differenceCents: "0",
          total: 100,
          difference: 0,
          positions: [
            {
              assetKey: "a",
              institution: "Banco Inter",
              product: "CDB a",
              value: 70,
              valueCents: "7000",
            },
            {
              assetKey: "b",
              institution: "Banco Inter",
              product: "CDB b",
              value: 30,
              valueCents: "3000",
            },
          ],
        },
      ],
      searchLimited: false,
      alternativesLimited: false,
    });
  });

  it("deduplicates the same exact asset combination", () => {
    const result = suggestEmergencyReservePositions(100, [
      holding("same", 100),
      holding("same", 100),
    ]);

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: [{ assetKeys: ["same"], total: 100, difference: 0 }],
      alternativesLimited: false,
    });
  });

  it("rejects positive targets smaller than one cent", () => {
    expect(suggestEmergencyReservePositions(0.001, [holding("a", 10)])).toEqual(
      {
        status: "invalid_target",
      },
    );
  });

  it("returns tied nearest alternatives with an explicit signed difference", () => {
    const result = suggestEmergencyReservePositions(100, [
      holding("above", 105),
      holding("below", 95),
    ]);

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      candidates: [
        { assetKeys: ["above"], total: 105, difference: -5 },
        { assetKeys: ["below"], total: 95, difference: 5 },
      ],
      searchLimited: false,
    });
  });

  it("rounds comparisons to cents and ignores null, invalid, and zero values", () => {
    expect(
      suggestEmergencyReservePositions(10, [
        holding("null", null),
        holding("zero", 0),
        holding("invalid", Number.NaN),
        holding("sub-cent", 0.001),
        { ...holding("invalid-cents", 10), valueCents: "not-cents" },
        holding("rounded", 9.995),
      ]),
    ).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: [{ assetKeys: ["rounded"], total: 10, difference: 0 }],
    });
  });

  it("caps displayed exact alternatives while keeping the search bounded", () => {
    const holdings = Array.from({ length: 5 }, (_, index) =>
      holding(String(index), 20),
    );

    expect(suggestEmergencyReservePositions(40, holdings)).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: expect.arrayContaining([
        expect.objectContaining({ total: 40, difference: 0 }),
      ]),
      searchLimited: false,
    });
    const result = suggestEmergencyReservePositions(40, holdings);
    expect(result.status === "suggestions" ? result.candidates.length : 0).toBe(
      3,
    );
    expect(result).toMatchObject({
      alternativesLimited: true,
      searchLimited: false,
    });
  });

  it("marks capped tied nearest alternatives without claiming a complete list", () => {
    const holdings = Array.from({ length: 5 }, (_, index) =>
      holding(String(index), 99),
    );
    const result = suggestEmergencyReservePositions(100, holdings);

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      alternativesLimited: true,
      searchLimited: false,
    });
    expect(result.status === "suggestions" ? result.candidates.length : 0).toBe(
      3,
    );
  });

  it("returns no valued positions when every group is unvalued", () => {
    expect(suggestEmergencyReservePositions(100, [holding("a", null)])).toEqual(
      { status: "no_valued_positions" },
    );
  });

  it("validates the requested total", () => {
    expect(suggestEmergencyReservePositions(0, [holding("a", 10)])).toEqual({
      status: "invalid_target",
    });
    expect(suggestEmergencyReservePositions(0.001, [holding("a", 10)])).toEqual(
      {
        status: "invalid_target",
      },
    );
    expect(
      suggestEmergencyReservePositions(Number.POSITIVE_INFINITY, [
        holding("a", 10),
      ]),
    ).toEqual({ status: "invalid_target" });
  });

  it("reports when the bounded search stops before evaluating every combination", () => {
    const holdings = Array.from({ length: 40 }, (_, index) =>
      holding(String(index), 1),
    );

    expect(suggestEmergencyReservePositions(100_000, holdings)).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      searchLimited: true,
    });
  });

  it("refuses an oversized search instead of silently truncating positions", () => {
    const holdings = Array.from({ length: 41 }, (_, index) =>
      holding(String(index), 10),
    );

    expect(suggestEmergencyReservePositions(100, holdings)).toEqual({
      status: "too_many_positions",
      maximum: 40,
    });
  });

  it("keeps candidates and their key order stable when equal-cent inputs are permuted", () => {
    const holdings = [
      holding("z", 50),
      holding("b", 50),
      holding("a", 50),
      holding("y", 50),
    ];
    const expected = suggestEmergencyReservePositions(100, holdings);

    expect(
      suggestEmergencyReservePositions(100, [...holdings].reverse()),
    ).toEqual(expected);
    expect(
      expected.status === "suggestions" ? expected.candidates : [],
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetKeys: ["a", "b"],
          totalCents: "10000",
          differenceCents: "0",
        }),
      ]),
    );
  });

  it("finds an optimum that the previous 50,000-node DFS never reached", () => {
    const holdings = [
      ...Array.from({ length: 18 }, (_, index) =>
        holding(`high-${String(index).padStart(2, "0")}`, 19),
      ),
      ...Array.from({ length: 18 }, (_, index) =>
        holding(`low-${String(index).padStart(2, "0")}`, 5),
      ),
    ];
    const oldSearch = simulateOldBoundedSearch(90, holdings);
    const result = suggestEmergencyReservePositions(90, holdings);

    expect(oldSearch).toMatchObject({ visited: 50_000, foundExact: false });
    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: false,
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates[0].assetKeys).toEqual(
      Array.from(
        { length: 18 },
        (_, index) => `low-${String(index).padStart(2, "0")}`,
      ),
    );
  });

  it("matches an exhaustive oracle on a small synthetic set, including overshoots", () => {
    const holdings = [
      holding("a", 11),
      holding("b", 8),
      holding("c", 6),
      holding("d", 4),
      holding("e", 3),
      holding("f", 1),
    ];
    const target = 17;
    const result = suggestEmergencyReservePositions(target, holdings);
    const oracleDistance = enumerateSums(holdings).reduce<bigint | null>(
      (closest, total) => {
        if (total === 0n) return closest;
        const difference = BigInt(target * 100) - total;
        const distance = difference < 0n ? -difference : difference;
        return closest === null || distance < closest ? distance : closest;
      },
      null,
    );

    expect(result.status).toBe("suggestions");
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(
      BigInt(result.candidates[0].differenceCents) < 0n
        ? -BigInt(result.candidates[0].differenceCents)
        : BigInt(result.candidates[0].differenceCents),
    ).toBe(oracleDistance);
  });

  it("bounds equal-sum alternatives at the exact-search group limit", () => {
    const result = suggestEmergencyReservePositions(
      18,
      Array.from({ length: 36 }, (_, index) =>
        holding(`position-${String(index).padStart(2, "0")}`, 1),
      ),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: false,
      alternativesLimited: true,
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].assetKeys).toHaveLength(18);
  });

  it("keeps an overshooting singleton when the target is below every position", () => {
    expect(
      suggestEmergencyReservePositions(10, [holding("above", 20)]),
    ).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      candidates: [{ assetKeys: ["above"], total: 20, difference: -10 }],
    });
  });

  it("does not mark four raw equal-sum subsets as hidden alternatives when keys deduplicate them", () => {
    const result = suggestEmergencyReservePositions(100, [
      ...Array.from({ length: 18 }, (_, index) =>
        holding(`a-left-${index}`, 200),
      ),
      holding("z-right-duplicate", 100),
      holding("z-right-duplicate", 100),
      holding("z-right-duplicate", 100),
      holding("z-right-unique", 100),
      ...Array.from({ length: 14 }, (_, index) =>
        holding(`z-right-${index + 2}`, 200),
      ),
    ]);

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: false,
      alternativesLimited: false,
      candidates: [
        { assetKeys: ["z-right-duplicate"], total: 100 },
        { assetKeys: ["z-right-unique"], total: 100 },
      ],
    });
  });

  it("marks the bounded 37 to 40 position search as partial and retains overshoot candidates", () => {
    const result = suggestEmergencyReservePositions(
      10,
      Array.from({ length: 37 }, (_, index) => holding(String(index), 11)),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      searchLimited: true,
      candidates: [{ total: 11, difference: -1 }],
    });
  });

  it("deduplicates repeated asset keys in the bounded fallback", () => {
    const result = suggestEmergencyReservePositions(
      100,
      Array.from({ length: 37 }, () => holding("same", 1)),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      searchLimited: true,
      candidates: [{ assetKeys: expect.any(Array) }],
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(
      new Set(
        result.candidates.map((candidate) => candidate.assetKeys.join("|")),
      ).size,
    ).toBe(result.candidates.length);
  });

  it("finds one fallback exact result with repeated keys without inventing alternatives", () => {
    const result = suggestEmergencyReservePositions(
      1,
      Array.from({ length: 37 }, () => holding("same-exact", 1)),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: false,
      alternativesLimited: false,
      candidates: [{ assetKeys: ["same-exact"], total: 1 }],
    });
  });

  it("caps exact alternatives from the bounded fallback", () => {
    const result = suggestEmergencyReservePositions(
      1,
      Array.from({ length: 37 }, (_, index) => holding(`exact-${index}`, 1)),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: false,
      alternativesLimited: true,
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates).toHaveLength(3);
  });

  it("caps equally close above-target and below-target fallback alternatives", () => {
    const result = suggestEmergencyReservePositions(
      73,
      Array.from({ length: 37 }, (_, index) => holding(`near-${index}`, 2)),
    );

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      searchLimited: true,
      alternativesLimited: true,
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every(
        (candidate) => Math.abs(candidate.difference) === 1,
      ),
    ).toBe(true);
  });
});

function enumerateSums(holdings: { value: number | null }[]) {
  let sums = [0n];
  for (const item of holdings) {
    const cents = BigInt(Math.round((item.value ?? 0) * 100));
    sums = [...sums, ...sums.map((sum) => sum + cents)];
  }
  return sums;
}

function simulateOldBoundedSearch(
  target: number,
  holdings: { assetKey: string; value: number | null }[],
) {
  const targetCents = BigInt(target * 100);
  const sorted = [...holdings].sort(
    (left, right) => (right.value ?? 0) - (left.value ?? 0),
  );
  let visited = 0;
  let foundExact = false;
  function visit(index: number, total: bigint) {
    if (visited >= 50_000) return;
    visited += 1;
    if (total > 0n && total === targetCents) foundExact = true;
    if (total >= targetCents || index >= sorted.length) return;
    visit(
      index + 1,
      total + BigInt(Math.round((sorted[index].value ?? 0) * 100)),
    );
    visit(index + 1, total);
  }
  visit(0, 0n);
  return { visited, foundExact };
}
