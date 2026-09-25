import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import type { MarketQuote } from "@/backend/providers/market-data.provider";
import {
  screenerRepository,
  type ScreenerRepository,
} from "@/backend/repositories/screener.repository";
import {
  filterScreenerCompanies,
  type ScreenerSecurity,
} from "@/backend/services/screener-metrics";
import { logger } from "@/infrastructure/logging/logger";

const maxQuoteCallsPerBatch = 4;
const marketFreshnessMs = 7 * 24 * 60 * 60 * 1000;
const invalidQuoteRetryMs = 60 * 60 * 1000;

type QuoteProvider = Pick<BrapiMarketDataProvider, "getQuoteByTicker">;
type MarketSnapshot = {
  issuerCnpj: string;
  observedAt: Date;
  quoteObservedAt: Date | null;
  marketCap: number | null;
  price: number | null;
  sourceTicker: string;
  classSemanticsValidated: boolean;
  marketRefreshRunId: string;
  quoteEvidence: QuoteEvidence[];
};
type QuoteEvidence = {
  requestedTicker: string;
  returnedTicker: string;
  price: number | null;
  marketCap: number | null;
  quoteObservedAt: Date | null;
  validationResult: string;
};
type MarketRepository = Pick<
  ScreenerRepository,
  | "getUniverse"
  | "startMarketRefreshRun"
  | "saveMarketSnapshot"
  | "completeMarketRefreshRun"
>;

export function validateIssuerMarketQuotes(
  securities: ScreenerSecurity[],
  quotes: MarketQuote[],
) {
  if (securities.length === 0 || securities.length !== quotes.length)
    return null;
  const expectedTickers = securities.map(({ ticker }) => ticker).sort();
  const actualTickers = quotes.map(({ ticker }) => ticker).sort();
  if (expectedTickers.some((ticker, index) => ticker !== actualTickers[index]))
    return null;

  const orderedSecurities = [...securities].sort((left, right) =>
    left.ticker.localeCompare(right.ticker),
  );
  const orderedQuotes = orderedSecurities.map((security) =>
    quotes.find((quote) => quote.ticker === security.ticker),
  );
  const firstQuote = orderedQuotes[0]!;
  if (
    firstQuote.marketCap === null ||
    firstQuote.marketCap <= 0 ||
    firstQuote.observedAt === null
  )
    return null;
  const firstObservedAt = firstQuote.observedAt.getTime();
  if (!Number.isFinite(firstObservedAt)) return null;
  const matches = orderedQuotes.every(
    (quote) =>
      quote!.marketCap === firstQuote.marketCap &&
      quote!.observedAt?.getTime() === firstObservedAt,
  );
  if (!matches) return null;

  return {
    marketCap: firstQuote.marketCap,
    price: firstQuote.price,
    sourceTicker: firstQuote.ticker,
    quoteObservedAt: firstQuote.observedAt,
  };
}

export function collectQuoteEvidence(
  securities: ScreenerSecurity[],
  quotes: MarketQuote[],
): QuoteEvidence[] {
  const orderedSecurities = [...securities].sort((left, right) =>
    left.ticker.localeCompare(right.ticker),
  );
  const evidence = orderedSecurities.map((security, index) => {
    const quote = quotes[index];
    let validationResult = "VALIDATED";
    if (!quote) validationResult = "QUOTE_MISSING";
    else if (quote.ticker !== security.ticker)
      validationResult = "TICKER_MISMATCH";
    else if (quote.marketCap === null) validationResult = "MARKET_CAP_MISSING";
    else if (quote.marketCap <= 0) validationResult = "MARKET_CAP_NONPOSITIVE";
    else if (
      quote.observedAt === null ||
      !Number.isFinite(quote.observedAt.getTime())
    )
      validationResult = "QUOTE_TIME_MISSING";
    return {
      requestedTicker: security.ticker,
      returnedTicker: quote?.ticker ?? "",
      price: quote?.price ?? null,
      marketCap: quote?.marketCap ?? null,
      quoteObservedAt: quote?.observedAt ?? null,
      validationResult,
    };
  });
  if (evidence.some(({ validationResult }) => validationResult !== "VALIDATED"))
    return evidence;
  const first = evidence[0];
  if (evidence.some(({ marketCap }) => marketCap !== first?.marketCap))
    return evidence.map((item) => ({
      ...item,
      validationResult: "MARKET_CAP_MISMATCH",
    }));
  if (
    evidence.some(
      ({ quoteObservedAt }) =>
        quoteObservedAt?.getTime() !== first?.quoteObservedAt?.getTime(),
    )
  )
    return evidence.map((item) => ({
      ...item,
      validationResult: "QUOTE_TIME_MISMATCH",
    }));
  return evidence;
}
function isRecentlyAttempted(
  snapshot: {
    observedAt: Date;
    quoteObservedAt: Date | null;
    marketCap: number | string | null;
    classSemanticsValidated: boolean;
    marketRefreshRunId?: string | null;
  } | null,
  now: Date,
) {
  if (snapshot === null) return false;
  const age = now.getTime() - snapshot.observedAt.getTime();
  const quoteAge = snapshot.quoteObservedAt
    ? now.getTime() - snapshot.quoteObservedAt.getTime()
    : -1;
  if (
    snapshot.classSemanticsValidated &&
    snapshot.marketCap !== null &&
    Number(snapshot.marketCap) > 0 &&
    snapshot.quoteObservedAt !== null
  )
    return (
      age >= 0 &&
      age <= marketFreshnessMs &&
      quoteAge >= 0 &&
      quoteAge <= marketFreshnessMs
    );
  return (
    snapshot.marketRefreshRunId !== null &&
    snapshot.marketRefreshRunId !== undefined &&
    age >= 0 &&
    age <= invalidQuoteRetryMs
  );
}

