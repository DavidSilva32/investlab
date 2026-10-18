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
  valueCents: "120000",
  knownValueCents: "120000",
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

  it("resolves equity and FII objective balances without fixed-income dates", () => {
    const equity = {
      ...position({ assetKey: "equity", product: "ITUB4", value: 2400 }),
      assetClass: "brazilian_equities",
      issuedAt: null,
      maturityAt: null,
    };
    const fii = {
      ...position({ assetKey: "fii", product: "HGLG11", value: 1600 }),
      assetClass: "fiis",
      issuedAt: null,
      maturityAt: null,
    };

    expect(
      resolveObjectiveProjectionBalance(
        objective({ currentValue: 4000, assignedAssetKeys: ["equity", "fii"] }),
        [equity, fii],
      ),
    ).toEqual({
      amount: 4000,
      referenceDate: "2026-10-01",
      source: "objective",
      completeness: "complete",
    });
  });

  it.each([
    {
      name: "a missing value",
      row: position({
        assetKey: "equity",
        value: null,
        valueCents: null,
        knownValueCents: "60000",
      }),
    },
    {
      name: "a missing common date",
      row: position({ assetKey: "fii", referenceDate: null }),
    },
  ])("uses an explicitly partial equity/FII balance with $name", ({ row }) => {
    expect(
      resolveObjectiveProjectionBalance(
        objective({
          currentValue: row.value === null ? null : 1200,
          unvaluedPositionCount: row.value === null ? 1 : 0,
          assignedAssetKeys: [row.assetKey],
        }),
        [{ ...row, assetClass: "brazilian_equities" }],
      ),
    ).toEqual({
      amount: row.knownValueCents === "60000" ? 600 : 1200,
      referenceDate: null,
      source: "objective",
      completeness: "partial",
    });
  });

  it.each([0, Number.NaN])(
    "does not treat an objective with no valid known value (%s) as zero",
    (knownValue) => {
      expect(
        resolveObjectiveProjectionBalance(objective(), [
          position({
            value: null,
            valueCents: null,
            knownValueCents: String(knownValue),
          }),
        ]),
      ).toBeNull();
    },
  );

  it.each([
    {
      name: "missing canonical cents",
      valueCents: undefined,
      knownValueCents: undefined,
    },
    {
      name: "invalid canonical cents",
      valueCents: undefined,
      knownValueCents: "invalid",
    },
  ])(
    "uses the available decimal value with $name",
    ({ valueCents, knownValueCents }) => {
      expect(
        resolveObjectiveProjectionBalance(objective(), [
          position({
            referenceDate: null,
            valueCents,
            knownValueCents,
          }),
        ]),
      ).toMatchObject({
        amount: 1200,
        referenceDate: null,
        source: "objective",
        completeness: "partial",
      });
    },
  );

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

  it("uses a partial objective balance when its effective date is invalid", () => {
    expect(
      resolveObjectiveProjectionBalance(objective(), [
        position({ referenceDate: "2026-02-30" }),
      ]),
    ).toMatchObject({
      amount: 1200,
      referenceDate: null,
      completeness: "partial",
    });
  });

  it("uses a partial objective balance when positions use different dates", () => {
    expect(
      resolveObjectiveProjectionBalance(
        objective({ assignedAssetKeys: ["asset-a", "asset-b"] }),
        [
          position(),
          position({ assetKey: "asset-b", referenceDate: "2026-10-02" }),
        ],
      ),
    ).toMatchObject({
      amount: 2400,
      referenceDate: null,
      completeness: "partial",
    });
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
    ).toMatchObject({
      amount: 1200,
      referenceDate: null,
      source: "objective",
      completeness: "partial",
    });

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
