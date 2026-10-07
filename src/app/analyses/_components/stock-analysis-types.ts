export type AnalysisPeriod = {
  referenceDate: string;
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
  cnpj: string | null;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  priceUpdatedAt: string | null;
  history: Array<{ date: string; close: number }>;
  fundamentals: AnalysisPeriod[];
  indicators: AnalysisIndicator[];
};
