export type AnalysisPeriod = {
  referenceDate: string;
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
};

export type StockAnalysis = {
  ticker: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  history: Array<{ date: string; close: number }>;
  fundamentals: AnalysisPeriod[];
  indicators: AnalysisIndicator[];
};
