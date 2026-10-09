export const queryKeys = {
  portfolio: {
    all: ["portfolio"] as const,
    overview: () => ["portfolio", "overview"] as const,
    allocation: () => ["portfolio", "allocation"] as const,
    objectives: () => ["portfolio", "objectives"] as const,
    emergencyReserve: () => ["portfolio", "emergency-reserve"] as const,
    emergencyReservePreview: (input: unknown) =>
      ["portfolio", "emergency-reserve", "preview", input] as const,
    strategy: () => ["portfolio", "strategy"] as const,
    positionSuggestions: (endpoint: string, input: unknown) =>
      [
        "portfolio",
        "position-combination-suggestions",
        endpoint,
        input,
      ] as const,
    objectiveAllocationPreview: (input: unknown) =>
      ["portfolio", "objectives", "allocation-preview", input] as const,
  },
  analyses: {
    all: ["analyses"] as const,
    search: (query: string) => ["analyses", "search", query] as const,
    stock: (ticker: string) => ["analyses", "stock", ticker] as const,
    comparison: (tickers: string[]) =>
      ["analyses", "comparison", ...tickers] as const,
    screener: (filters: unknown) => ["analyses", "screener", filters] as const,
    opportunities: () => ["analyses", "portfolio-opportunities"] as const,
  },
  settings: {
    all: ["settings"] as const,
    marketData: () => ["settings", "market-data"] as const,
    screener: () => ["settings", "screener"] as const,
  },
} as const;
