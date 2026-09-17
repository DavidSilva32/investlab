import { createHash } from "node:crypto";
import type { ParsedB3Movement } from "@/backend/services/b3-movement-xlsx-parser";

const normalizeText = (value: string | null) =>
  (value ?? "").normalize("NFC").trim().toUpperCase();

const normalizeDecimal = (value: string | null) => {
  if (value === null) return "";
  const [integer, fraction = ""] = value.trim().split(".");
  const normalizedInteger = integer.replace(/^(-?)0+(?=\d)/, "$1") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
};

export type PersistedB3Movement = ParsedB3Movement & {
  eventFingerprint: string;
};

export const createB3MovementFingerprint = (movement: ParsedB3Movement) =>
  createHash("md5")
    .update(
      [
        movement.direction,
        movement.occurredAt,
        normalizeText(movement.movementType),
        normalizeText(movement.product),
        normalizeText(movement.assetCode),
        normalizeText(movement.institution),
        normalizeDecimal(movement.quantity),
        normalizeDecimal(movement.unitPrice),
        normalizeDecimal(movement.operationValue),
      ].join("\u001f"),
    )
    .digest("hex");

export const prepareB3MovementForPersistence = (
  movement: ParsedB3Movement,
): PersistedB3Movement => ({
  ...movement,
  eventFingerprint: createB3MovementFingerprint(movement),
});
