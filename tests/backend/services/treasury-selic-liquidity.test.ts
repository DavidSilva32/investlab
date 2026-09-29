import { describe, expect, it } from "vitest";
import {
  createTreasurySelicLiquidityFact,
  TREASURY_SELIC_RULE_SOURCE,
  TREASURY_SELIC_RULE_SOURCE_TITLE,
} from "@/backend/services/treasury-selic-liquidity";

const position = {
  product: "Tesouro Selic 2029",
  maturityAt: "2029-03-01",
  quantity: "1.00000000",
  availableQuantity: "0.75000000",
  unavailableQuantity: "0.25000000",
  institution: "Corretora Exemplo",
  assetCode: "LFT-2029",
  referenceDate: "2026-09-28",
};

describe("Tesouro Selic liquidity facts", () => {
  it("returns relative settlement windows for a well-identified available quantity", () => {
    expect(createTreasurySelicLiquidityFact(position)).toMatchObject({
      status: "determined",
      reasons: [],
      asOf: "2026-09-28",
      normalizedTitleType: "Tesouro Selic",
      maturityAt: "2029-03-01",
      availableQuantity: "0.75000000",
      settlementEstimate: {
        condition: "normal_operation",
        windows: [
          {
            requestWindow: "business_day_09_30_to_13_00",
            relativeSettlement: "same_business_day_from_13_00",
          },
          {
            requestWindow: "business_day_13_00_to_18_00",
            relativeSettlement: "next_business_day_from_13_00",
          },
          {
            requestWindow: "scheduled_after_18_00_or_non_business_day",
            relativeSettlement: "next_business_day_from_13_00",
          },
        ],
        exclusions: expect.arrayContaining([
          expect.stringContaining("suspensões extraordinárias"),
          expect.stringContaining("Crédito em conta corrente"),
        ]),
      },
      ruleVersion: "portaria-mf-1748-2024-v1",
      ruleSource:
        "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento",
      ruleSourceTitle:
        "Regras e Regulamento do Tesouro Direto — Liquidação do Resgate",
      positionSource: "B3_POSITION_XLSX",
    });
    expect(TREASURY_SELIC_RULE_SOURCE).toBe(
      "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento",
    );
    expect(TREASURY_SELIC_RULE_SOURCE_TITLE).toBe(
      "Regras e Regulamento do Tesouro Direto — Liquidação do Resgate",
    );
  });

  it("accepts an unversioned title type when the maturity date is available", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        product: "Tesouro Selic",
      }),
    ).toMatchObject({
      status: "determined",
      normalizedTitleType: "Tesouro Selic",
      maturityAt: "2029-03-01",
    });
  });

  it("keeps snapshots before the rule effective date indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        referenceDate: "2024-11-10",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["rule_not_effective_on_snapshot_date"],
      asOf: "2024-11-10",
      settlementEstimate: null,
    });
  });

  it("does not create a liquidity fact for unrelated products", () => {
    expect(
      createTreasurySelicLiquidityFact({ ...position, product: "CDB" }),
    ).toBeNull();
  });

  it("marks ambiguous Tesouro Selic product labels indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        product: "Tesouro Selic - Corretora Exemplo",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["product_identity_ambiguous"],
      normalizedTitleType: null,
      settlementEstimate: null,
    });
  });

  it("marks a conflicting title year and maturity year indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        product: "Tesouro Selic 2030",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["title_maturity_year_conflict"],
      normalizedTitleType: null,
    });
  });

  it("reports missing or invalid maturity and snapshot reference dates", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        maturityAt: null,
        referenceDate: null,
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: [
        "maturity_missing_or_invalid",
        "snapshot_reference_date_missing_or_invalid",
      ],
      asOf: null,
    });
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        maturityAt: "2029-02-30",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["maturity_missing_or_invalid"],
    });
  });

  it.each([null, "0", "-1", "invalid"])(
    "marks available quantity %s as indeterminate",
    (availableQuantity) => {
      expect(
        createTreasurySelicLiquidityFact({
          ...position,
          availableQuantity,
        }),
      ).toMatchObject({
        status: "indeterminate",
        reasons: ["available_quantity_missing_or_not_positive"],
        normalizedTitleType: "Tesouro Selic",
      });
    },
  );

  it("marks inconsistent quantities as indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        availableQuantity: "1.1",
        unavailableQuantity: "0",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["available_quantity_exceeds_position_quantity"],
    });
  });

  it("marks malformed position and restriction quantities as indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        quantity: "-1",
        unavailableQuantity: "-0.1",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: [
        "position_quantity_missing_or_invalid",
        "unavailable_quantity_invalid",
      ],
    });
  });

  it("marks an inconsistent available plus unavailable total indeterminate", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        availableQuantity: "0.75",
        unavailableQuantity: "0.5",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["position_quantities_conflict"],
    });
  });

  it("allows a known available portion when unavailable quantity was not exported", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        unavailableQuantity: null,
      }),
    ).toMatchObject({
      status: "determined",
      unavailableQuantity: null,
      settlementEstimate: { condition: "normal_operation" },
    });
  });

  it("rejects dates that are not complete ISO calendar dates", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        maturityAt: "2029-3-01",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["maturity_missing_or_invalid"],
    });
  });

  it("compares large quantities without floating-point rounding", () => {
    expect(
      createTreasurySelicLiquidityFact({
        ...position,
        quantity: "9007199254740992",
        availableQuantity: "9007199254740993",
      }),
    ).toMatchObject({
      status: "indeterminate",
      reasons: ["available_quantity_exceeds_position_quantity"],
    });
  });
});
