import { describe, expect, it } from "vitest";
import {
  getB3PositionSnapshotIdentity,
  summarizeB3PositionSnapshotChange,
} from "@/backend/services/b3-position-snapshot-summary";

const position = (overrides: Record<string, unknown> = {}) => ({
  product: "CDB Banco A",
  quantity: "10",
  totalValue: "100.00",
  unitPrice: "10.00",
  valuationSource: "CURVA",
  assetCode: "CDB-001",
  institution: "Banco A",
  issuer: "Banco A S.A.",
  indexer: "CDI",
  regimeType: null,
  issuedAt: "2025-01-01",
  maturityAt: "2028-01-01",
  ...overrides,
});

describe("B3 position snapshot comparison", () => {
  it("compares stable positions and keeps new or absent rows separate", () => {
    const result = summarizeB3PositionSnapshotChange(
      [
        position({ totalValue: "110.00" }),
        position({ assetCode: "CDB-002" }),
        position({ assetCode: "CDB-003" }),
      ],
      "2026-11-18",
      {
        referenceDate: "2026-11-14",
        positions: [
          position(),
          position({ assetCode: "CDB-003" }),
          position({ assetCode: "CDB-004" }),
        ],
      },
    );

    expect(result).toEqual({
      comparisonAvailable: true,
      currentReferenceDate: "2026-11-18",
      previousReferenceDate: "2026-11-14",
      currentPositionCount: 3,
      previousPositionCount: 3,
      updatedCount: 1,
      unchangedCount: 1,
      unmatchedInCurrentCount: 1,
      absentFromCurrentFileCount: 1,
      notComparableCount: 0,
    });
  });

  it("does not infer changes when there is no previous dated snapshot", () => {
    expect(
      summarizeB3PositionSnapshotChange(
        [position(), position({ assetCode: null })],
        "2026-11-18",
        null,
      ),
    ).toMatchObject({
      comparisonAvailable: false,
      currentPositionCount: 2,
      notComparableCount: 2,
    });
  });

  it("marks ambiguous or unidentified rows as not comparable", () => {
    const duplicate = position();
    const result = summarizeB3PositionSnapshotChange(
      [
        duplicate,
        duplicate,
        position({ assetCode: null, institution: null, issuer: null }),
      ],
      "2026-11-18",
      { referenceDate: "2026-11-14", positions: [duplicate] },
    );

    expect(result).toMatchObject({
      updatedCount: 0,
      unchangedCount: 0,
      unmatchedInCurrentCount: 0,
      notComparableCount: 3,
    });
  });

  it("normalizes identity fields without using row order", () => {
    expect(getB3PositionSnapshotIdentity(position())).toBe(
      getB3PositionSnapshotIdentity(
        position({
          assetCode: " cdb-001 ",
          product: " CDB   Banco A ",
          institution: " banco a ",
          issuer: " banco a s.a. ",
        }),
      ),
    );
    expect(
      getB3PositionSnapshotIdentity(
        position({ assetCode: null, institution: null, issuer: null }),
      ),
    ).toBeNull();
  });

  it("does not report decimal formatting differences as a changed position", () => {
    const result = summarizeB3PositionSnapshotChange(
      [position({ quantity: "10.00", totalValue: "100.0", unitPrice: "10" })],
      "2026-11-18",
      {
        referenceDate: "2026-11-14",
        positions: [
          position({
            quantity: "10",
            totalValue: "100.00",
            unitPrice: "10.00",
          }),
        ],
      },
    );

    expect(result.updatedCount).toBe(0);
    expect(result.unchangedCount).toBe(1);
  });
});
