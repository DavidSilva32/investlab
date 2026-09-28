import { describe, expect, it } from "vitest";
import { getPortfolioAssetSubClassSuggestions } from "@/lib/portfolio-asset-subclass-options";

describe("portfolio asset subclass suggestions", () => {
  it("suggests products that match the selected class", () => {
    expect(getPortfolioAssetSubClassSuggestions("Renda fixa")).toContain("CDB");
    expect(getPortfolioAssetSubClassSuggestions("Renda variável")).toContain(
      "ETF de ações",
    );
    expect(getPortfolioAssetSubClassSuggestions("Criptoativos")).toContain(
      "Bitcoin (BTC)",
    );
  });

  it("returns no suggestions for missing or unknown classes", () => {
    expect(getPortfolioAssetSubClassSuggestions(null)).toEqual([]);
    expect(getPortfolioAssetSubClassSuggestions("Classe desconhecida")).toEqual(
      [],
    );
  });
});
