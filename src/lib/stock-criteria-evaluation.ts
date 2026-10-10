import {
  classifyCvmSector,
  type CvmSectorClassification,
} from "@/lib/cvm-sector-classification";

export type StockCriteriaStatus =
  "meets" | "fails" | "unavailable" | "not_applicable";

export type StockCriterionKey = "pe" | "roe" | "netDebtToEbitda" | "roic";

export type StockCriteriaIndicator = {
  key: "pe" | "pb" | "roe" | "netMargin";
  value: number | null;
  unavailableReason: string | null;
  referenceDate: string | null;
  sourceDocument: "DFP" | "ITR" | null;
  periodBasis?:
    | "annual"
    | "year_to_date"
    | "quarterly"
    | "trailing_twelve_months"
    | "point_in_time"
    | "unknown"
    | null;
};

export type StockCriteriaPreferences = {
  maximumPe: number;
  minimumRoePercent: number;
};

export type StockCriteriaEvaluationInput = {
  instrument: "stock" | "fii" | "etf" | "bdr" | "unknown";
  sector: string | null;
  indicators: StockCriteriaIndicator[];
  /** Equity already reconciled by the canonical analysis service. */
  equity: number | null;
  equityReferenceDate?: string | null;
  dividend?: {
    annualPerShare: number | null;
    asOf: string | null;
    /** True only when the source covers a complete, recurring 12-month period. */
    recurringCoverageComplete: boolean;
  };
  /** Quote and reference prices are consumed only for price analysis. */
  price?: number | null;
  /** Pre-calculated by the existing Bazin opportunity-analysis method. */
  bazinReferencePrice?: number | null;
  /** Pre-calculated by the existing Graham opportunity-analysis method. */
  grahamReferencePrice?: number | null;
  preferences?: Partial<StockCriteriaPreferences>;
};

export type StockCriterionResult = {
  status: StockCriteriaStatus;
  value: number | null;
  threshold: number | null;
  reason:
    | "within_threshold"
    | "outside_threshold"
    | "indicator_unavailable"
    | "instrument_type_unconfirmed"
    | "positive_equity_required"
    | "equity_reference_mismatch"
    | "financial_roe_requires_ltm"
    | "sector_not_supported"
    | "industrial_indicator_not_in_contract"
    | "financial_sector_methodology_required"
    | "recurring_dividend_coverage_unavailable"
    | "price_comparison_required"
    | "reference_price_not_available"
    | "not_a_supported_equity_instrument";
};

export type StockPriceReferenceKey = "bazin" | "graham";

export type StockCriteriaEvaluation = {
  sectorClassification: CvmSectorClassification;
  /** Quality signals only; never includes price references or an overall score. */
  qualityCriteria: Record<StockCriterionKey, StockCriterionResult>;
  /** Comparisons produced from reference prices calculated by the existing service. */
  priceReferences: Record<StockPriceReferenceKey, StockCriterionResult>;
};

const defaultPreferences: StockCriteriaPreferences = {
  maximumPe: 15,
  minimumRoePercent: 15,
};

