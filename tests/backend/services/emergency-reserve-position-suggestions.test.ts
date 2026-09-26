import { describe, expect, it } from "vitest";
import { suggestEmergencyReservePositions } from "@/backend/services/emergency-reserve-position-suggestions";

const holding = (
  assetKey: string,
  value: number | null,
  product = `CDB ${assetKey}`,
) => ({ assetKey, product, institution: "Banco Inter", value });

describe("suggestEmergencyReservePositions", () => {
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
        { assetKeys: ["c"], total: 100, difference: 0 },
        { assetKeys: ["a", "b"], total: 100, difference: 0 },
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
});
