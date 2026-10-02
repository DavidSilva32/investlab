import { describe, expect, it } from "vitest";
import {
  getPortfolioAssetClassColor,
  portfolioAssetClassColors,
  strategyAssetClassColorById,
} from "@/lib/portfolio-asset-class-colors";

describe("portfolio asset class colors", () => {
  it("keeps the four strategy class colors semantic and stable", () => {
    expect(strategyAssetClassColorById).toEqual({
      fixed_income: "var(--asset-class-fixed-income)",
      brazilian_equities: "var(--asset-class-brazilian-equities)",
      international_etfs: "var(--asset-class-international-etfs)",
      fiis: "var(--asset-class-fiis)",
    });
    expect(portfolioAssetClassColors.fixedIncome).toBe(
      strategyAssetClassColorById.fixed_income,
    );
  });

  it("colors known specific classes and keeps broad or unknown groups neutral", () => {
    expect(getPortfolioAssetClassColor("Renda fixa")).toBe(
      strategyAssetClassColorById.fixed_income,
    );
    expect(getPortfolioAssetClassColor("Ações brasileiras")).toBe(
      strategyAssetClassColorById.brazilian_equities,
    );
    expect(getPortfolioAssetClassColor("ETFs internacionais")).toBe(
      strategyAssetClassColorById.international_etfs,
    );
    expect(getPortfolioAssetClassColor("FIIs")).toBe(
      strategyAssetClassColorById.fiis,
    );
    expect(getPortfolioAssetClassColor("Fundos")).toBe(
      "var(--asset-class-neutral)",
    );
    expect(getPortfolioAssetClassColor("classificação desconhecida")).toBe(
      "var(--asset-class-neutral)",
    );
  });
});
