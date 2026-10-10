import {
  classifyCvmSector,
  type CvmSectorClassification,
} from "@/lib/cvm-sector-classification";

export type StockCriteriaStatus =
  "meets" | "fails" | "unavailable" | "not_applicable";

export type StockCriteriaPreset = "conservative" | "balanced" | "custom";
export type StockQualityCriterionKey = "roe" | "netDebtToEbitda" | "roic";
export type StockValuationCriterionKey = "pe" | "pb";

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
  marketDataDate?: string | null;
};

export type StockCriteriaPreferences = {
  preset: StockCriteriaPreset;
  maximumPe: number;
  maximumPb: number | null;
  minimumRoePercent: number;
};

export type StockCriteriaEvaluationInput = {
  instrument: "stock" | "fii" | "etf" | "bdr" | "unknown";
  sector: string | null;
  indicators: StockCriteriaIndicator[];
  /** Equity already reconciled by the canonical analysis service. */
  equity: number | null;
  equityReferenceDate?: string | null;
  /** Quote and reference prices are consumed only for price analysis. */
  price?: number | null;
  /** Pre-calculated by the existing Bazin opportunity-analysis method. */
  bazinReferencePrice?: number | null;
  /** Pre-calculated by the existing Graham opportunity-analysis method. */
  grahamReferencePrice?: number | null;
  /** True only for a complete, verified recurring dividend window. */
  recurringDividendCoverageComplete?: boolean;
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
    | "not_a_supported_equity_instrument"
    | "positive_multiple_required"
    | "market_data_date_required"
    | "threshold_not_configured";
};

export type StockPriceReferenceKey = "bazin" | "graham";

export type StockCriteriaEvaluation = {
  sectorClassification: CvmSectorClassification;
  /** Operating quality signals; price multiples live in valuationCriteria. */
  qualityCriteria: Record<StockQualityCriterionKey, StockCriterionResult>;
  /** Current market multiples, kept separate from operating quality. */
  valuationCriteria: Record<StockValuationCriterionKey, StockCriterionResult>;
  /** Manual or externally derived reference prices are not quality scores. */
  priceReferences: Record<StockPriceReferenceKey, StockCriterionResult>;
};

