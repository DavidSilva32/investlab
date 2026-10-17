import { describe, expect, it } from "vitest";
import { buildB3ReconciliationSummary } from "@/backend/services/b3-reconciliation-summary";

const trade = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  importId: "import-1",
  sourceRow: 2,
  identityFingerprint: "same-trade",
  side: "BUY" as const,
  tradingDate: "2026-10-14",
  market: "Mercado à Vista",
  product: "BBSE3F",
  assetCode: "BBSE3",
  originalAssetCode: "BBSE3F",
  institution: "Corretora",
  quantity: "10.000",
  unitPrice: "20.50",
  grossValue: "205.00",
  ...overrides,
});

const movement = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  direction: "CREDITO",
  occurredAt: "2026-10-16",
  movementType: "Transferência - Liquidação",
  product: "BBSE3",
  assetCode: "BBSE3",
  originalAssetCode: "BBSE3F",
  institution: "Corretora",
  quantity: "10",
  unitPrice: "20.5",
  operationValue: "205.0",
  ...overrides,
});

describe("buildB3ReconciliationSummary", () => {
  it("returns D+2 candidates, unmatched rows, and uncertain duplicates separately", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-1"), trade("trade-2", { tradingDate: "2026-10-15" })],
      [movement("movement-1")],
    );

    expect(summary).toMatchObject({
      candidates: [
        { tradeId: "trade-1", movementId: "movement-1", status: "candidate" },
      ],
      confirmed: [],
      ambiguous: [],
      unmatched: [
        {
          tradeId: "trade-2",
          reason: expect.stringContaining("data"),
        },
      ],
      duplicateCandidates: [
        {
          identityFingerprint: "same-trade",
          occurrenceCount: 2,
          importCount: 1,
          status: "ambiguous",
        },
      ],
      history: { complete: false },
    });
  });

  it("calculates D+2 across weekends and requires compatible direction", () => {
    const friday = buildB3ReconciliationSummary(
      [trade("trade-friday", { tradingDate: "2026-10-16" })],
      [movement("movement-tuesday", { occurredAt: "2026-10-20" })],
    );
    const wrongMonday = buildB3ReconciliationSummary(
      [trade("trade-friday", { tradingDate: "2026-10-16" })],
      [movement("movement-monday", { occurredAt: "2026-10-19" })],
    );
    const sell = buildB3ReconciliationSummary(
      [trade("trade-sell", { side: "SELL" })],
      [movement("movement-credit")],
    );

    expect(friday.candidates).toMatchObject([
      { tradeId: "trade-friday", movementId: "movement-tuesday" },
    ]);
    expect(wrongMonday.candidates).toEqual([]);
    expect(sell.candidates).toEqual([]);
  });

  it("keeps a value discrepancy visible without rejecting a D+2 candidate", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-1", { grossValue: "205.00" })],
      [movement("movement-1", { operationValue: "206.25" })],
    );

    expect(summary.candidates).toMatchObject([
      {
        valueComparison: "different",
        valueDifferenceCents: "125",
      },
    ]);
  });

  it("marks values as unavailable when either source omits its operation value", () => {
    const missingTradeValue = buildB3ReconciliationSummary(
      [trade("trade-no-value", { grossValue: null })],
      [movement("movement-with-value")],
    );
    const missingMovementValue = buildB3ReconciliationSummary(
      [trade("trade-with-value")],
      [movement("movement-no-value", { operationValue: null })],
    );

    expect(missingTradeValue.candidates).toMatchObject([
      { valueComparison: "unavailable", valueDifferenceCents: null },
    ]);
    expect(missingMovementValue.candidates).toMatchObject([
      { valueComparison: "unavailable", valueDifferenceCents: null },
    ]);
  });

  it("does not suggest when dates cannot be calculated and explains the missing calendar", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-1", { tradingDate: "2026-10-17" })],
      [movement("movement-1", { occurredAt: "2026-10-20" })],
    );

    expect(summary.candidates).toEqual([]);
    expect(summary.unmatched[0]?.reason).toContain("calend");
    expect(summary.history.reasons.join(" ")).toContain("feriados");
  });

  it("matches quantities and operation values with meaningful fractional precision", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-fraction", { quantity: "10.2500", grossValue: "205.50" })],
      [
        movement("movement-fraction", {
          quantity: "10.25",
          operationValue: "205.500",
        }),
      ],
    );

    expect(summary.candidates).toMatchObject([
      { tradeId: "trade-fraction", movementId: "movement-fraction" },
    ]);
  });

  it("does not match incompatible movement data and exposes repeated matches as ambiguous", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-1")],
      [
        movement("movement-1"),
        movement("movement-2"),
        movement("movement-other", { movementType: "APLICAÇÃO" }),
      ],
    );
    expect(summary.candidates).toEqual([]);
    expect(summary.ambiguous).toMatchObject([
      {
        tradeId: "trade-1",
        movementIds: ["movement-1", "movement-2"],
        status: "ambiguous",
      },
    ]);
  });

  it.each([
    { trade: { assetCode: null } },
    { movement: { assetCode: null } },
    { movement: { assetCode: "HGLG11" } },
    { movement: { institution: "Outra corretora" } },
    { movement: { quantity: "11" } },
    { movement: { direction: "DEBITO" } },
  ])(
    "keeps financially incomplete or mismatched rows unmatched (%j)",
    ({ trade: tradeChanges, movement: movementChanges }) => {
      const summary = buildB3ReconciliationSummary(
        [trade("trade-1", tradeChanges)],
        [movement("movement-1", movementChanges)],
      );

      expect(summary.candidates).toEqual([]);
      expect(summary.unmatched).toHaveLength(1);
    },
  );

  it("does not let multiple source occurrences consume one movement", () => {
    const summary = buildB3ReconciliationSummary(
      [trade("trade-1"), trade("trade-2")],
      [movement("movement-1")],
    );
    expect(summary.candidates).toEqual([]);
    expect(summary.ambiguous).toMatchObject([
      { tradeId: "trade-1", movementIds: ["movement-1"], status: "ambiguous" },
      { tradeId: "trade-2", movementIds: ["movement-1"], status: "ambiguous" },
    ]);
  });

  it("reports repeated movement rows without removing either source occurrence", () => {
    const summary = buildB3ReconciliationSummary(
      [],
      [
        movement("movement-1", {
          importId: "import-a",
          sourceRow: 4,
          eventFingerprint: "same-movement",
        }),
        movement("movement-2", {
          importId: "import-b",
          sourceRow: 8,
          eventFingerprint: "same-movement",
        }),
      ],
    );
    expect(summary.movementDuplicateCandidates).toEqual([
      {
        eventFingerprint: "same-movement",
        occurrenceCount: 2,
        sourceRows: [4, 8],
        importCount: 2,
        status: "ambiguous",
      },
    ]);
  });

  it("keeps repeated legacy movement rows when import metadata is absent", () => {
    const summary = buildB3ReconciliationSummary(
      [],
      [
        movement("movement-1", {
          eventFingerprint: "same-legacy-movement",
          sourceRow: undefined,
          importId: undefined,
        }),
        movement("movement-2", {
          eventFingerprint: "same-legacy-movement",
          sourceRow: undefined,
          importId: undefined,
        }),
      ],
    );

    expect(summary.movementDuplicateCandidates).toEqual([
      {
        eventFingerprint: "same-legacy-movement",
        occurrenceCount: 2,
        sourceRows: [],
        importCount: 0,
        status: "ambiguous",
      },
    ]);
  });

  it("uses explicit persisted decisions to confirm or exclude a candidate", () => {
    const summary = buildB3ReconciliationSummary(
      [
        trade("trade-1"),
        trade("trade-2", { identityFingerprint: "other", assetCode: "HGLG11" }),
      ],
      [movement("movement-1"), movement("movement-2", { assetCode: "HGLG11" })],
      [
        {
          tradingItemId: "trade-1",
          movementItemId: "movement-1",
          status: "LINK",
          eventOrder: 1,
        },
        {
          tradingItemId: "trade-2",
          movementItemId: "movement-2",
          status: "KEEP_SEPARATE",
          eventOrder: 2,
        },
      ],
    );
    expect(summary.confirmed).toMatchObject([
      { tradeId: "trade-1", movementId: "movement-1" },
    ]);
    expect(summary.candidates).toEqual([]);
    expect(summary.unmatched).toMatchObject([
      {
        tradeId: "trade-2",
        reason: expect.stringContaining("data"),
      },
    ]);
    expect(summary.separated).toMatchObject([
      { tradeId: "trade-2", movementId: "movement-2" },
    ]);
  });

  it("uses the most recent decision for a pair when older history disagrees", () => {
    const latestLink = buildB3ReconciliationSummary(
      [trade("trade-1")],
      [movement("movement-1")],
      [
        {
          tradingItemId: "trade-1",
          movementItemId: "movement-1",
          status: "LINK",
          eventOrder: 2,
        },
        {
          tradingItemId: "trade-1",
          movementItemId: "movement-1",
          status: "KEEP_SEPARATE",
          eventOrder: 1,
        },
      ],
    );
    const latestSeparation = buildB3ReconciliationSummary(
      [trade("trade-1")],
      [movement("movement-1")],
      [
        {
          tradingItemId: "trade-1",
          movementItemId: "movement-1",
          status: "LINK",
          eventOrder: 1,
        },
        {
          tradingItemId: "trade-1",
          movementItemId: "movement-1",
          status: "KEEP_SEPARATE",
          eventOrder: 2,
        },
      ],
    );

    expect(latestLink.confirmed).toHaveLength(1);
    expect(latestSeparation.separated).toHaveLength(1);
    expect(latestSeparation.confirmed).toEqual([]);
  });
});