function configuredThreshold(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function result(
  status: StockCriteriaStatus,
  reason: StockCriterionResult["reason"],
  value: number | null = null,
  threshold: number | null = null,
): StockCriterionResult {
  return { status, reason, value, threshold };
}

function unavailable(reason: StockCriterionResult["reason"]) {
  return result("unavailable", reason);
}

function notApplicable(reason: StockCriterionResult["reason"]) {
  return result("not_applicable", reason);
}

function indicatorValue(
  indicators: StockCriteriaIndicator[],
  key: StockCriteriaIndicator["key"],
) {
  const indicator = indicators.find((item) => item.key === key);
  return indicator && Number.isFinite(indicator.value) ? indicator : undefined;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function equityIssue(
  roe: StockCriteriaIndicator,
  equity: number | null,
  equityReferenceDate: string | null | undefined,
) {
  if (!isPositiveFinite(equity)) return "positive_equity_required" as const;
  if (
    !roe.referenceDate ||
    !equityReferenceDate ||
    roe.referenceDate !== equityReferenceDate
  )
    return "equity_reference_mismatch" as const;
  return null;
}

function comparePriceWithReference(
  price: number | null | undefined,
  referencePrice: number | null | undefined,
): StockCriterionResult {
  if (!isPositiveFinite(referencePrice))
    return unavailable("reference_price_not_available");
  if (!isPositiveFinite(price)) return unavailable("price_comparison_required");
  const meets = price <= referencePrice;
  return result(
    meets ? "meets" : "fails",
    meets ? "within_threshold" : "outside_threshold",
    price,
    referencePrice,
  );
}

/**
 * Evaluates canonical indicators without deriving financial metrics, scores,
 * rankings, or recommendations. Bazin and Graham references remain separate
 * from quality and must be pre-calculated by the existing opportunity service.
 */
export function evaluateStockCriteria(
  input: StockCriteriaEvaluationInput,
): StockCriteriaEvaluation {
  const sectorClassification = classifyCvmSector(input.sector);
  const peMaximum = configuredThreshold(
    input.preferences?.maximumPe,
    defaultPreferences.maximumPe,
  );
  const roeMinimum = configuredThreshold(
    input.preferences?.minimumRoePercent,
    defaultPreferences.minimumRoePercent,
  );

  const qualityCriteria: Record<StockCriterionKey, StockCriterionResult> = {
    pe:
      sectorClassification === "financial"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("indicator_unavailable"),
    roe:
      sectorClassification === "financial" && input.sector !== "Bancos"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("indicator_unavailable"),
    netDebtToEbitda:
      sectorClassification === "financial"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("industrial_indicator_not_in_contract"),
    roic:
      sectorClassification === "financial"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("industrial_indicator_not_in_contract"),
  };
  const priceReferences: Record<StockPriceReferenceKey, StockCriterionResult> =
    {
      bazin: unavailable("recurring_dividend_coverage_unavailable"),
      graham: unavailable("reference_price_not_available"),
    };

  const explicitlyOutOfScopeInstrument = ["fii", "etf", "bdr"].includes(
    input.instrument,
  );
  const supportedSector =
    sectorClassification === "financial" ||
    sectorClassification === "non_financial";

  if (explicitlyOutOfScopeInstrument) {
    for (const key of Object.keys(qualityCriteria) as StockCriterionKey[]) {
      qualityCriteria[key] = notApplicable("not_a_supported_equity_instrument");
    }
    for (const key of Object.keys(
      priceReferences,
    ) as StockPriceReferenceKey[]) {
      priceReferences[key] = notApplicable("not_a_supported_equity_instrument");
    }
    return { sectorClassification, qualityCriteria, priceReferences };
  }

  if (input.instrument === "unknown") {
    for (const key of Object.keys(qualityCriteria) as StockCriterionKey[]) {
      qualityCriteria[key] = unavailable("instrument_type_unconfirmed");
    }
    for (const key of Object.keys(
      priceReferences,
    ) as StockPriceReferenceKey[]) {
      priceReferences[key] = unavailable("instrument_type_unconfirmed");
    }
    return { sectorClassification, qualityCriteria, priceReferences };
  }

  if (!supportedSector) {
    for (const key of Object.keys(qualityCriteria) as StockCriterionKey[]) {
      qualityCriteria[key] = unavailable("sector_not_supported");
    }
    for (const key of Object.keys(
      priceReferences,
    ) as StockPriceReferenceKey[]) {
      priceReferences[key] = unavailable("sector_not_supported");
    }
    return { sectorClassification, qualityCriteria, priceReferences };
  }

  if (sectorClassification !== "financial") {
    const pe = indicatorValue(input.indicators, "pe");
    if (pe) {
      const meets = pe.value! > 0 && pe.value! <= peMaximum;
      qualityCriteria.pe = result(
        meets ? "meets" : "fails",
        meets ? "within_threshold" : "outside_threshold",
        pe.value,
        peMaximum,
      );
    }
  }

  const roe = indicatorValue(input.indicators, "roe");
  if (roe) {
    if (sectorClassification === "financial" && input.sector !== "Bancos") {
      qualityCriteria.roe = notApplicable(
        "financial_sector_methodology_required",
      );
    } else if (
      sectorClassification === "financial" &&
      roe.periodBasis !== "trailing_twelve_months"
    ) {
      qualityCriteria.roe = unavailable("financial_roe_requires_ltm");
    } else {
      const issue = equityIssue(roe, input.equity, input.equityReferenceDate);
      if (issue) {
        qualityCriteria.roe = unavailable(issue);
      } else {
        const meets = roe.value! >= roeMinimum;
        qualityCriteria.roe = result(
          meets ? "meets" : "fails",
          meets ? "within_threshold" : "outside_threshold",
          roe.value,
          roeMinimum,
        );
      }
    }
  }

  const recurringDividendVerified = Boolean(
    input.dividend?.recurringCoverageComplete &&
    input.dividend.asOf &&
    isPositiveFinite(input.dividend.annualPerShare),
  );
  if (!recurringDividendVerified) {
    priceReferences.bazin = unavailable(
      "recurring_dividend_coverage_unavailable",
    );
  } else {
    priceReferences.bazin = comparePriceWithReference(
      input.price,
      input.bazinReferencePrice,
    );
  }

  priceReferences.graham = comparePriceWithReference(
    input.price,
    input.grahamReferencePrice,
  );

  return { sectorClassification, qualityCriteria, priceReferences };
}
