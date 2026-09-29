export type TreasurySelicPositionInput = {
  product: string;
  maturityAt: string | null;
  quantity: string;
  availableQuantity: string | null;
  unavailableQuantity: string | null;
  institution: string | null;
  assetCode: string | null;
  referenceDate: string | null;
};

export type TreasurySelicLiquidityFact = {
  status: "determined" | "indeterminate";
  reasons: string[];
  asOf: string | null;
  normalizedTitleType: "Tesouro Selic" | null;
  maturityAt: string | null;
  positionQuantity: string;
  availableQuantity: string | null;
  unavailableQuantity: string | null;
  institution: string | null;
  assetCode: string | null;
  settlementEstimate: {
    condition: "normal_operation";
    windows: Array<{
      requestWindow:
        | "business_day_09_30_to_13_00"
        | "business_day_13_00_to_18_00"
        | "scheduled_after_18_00_or_non_business_day";
      relativeSettlement:
        "same_business_day_from_13_00" | "next_business_day_from_13_00";
    }>;
    exclusions: string[];
  } | null;
  ruleVersion: string;
  ruleSource: string;
  ruleSourceTitle: string;
  ruleSourceObservedAt: string;
  positionSource: "B3_POSITION_XLSX";
  positionIdentityLimitation: string;
};
