export type FundamentalPeriod = {
  referenceDate: string;
  periodType: "annual" | "quarterly";
  sourceDocument: "DFP" | "ITR";
  revenue: string | null;
  netIncome: string | null;
  equity: string | null;
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
