export type AnalysisPeriod = {
  referenceDate: string;
  periodType?: "annual" | "interim";
  periodStart?: string | null;
  periodEnd?: string;
  filingReferenceDate?: string | null;
  exerciseOrder?: "last" | "previous" | null;
  periodBasis?:
    | "annual"
    | "year_to_date"
    | "quarterly"
    | "trailing_twelve_months"
    | "unknown";
  isDerived?: boolean;
  sourceDocument: "DFP" | "ITR";
  revenue: string | null;
  netIncome: string | null;
  equity: string | null;
};

export function annualAnalysisPeriods(periods: AnalysisPeriod[]) {
  const byYear = new Map<string, AnalysisPeriod>();
  for (const period of periods) {
    if (
      period.sourceDocument !== "DFP" ||
      period.periodType === "interim" ||
      (period.periodBasis !== undefined && period.periodBasis !== "annual")
    )
      continue;
    const year = period.referenceDate.slice(0, 4);
    const existing = byYear.get(year);
    if (
      !existing ||
      (period.filingReferenceDate ?? "") > (existing.filingReferenceDate ?? "")
    )
      byYear.set(year, period);
  }
  return [...byYear.values()].sort((left, right) =>
    left.referenceDate.localeCompare(right.referenceDate),
  );
}

export type AnalysisIndicator = {
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
    | null;
  marketDataDate?: string | null;
};

export type StockAnalysis = {
  ticker: string;
  issuerSector?: string | null;
  issuerMetadataUpdatedAt?: string | null;
  instrumentType?: "stock" | "fii" | "etf" | "bdr" | "unknown";
  cnpj: string | null;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  priceUpdatedAt: string | null;
  priceIsStale?: boolean;
  fundamentalsIsStale?: boolean;
  fundamentalsFetchedAt?: string | null;
  history: Array<{ date: string; close: number }>;
  historyStatus?: "available" | "empty" | "unavailable";
  historyFailure?: {
    reason:
      | "rate_limited"
      | "authentication"
      | "timeout"
      | "provider_error"
      | "invalid_response";
    retryAfterSeconds?: number;
  };
  fundamentals: AnalysisPeriod[];
  indicators: AnalysisIndicator[];
};
