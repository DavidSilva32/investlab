import { describe, expect, it } from "vitest";
import {
  portfolioAssetClassOptions,
  portfolioAssetGeographyLabels,
  portfolioAssetGeographyOptions,
} from "@/lib/portfolio-classification-options";

describe("portfolio classification options", () => {
  it("provides the asset classes shared by allocation and classification", () => {
    expect(portfolioAssetClassOptions).toEqual([
      "Renda fixa",
      "Renda variável",
      "Fundos",
      "Criptoativos",
      "Imóveis",
      "Outros",
    ]);
  });

  it("provides the supported geography values", () => {
    expect(portfolioAssetGeographyOptions).toEqual([
      "Brasil",
      "Exterior",
      "Global",
    ]);
  });

  it("explains the difference between foreign and global exposure", () => {
    expect(portfolioAssetGeographyLabels).toEqual({
      Brasil: "Brasil",
      Exterior: "Exterior",
      Global: "Global",
    });
  });
});
