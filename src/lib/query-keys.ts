export const queryKeys = {
  finances: {
    all: ["finances"] as const,
    overview: (month: string) => ["finances", "overview", month] as const,
    entries: (month: string) => ["finances", "entries", month] as const,
    recurrences: (month: string) => ["finances", "recurrences", month] as const,
    categories: () => ["finances", "categories"] as const,
    cardSettlements: () => ["finances", "card-settlements"] as const,
  },
  portfolio: {
    all: ["portfolio"] as const,
    overview: () => ["portfolio", "overview"] as const,
    monthlyReview: (period: string | null) =>
      ["portfolio", "monthly-review", period ?? "latest"] as const,
    allocation: () => ["portfolio", "allocation"] as const,
    objectives: () => ["portfolio", "objectives"] as const,
    emergencyReserve: () => ["portfolio", "emergency-reserve"] as const,
    proventos: () => ["portfolio", "proventos"] as const,
    strategy: () => ["portfolio", "strategy"] as const,
  },
  analyses: {
    all: ["analyses"] as const,
    search: (query: string) => ["analyses", "search", query] as const,
    stock: (ticker: string) => ["analyses", "stock", ticker] as const,
    stockHistory: (ticker: string) =>
      ["analyses", "stock", ticker, "history"] as const,
    comparison: (tickers: string[]) =>
      ["analyses", "comparison", ...tickers] as const,
    opportunities: () => ["analyses", "portfolio-opportunities"] as const,
    screener: (filters: unknown) => ["analyses", "screener", filters] as const,
  },
  settings: {
    all: ["settings"] as const,
    marketData: () => ["settings", "market-data"] as const,
    screener: () => ["settings", "screener"] as const,
  },
} as const;
