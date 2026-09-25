import { describe, expect, it } from "vitest";
import {
  getPortfolioAssetKey,
  inferPortfolioAssetClassification,
} from "@/backend/services/portfolio-classification";

const asset = {
  assetCode: "CDB-123",
  product: "CDB",
  issuer: "Banco Exemplo",
  institution: "Corretora Exemplo",
  indexer: "CDI",
  regimeType: null,
};

describe("portfolio asset classification", () => {
  it("builds a stable key from normalized imported identity fields", () => {
    expect(getPortfolioAssetKey(asset)).toBe(
      getPortfolioAssetKey({
        ...asset,
        product: " cdb ",
        institution: "CORRETORA EXEMPLO",
      }),
    );
    expect(getPortfolioAssetKey(asset)).not.toBe(
      getPortfolioAssetKey({ ...asset, assetCode: "CDB-456" }),
    );
  });

  it("suggests fixed income from an explicit imported product", () => {
    expect(inferPortfolioAssetClassification(asset)).toEqual({
      assetClass: "Renda fixa",
      subClass: "CDB",
      geography: null,
    });
  });

  it("classifies funds and variable income from explicit product labels", () => {
    expect(
      inferPortfolioAssetClassification({
        ...asset,
        product: "Fundo Imobiliário",
      }).assetClass,
    ).toBe("Fundos");
    expect(
      inferPortfolioAssetClassification({ ...asset, product: "Ação" })
        .assetClass,
    ).toBe("Renda variável");
  });

  it("uses an explicit recognized indexer but does not guess its geography", () => {
    expect(
      inferPortfolioAssetClassification({
        ...asset,
        product: "Produto externo",
        indexer: "CDI",
        regimeType: "Normal",
      }),
    ).toEqual({
      assetClass: "Renda fixa",
      subClass: "CDI · Normal",
      geography: null,
    });
  });
  it("leaves unsupported class and geography unknown", () => {
    expect(
      inferPortfolioAssetClassification({
        ...asset,
        product: "Produto sem categoria",
        indexer: null,
      }),
    ).toEqual({ assetClass: null, subClass: null, geography: null });
  });
});
