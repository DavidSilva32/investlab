export type MarketHistoryFailure = {
  reason:
    | "rate_limited"
    | "authentication"
    | "timeout"
    | "provider_error"
    | "invalid_response";
  retryAfterSeconds?: number;
};

export type MarketHistoryResult = {
  ticker: string;
  history: Array<{ date: string; close: number }>;
  historyStatus: "available" | "empty" | "unavailable";
  historyFailure?: MarketHistoryFailure;
};

export type MarketData = {
  ticker: string;
  companyName: string | null;
  cnpj: string | null;
  price: number | null;
  marketCap: number | null;
  changePercent: number | null;
  priceUpdatedAt: string | null;
  history: Array<{ date: string; close: number }>;
  historyStatus?: "available" | "empty" | "unavailable";
  historyFailure?: MarketHistoryFailure;
};
export type MarketTicker = { ticker: string; name: string };
export type MarketQuote = {
  ticker: string;
  companyName: string | null;
  price: number | null;
  marketCap: number | null;
  observedAt: Date | null;
};
export interface MarketDataProvider {
  getByTicker(ticker: string): Promise<MarketData>;
  getHistoryByTicker?(
    ticker: string,
    options?: { bypassCache?: boolean },
  ): Promise<MarketHistoryResult>;
  getQuoteByTicker(ticker: string): Promise<MarketQuote>;
  searchTickers(query: string): Promise<MarketTicker[]>;
}