function invalidSnapshot(
  issuerCnpj: string,
  sourceTicker: string,
  observedAt: Date,
  marketRefreshRunId: string,
  quoteEvidence: QuoteEvidence[],
): MarketSnapshot {
  return {
    issuerCnpj,
    observedAt,
    quoteObservedAt: null,
    marketCap: null,
    price: null,
    sourceTicker,
    classSemanticsValidated: false,
    marketRefreshRunId,
    quoteEvidence,
  };
}

export class ScreenerMarketService {
  constructor(
    private readonly provider: QuoteProvider = new BrapiMarketDataProvider(),
    private readonly repository: MarketRepository = screenerRepository,
    private readonly clock = () => new Date(),
  ) {}

  async refreshBatch(requestId?: string) {
    const now = this.clock();
    const universe = await this.repository.getUniverse();
    const eligible = filterScreenerCompanies(universe, {}).filter(
      ({ quantitativeEligible }) => quantitativeEligible,
    );
    const companyByCnpj = new Map(
      universe.map((company) => [company.cnpj, company]),
    );
    const stale = eligible.filter(
      (company) =>
        !isRecentlyAttempted(
          companyByCnpj.get(company.cnpj)?.marketSnapshot ?? null,
          now,
        ),
    );
    const selected: typeof stale = [];
    let selectedQuoteCalls = 0;
    for (const company of stale) {
      const classCount = company.securities.length;
      if (classCount > maxQuoteCallsPerBatch) {
        if (selected.length === 0) selected.push(company);
        break;
      }
      if (selectedQuoteCalls + classCount > maxQuoteCallsPerBatch) break;
      selected.push(company);
      selectedQuoteCalls += classCount;
    }
    const runId = await this.repository.startMarketRefreshRun(now);
    if (runId === null)
      throw new ApplicationError(
        "Uma atualização de mercado já está em andamento.",
        409,
      );
    let attemptedIssuers = 0;
    let updatedIssuers = 0;
    let unavailableIssuers = 0;
    let providerError: ApplicationError | null = null;

    for (const company of selected) {
      attemptedIssuers += 1;
      const securities = [...company.securities].sort((left, right) =>
        left.ticker.localeCompare(right.ticker),
      );
      const quotes: MarketQuote[] = [];
      for (const security of securities) {
        try {
          quotes.push(await this.provider.getQuoteByTicker(security.ticker));
        } catch (error) {
          if (error instanceof ApplicationError && error.statusCode === 429) {
            providerError = error;
          } else {
            logger.warn("screener_market_quote_unavailable", {
              requestId,
              ticker: security.ticker,
              errorType: error instanceof Error ? error.name : typeof error,
            });
            providerError = new ApplicationError(
              "Não foi possível atualizar as cotações agora. Tente novamente mais tarde.",
              502,
            );
          }
          unavailableIssuers += 1;
          break;
        }
      }
      if (providerError) break;
      const observationTime = this.clock();
      const resolved = validateIssuerMarketQuotes(securities, quotes);
      const quoteEvidence = collectQuoteEvidence(securities, quotes);
      const sourceTicker =
        resolved?.sourceTicker ?? securities[0]?.ticker ?? "UNKNOWN";
      if (securities.length === 0) {
        unavailableIssuers += 1;
        continue;
      }
      await this.repository.saveMarketSnapshot(
        resolved
          ? {
              issuerCnpj: company.cnpj,
              observedAt: observationTime,
              ...resolved,
              classSemanticsValidated: true,
              marketRefreshRunId: runId,
              quoteEvidence,
            }
          : invalidSnapshot(
              company.cnpj,
              sourceTicker,
              observationTime,
              runId,
              quoteEvidence,
            ),
      );
      if (resolved) updatedIssuers += 1;
      else unavailableIssuers += 1;
    }
    const completedAt = this.clock();
    await this.repository.completeMarketRefreshRun({
      id: runId,
      completedAt,
      attemptedIssuers,
      updatedIssuers,
      unavailableIssuers,
      skippedFreshIssuers: eligible.length - stale.length,
      status: providerError ? "PARTIAL" : "COMPLETED",
    });
    if (providerError) throw providerError;

    return {
      attemptedIssuers,
      updatedIssuers,
      unavailableIssuers,
      skippedFreshIssuers: eligible.length - stale.length,
      totalStaleIssuers: stale.length,
      remainingIssuers: stale.length - selected.length,
      batchSize: selected.length,
      completedAt: completedAt.toISOString(),
    };
  }
}

export const screenerMarketService = new ScreenerMarketService();
