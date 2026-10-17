import { createHash } from "node:crypto";
import type { ParsedB3Trade } from "@/backend/services/b3-trading-xlsx-parser";

const normalize = (value: string | null) =>
  (value ?? "").normalize("NFC").trim().toLocaleUpperCase("pt-BR");

const normalizeDecimal = (value: string | null) => {
  if (value === null) return "";
  const [integer, fraction = ""] = value.trim().split(".");
  const normalizedInteger = integer.replace(/^(-?)0+(?=\d)/, "$1");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
};

export const createB3TradeIdentityFingerprint = (trade: ParsedB3Trade) =>
  createHash("sha256")
    .update(
      [
        trade.side,
        trade.tradingDate,
        normalize(trade.assetCode),
        normalize(trade.market),
        normalize(trade.institution),
        normalizeDecimal(trade.quantity),
        normalizeDecimal(trade.unitPrice),
        normalizeDecimal(trade.grossValue),
      ].join("\u001f"),
    )
    .digest("hex");
