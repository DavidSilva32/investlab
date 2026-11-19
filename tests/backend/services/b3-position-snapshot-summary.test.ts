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

  it("builds a fallback identity from the full fixed-income instrument terms", () => {
    const fixedIncome = position({ assetCode: null, regimeType: "Pos-Fixado" });
    expect(getB3PositionSnapshotIdentity(fixedIncome)).toBe(
      getB3PositionSnapshotIdentity(
        position({
          assetCode: " ",
          product: " CDB   Banco A ",
          institution: " banco a ",
          issuer: " banco a s.a. ",
          indexer: " cdi ",
          regimeType: " pos-fixado ",
        }),
      ),
    );
    expect(
      getB3PositionSnapshotIdentity(
        position({ assetCode: null, maturityAt: null }),
      ),
    ).toBeNull();
  });

  it("does not report decimal formatting differences as a changed position", () => {
    const result = summarizeB3PositionSnapshotChange(
      [position({ quantity: "0", totalValue: "100.5", unitPrice: "10" })],
      "2026-11-18",
      {
        referenceDate: "2026-11-14",
        positions: [
          position({
            quantity: "-0.00",
            totalValue: "0100.50",
            unitPrice: "10.00",
          }),
        ],
      },
    );

    expect(result.updatedCount).toBe(0);
    expect(result.unchangedCount).toBe(1);
  });

  it("compares null and nonnumeric valuation fields without coercing them", () => {
    const previousPosition = position({
      unitPrice: null,
      totalValue: "sem valor",
      quantity: "10.00",
    });
    const result = summarizeB3PositionSnapshotChange(
      [
        position({
          unitPrice: null,
          totalValue: "sem valor",
          quantity: "010.000",
        }),
      ],
      "2026-11-18",
      { referenceDate: "2026-11-14", positions: [previousPosition] },
    );

    expect(result).toMatchObject({ updatedCount: 0, unchangedCount: 1 });
  });

  it("detects quantity, unit price, and valuation source changes", () => {
    const previousPosition = position({ assetCode: null });
    const currentPosition = position({
      assetCode: null,
      quantity: "11",
      unitPrice: "10.50",
      valuationSource: "MARKET",
    });
    expect(
      summarizeB3PositionSnapshotChange([currentPosition], "2026-11-18", {
        referenceDate: "2026-11-14",
        positions: [previousPosition],
      }),
    ).toMatchObject({ updatedCount: 1, unchangedCount: 0 });
  });

  it("normalizes a negative nonzero numeric field when comparing snapshots", () => {
    const result = summarizeB3PositionSnapshotChange(
      [position({ quantity: "-1" })],
      "2026-11-18",
      {
        referenceDate: "2026-11-14",
        positions: [position({ quantity: "1" })],
      },
    );

    expect(result).toMatchObject({ updatedCount: 1, unchangedCount: 0 });
  });
});
