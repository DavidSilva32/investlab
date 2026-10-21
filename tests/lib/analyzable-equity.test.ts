import { describe, expect, it } from "vitest";
import { getAnalyzableEquityTicker } from "@/lib/analyzable-equity";

const candidate = {
  product: "BB Seguridade Participações S.A.",
  assetCode: "BBSE3",
  classification: {
    assetClass: "Renda variável",
    subClass: "Ação preferencial",
    geography: "Brasil",
  },
};

describe("getAnalyzableEquityTicker", () => {
  it("returns a normalized ticker for a classified Brazilian stock", () => {
    expect(
      getAnalyzableEquityTicker({ ...candidate, assetCode: " bbse3 " }),
    ).toBe("BBSE3");
  });

  it("does not infer eligibility from a ticker when the classification is absent", () => {
    expect(
      getAnalyzableEquityTicker({
        ...candidate,
        classification: {
          assetClass: null,
          subClass: null,
          geography: null,
        },
      }),
    ).toBeNull();
  });

  it("excludes BDRs and other asset classes", () => {
    expect(
      getAnalyzableEquityTicker({
        ...candidate,
        product: "BDR de uma empresa estrangeira",
        classification: {
          assetClass: "Renda variável",
          subClass: "BDR",
          geography: "Brasil",
        },
      }),
    ).toBeNull();
    expect(
      getAnalyzableEquityTicker({
        ...candidate,
        classification: {
          assetClass: "Renda fixa",
          subClass: "Ação preferencial",
          geography: "Brasil",
        },
      }),
    ).toBeNull();
  });

  it.each([
    {
      product: "ETF internacional",
      classification: {
        assetClass: "Renda variável",
        subClass: "ETF",
        geography: "Exterior",
      },
    },
    {
      product: "Fundo imobiliário",
      classification: {
        assetClass: "Fundos",
        subClass: "FII",
        geography: "Brasil",
      },
    },
  ])("does not expose analysis for unsupported class $product", (position) => {
    expect(getAnalyzableEquityTicker({ ...candidate, ...position })).toBeNull();
  });

  it("rejects invalid ticker formats", () => {
    expect(
      getAnalyzableEquityTicker({ ...candidate, assetCode: "PETR4.SA" }),
    ).toBeNull();
  });
});
