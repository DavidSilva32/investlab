import { describe, expect, it } from "vitest";

import { createB3TradeIdentityFingerprint } from "@/backend/services/b3-trading-fingerprint";
import type { ParsedB3Trade } from "@/backend/services/b3-trading-xlsx-parser";

const trade: ParsedB3Trade = {
  side: "BUY",
  tradingDate: "2026-10-14",
  settlementDate: null,
  movementType: "Compra",
  market: null,
  product: "Ativo sem ticker",
  assetCode: null,
  originalAssetCode: null,
  institution: null,
  quantity: "001.2300",
  unitPrice: null,
  grossValue: "0.00",
  fees: null,
  sourceRow: 2,
};

describe("createB3TradeIdentityFingerprint", () => {
  it("normalizes nullable identities and decimal scale consistently", () => {
    const equivalent = {
      ...trade,
      quantity: "1.23",
      grossValue: "0",
    };

    expect(createB3TradeIdentityFingerprint(trade)).toBe(
      createB3TradeIdentityFingerprint(equivalent),
    );
  });

  it("keeps negative quantities distinct from positive quantities", () => {
    expect(
      createB3TradeIdentityFingerprint({ ...trade, quantity: "-0.25" }),
    ).not.toBe(
      createB3TradeIdentityFingerprint({ ...trade, quantity: "0.25" }),
    );
  });

  it.each([
    { side: "SELL" as const },
    { tradingDate: "2026-10-15" },
    { assetCode: "ABCD3" },
    { market: "Fracionário" },
    { institution: "Corretora" },
    { quantity: "2" },
    { unitPrice: "1.00" },
    { grossValue: "2.00" },
  ])("changes when an identifying trade field changes (%j)", (change) => {
    expect(createB3TradeIdentityFingerprint(trade)).not.toBe(
      createB3TradeIdentityFingerprint({ ...trade, ...change }),
    );
  });
});