export const defaultStockCriteriaPreferences: StockCriteriaPreferences = {
  preset: "balanced",
  maximumPe: 15,
  maximumPb: 2.5,
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

function notApplicable(
  reason: StockCriterionResult["reason"],
  value: number | null = null,
  threshold: number | null = null,
) {
  return result("not_applicable", reason, value, threshold);
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

function hasValidDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function isBankSector(value: string | null) {
  return (
    (value ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleUpperCase("pt-BR") === "BANCOS"
  );
}

function equityIssue(
  roe: StockCriteriaIndicator,
  equity: number | null,
  equityReferenceDate: string | null | undefined,
) {
  if (!isPositiveFinite(equity)) return "positive_equity_required" as const;
  if (
    !hasValidDate(roe.referenceDate) ||
    !roe.sourceDocument ||
    !equityReferenceDate ||
    roe.referenceDate !== equityReferenceDate
  )
    return "equity_reference_mismatch" as const;
  return null;
}

function evaluateMaximum(
  indicator: StockCriteriaIndicator | undefined,
  maximum: number | null,
): StockCriterionResult {
  if (!indicator || indicator.value === null)
    return unavailable("indicator_unavailable");
  if (!isPositiveFinite(indicator.value))
    return unavailable("positive_multiple_required");
  if (!hasValidDate(indicator.referenceDate) || !indicator.sourceDocument)
    return unavailable("indicator_unavailable");
  if (
    !indicator.marketDataDate ||
    !Number.isFinite(Date.parse(indicator.marketDataDate))
  )
    return unavailable("market_data_date_required");
  if (maximum === null)
    return result("unavailable", "threshold_not_configured", indicator.value);
  const meets = indicator.value <= maximum;
  return result(
    meets ? "meets" : "fails",
    meets ? "within_threshold" : "outside_threshold",
    indicator.value,
    maximum,
  );
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
 * rankings, or recommendations. P/L and P/VP are valuation signals, ROE is an
 * operating-quality signal, and Graham/Bazin remain separate references.
 */
export function evaluateStockCriteria(
  input: StockCriteriaEvaluationInput,
): StockCriteriaEvaluation {
  const sectorClassification = classifyCvmSector(input.sector);
  const bankSector = isBankSector(input.sector);
  const peMaximum = configuredThreshold(
    input.preferences?.maximumPe,
    defaultStockCriteriaPreferences.maximumPe,
  );
  const pbMaximum =
    input.preferences?.maximumPb === undefined
      ? defaultStockCriteriaPreferences.maximumPb
      : input.preferences.maximumPb;
  const roeMinimum = configuredThreshold(
    input.preferences?.minimumRoePercent,
    defaultStockCriteriaPreferences.minimumRoePercent,
  );

  const qualityCriteria: StockCriteriaEvaluation["qualityCriteria"] = {
    roe: unavailable("indicator_unavailable"),
    netDebtToEbitda:
      sectorClassification === "financial"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("industrial_indicator_not_in_contract"),
    roic:
      sectorClassification === "financial"
        ? notApplicable("financial_sector_methodology_required")
        : unavailable("industrial_indicator_not_in_contract"),
  };
  const valuationCriteria: StockCriteriaEvaluation["valuationCriteria"] = {
    pe: unavailable("indicator_unavailable"),
    pb: unavailable("indicator_unavailable"),
  };
  const priceReferences: StockCriteriaEvaluation["priceReferences"] = {
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
    for (const key of Object.keys(
      qualityCriteria,
    ) as StockQualityCriterionKey[])
      qualityCriteria[key] = notApplicable("not_a_supported_equity_instrument");
    for (const key of Object.keys(
      valuationCriteria,
    ) as StockValuationCriterionKey[])
      valuationCriteria[key] = notApplicable(
        "not_a_supported_equity_instrument",
      );
    for (const key of Object.keys(priceReferences) as StockPriceReferenceKey[])
      priceReferences[key] = notApplicable("not_a_supported_equity_instrument");
    return {
      sectorClassification,
      qualityCriteria,
      valuationCriteria,
      priceReferences,
    };
  }

  if (input.instrument === "unknown") {
    for (const key of Object.keys(
      qualityCriteria,
    ) as StockQualityCriterionKey[])
      qualityCriteria[key] = unavailable("instrument_type_unconfirmed");
    for (const key of Object.keys(
      valuationCriteria,
    ) as StockValuationCriterionKey[])
      valuationCriteria[key] = unavailable("instrument_type_unconfirmed");
    for (const key of Object.keys(priceReferences) as StockPriceReferenceKey[])
      priceReferences[key] = unavailable("instrument_type_unconfirmed");
    return {
      sectorClassification,
      qualityCriteria,
      valuationCriteria,
      priceReferences,
    };
  }

  if (!supportedSector) {
    for (const key of Object.keys(
      qualityCriteria,
    ) as StockQualityCriterionKey[])
      qualityCriteria[key] = unavailable("sector_not_supported");
    for (const key of Object.keys(
      valuationCriteria,
    ) as StockValuationCriterionKey[])
      valuationCriteria[key] = unavailable("sector_not_supported");
    for (const key of Object.keys(priceReferences) as StockPriceReferenceKey[])
      priceReferences[key] = unavailable("sector_not_supported");
    return {
      sectorClassification,
      qualityCriteria,
      valuationCriteria,
      priceReferences,
    };
  }

  const pe = indicatorValue(input.indicators, "pe");
  const pb = indicatorValue(input.indicators, "pb");
  if (sectorClassification === "financial") {
    valuationCriteria.pe = notApplicable(
      "financial_sector_methodology_required",
      pe?.value ?? null,
    );
    valuationCriteria.pb = evaluateMaximum(pb, pbMaximum);
  } else {
    valuationCriteria.pe = evaluateMaximum(pe, peMaximum);
    valuationCriteria.pb = evaluateMaximum(pb, pbMaximum);
  }

  const roe = indicatorValue(input.indicators, "roe");
  if (roe) {
    if (sectorClassification === "financial" && !bankSector) {
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
      if (issue) qualityCriteria.roe = unavailable(issue);
      else {
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

  if (input.recurringDividendCoverageComplete) {
    priceReferences.bazin = comparePriceWithReference(
      input.price,
      input.bazinReferencePrice,
    );
  }
  priceReferences.graham = comparePriceWithReference(
    input.price,
    input.grahamReferencePrice,
  );

  return {
    sectorClassification,
    qualityCriteria,
    valuationCriteria,
    priceReferences,
  };
}
