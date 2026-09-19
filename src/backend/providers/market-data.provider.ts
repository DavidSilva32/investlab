export type MarketData = {
  ticker: string;
  companyName: string | null;
  cnpj: string | null;
  price: number | null;
  marketCap: number | null;
  changePercent: number | null;
  priceUpdatedAt: string | null;
  history: Array<{ date: string; close: number }>;
};
export interface MarketDataProvider {
  getByTicker(ticker: string): Promise<MarketData>;
}
