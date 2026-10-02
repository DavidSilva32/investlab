import { parseBrazilianAmount } from "@/lib/currency-input";
import {
  strategyAssetClasses,
  type StrategyAllocationPercentages,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

export type StrategyPercentageDraft = Record<StrategyAssetClassId, string>;

export function parseStrategyPercentage(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= 10000 ? basisPoints : null;
}

export function strategyPercentagesFromDraft(
  draft: StrategyPercentageDraft,
): StrategyAllocationPercentages | null {
  const values = strategyAssetClasses.map(({ id }) =>
    parseStrategyPercentage(draft[id]),
  );
  if (values.some((value) => value === null)) return null;
  if (values.reduce<number>((sum, value) => sum + value!, 0) !== 10000)
    return null;
  return Object.fromEntries(
    strategyAssetClasses.map(({ id }, index) => [id, values[index]! / 100]),
  ) as StrategyAllocationPercentages;
}

export function distributeRemainingPercentage(
  draft: StrategyPercentageDraft,
  anchor: StrategyAssetClassId,
): StrategyPercentageDraft | null {
  const anchorValue = parseStrategyPercentage(draft[anchor]);
  if (anchorValue === null) return null;
  const remaining = 10000 - anchorValue;
  const peers = strategyAssetClasses.filter(({ id }) => id !== anchor);
  const each = Math.floor(remaining / peers.length);
  let remainder = remaining - each * peers.length;
  const result = { ...draft };
  for (const { id } of peers) {
    const value = each + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    result[id] =
      `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
  }
  return result;
}

export function parseStrategyContributionAmount(value: string) {
  const parsed = parseBrazilianAmount(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (!/^R\$\s?[\d.]+(?:,\d{0,2})?$/.test(value)) return null;
  return parsed;
}
