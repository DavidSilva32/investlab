import { describe, expect, it } from "vitest";
import { classifyInstrumentKind } from "@/lib/instrument-kind";

describe("classifyInstrumentKind", () => {
  it("recognizes FII from the product name or B3's abbreviated description", () => {
    expect(
      classifyInstrumentKind({
        product: "XP Malls Fundo de Investimento Imobiliário - FII",
        sourceType: "Cotas",
      }),
    ).toBe("FII");
    expect(
      classifyInstrumentKind({ product: "Pátria Log - FDO INV IMOB" }),
    ).toBe("FII");
  });

  it("recognizes explicit ETFs and never relies on a ticker suffix", () => {
    expect(
      classifyInstrumentKind({
        product: "Vanguard S&P 500 ETF",
        sourceType: "Cotas",
      }),
    ).toBe("ETF");
    expect(
      classifyInstrumentKind({
        product: "Fundo sem categoria",
        sourceType: "Cotas",
      }),
    ).toBe("INVESTMENT_FUND");
    expect(
      classifyInstrumentKind({
        product: "Produto sem classe",
        sourceType: null,
      }),
    ).toBe("UNKNOWN");
  });

  it("recognizes fixed income and equity from product, sheet, and B3 type evidence", () => {
    expect(
      classifyInstrumentKind({ sourceSheet: "Renda Fixa", product: "Ativo" }),
    ).toBe("FIXED_INCOME");
    expect(
      classifyInstrumentKind({ product: "CDB - Banco", sourceType: "CDB" }),
    ).toBe("FIXED_INCOME");
    expect(
      classifyInstrumentKind({ product: "Itaú Unibanco", sourceType: "PN" }),
    ).toBe("EQUITY");
    expect(
      classifyInstrumentKind({ sourceSheet: "Ações", product: "Empresa" }),
    ).toBe("EQUITY");
    expect(classifyInstrumentKind({ product: "BDR de exemplo" })).toBe(
      "EQUITY",
    );
  });

  it("recognizes traditional investment funds from the B3 tab", () => {
    expect(
      classifyInstrumentKind({
        product: "Fundo de infraestrutura",
        sourceType: "Cotas",
        sourceSheet: "Fundos de Investimento",
      }),
    ).toBe("INVESTMENT_FUND");
  });
});
