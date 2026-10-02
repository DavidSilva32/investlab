import { describe, expect, it } from "vitest";
import { allocateCentsByProportionalGap } from "@/lib/proportional-cent-allocation";

describe("allocateCentsByProportionalGap", () => {
  it("assigns available cents by gap size and stable input order", () => {
    expect(allocateCentsByProportionalGap([1n, 1n, 0n], 1n)).toEqual([
      1n,
      0n,
      0n,
    ]);
  });

  it("caps allocations at all gaps and returns zeros when no cents can be distributed", () => {
    expect(allocateCentsByProportionalGap([2n, 3n], 9n)).toEqual([2n, 3n]);
    expect(allocateCentsByProportionalGap([2n, 3n], 0n)).toEqual([0n, 0n]);
    expect(allocateCentsByProportionalGap([0n, 0n], 5n)).toEqual([0n, 0n]);
  });

  it("can distribute a target total larger than the source weights", () => {
    expect(allocateCentsByProportionalGap([1n, 2n], 10000n, false)).toEqual([
      3333n,
      6667n,
    ]);
  });
});
