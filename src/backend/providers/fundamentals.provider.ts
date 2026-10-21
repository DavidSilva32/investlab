export type FundamentalPeriod = {
  referenceDate: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodType: "annual" | "interim";
  sourceDocument: "DFP" | "ITR";
  exerciseOrder?: "last" | "previous" | null;
  filingReferenceDate?: string | null;
  periodBasis?:
    | "annual"
    | "year_to_date"
    | "quarterly"
    | "trailing_twelve_months"
    | "unknown";
  isDerived?: boolean;
  revenueVersion?: string | null;
  revenueAccountLabel?: string | null;
  netIncomeVersion?: string | null;
  netIncomeAccount?: string | null;
  netIncomeConcept?: string | null;
  parentNetIncomeVersion?: string | null;
  parentNetIncomeAccount?: string | null;
  parentNetIncomeConcept?: string | null;
  nonControllingNetIncomeVersion?: string | null;
  nonControllingNetIncomeAccount?: string | null;
  nonControllingNetIncomeConcept?: string | null;
  equityVersion?: string | null;
  equityAccount?: string | null;
  equityConcept?: string | null;
  nonControllingEquityVersion?: string | null;
  nonControllingEquityAccount?: string | null;
  nonControllingEquityConcept?: string | null;
  revenue: string | null;
  netIncome: string | null;
  parentNetIncome?: string | null;
  nonControllingNetIncome?: string | null;
  equity: string | null;
  nonControllingEquity?: string | null;
  assets: string | null;
  liabilities: string | null;
  cash: string | null;
  debt: string | null;
};
export interface FundamentalsProvider {
  getByTicker(input: {
    ticker: string;
    cnpj: string | null;
  }): Promise<FundamentalPeriod[]>;
}
