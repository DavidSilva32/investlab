import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

const fixedIncomeColor = "var(--asset-class-fixed-income)";
const brazilianEquitiesColor = "var(--asset-class-brazilian-equities)";
const internationalEtfsColor = "var(--asset-class-international-etfs)";
const fiisColor = "var(--asset-class-fiis)";
const neutralColor = "var(--asset-class-neutral)";

export const strategyAssetClassColorById = {
  fixed_income: fixedIncomeColor,
  brazilian_equities: brazilianEquitiesColor,
  international_etfs: internationalEtfsColor,
  fiis: fiisColor,
} as const;

export const portfolioAssetClassColors = {
  fixedIncome: fixedIncomeColor,
  brazilianEquities: brazilianEquitiesColor,
  internationalEtfs: internationalEtfsColor,
  fiis: fiisColor,
} as const;

const specificClassColors: Record<string, string> = {
  "Ações brasileiras": brazilianEquitiesColor,
  "ETFs internacionais": internationalEtfsColor,
  FIIs: fiisColor,
};

export function getPortfolioAssetClassColor(label: string): string {
  if (label === portfolioAssetClassOptions[0]) return fixedIncomeColor;
  return specificClassColors[label] ?? neutralColor;
}
