import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

export type PortfolioAllocationTargetValues = Record<
  (typeof portfolioAssetClassOptions)[number],
  number
>;

export function getPortfolioAllocationTargetCents(
  input: unknown,
): number[] | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== portfolioAssetClassOptions.length) {
    return null;
  }

  const cents: number[] = [];
  for (const assetClass of portfolioAssetClassOptions) {
    if (!Object.hasOwn(record, assetClass)) return null;
    const percentage = record[assetClass];
    if (
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return null;
    }

    const normalized = String(percentage);
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    cents.push(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  }

  return cents.reduce((total, value) => total + value, 0) === 10000
    ? cents
    : null;
}

export function isValidPortfolioAllocationTargets(
  input: unknown,
): input is PortfolioAllocationTargetValues {
  return getPortfolioAllocationTargetCents(input) !== null;
}
