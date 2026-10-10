import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
} from "drizzle-orm";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerMarketRefreshRuns,
  screenerIssuers,
  screenerMarketSnapshots,
  screenerMarketSnapshotQuotes,
  screenerSecurities,
  cvmShareClassReconciliations,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { classifyCvmSector } from "@/lib/cvm-sector-classification";
import { logger } from "@/infrastructure/logging/logger";

export class ScreenerRepository {
  async getComparisonMetadata(tickers: string[]) {
    if (tickers.length === 0) return [];
    const startedAt = Date.now();
    const metadata = await getDatabaseClient()
      .select({
        ticker: screenerSecurities.ticker,
        securityName: screenerSecurities.name,
        securityUpdatedAt: screenerSecurities.updatedAt,
        cnpj: screenerIssuers.cnpj,
        cvmCode: screenerIssuers.cvmCode,
        issuerName: screenerIssuers.name,
        sector: screenerIssuers.sector,
        issuerMetadataUpdatedAt: screenerIssuers.updatedAt,
      })
      .from(screenerSecurities)
      .innerJoin(
        screenerIssuers,
        eq(screenerSecurities.issuerCnpj, screenerIssuers.cnpj),
      )
      .where(
        and(
          inArray(screenerSecurities.ticker, tickers),
          inArray(screenerSecurities.subType, ["stock", "unit"]),
          eq(screenerSecurities.isActive, true),
        ),
      );
    logger.info("screener_repository_comparison_metadata_loaded", {
      requestedTickers: tickers.length,
      matchedSecurities: metadata.length,
      durationMs: Date.now() - startedAt,
    });
    return metadata;
  }

  async getValidatedAnalysisQuote(ticker: string) {
    const startedAt = Date.now();
    const now = new Date();
    const earliestFreshObservation = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const [quote] = await getDatabaseClient()
      .select({
        ticker: screenerMarketSnapshotQuotes.requestedTicker,
        returnedTicker: screenerMarketSnapshotQuotes.returnedTicker,
        issuerCnpj: screenerIssuers.cnpj,
        companyName: screenerIssuers.name,
        price: screenerMarketSnapshotQuotes.price,
        marketCap: screenerMarketSnapshotQuotes.marketCap,
        quoteObservedAt: screenerMarketSnapshotQuotes.quoteObservedAt,
        snapshotMarketCap: screenerMarketSnapshots.marketCap,
        snapshotObservedAt: screenerMarketSnapshots.observedAt,
        snapshotQuoteObservedAt: screenerMarketSnapshots.quoteObservedAt,
      })
      .from(screenerMarketSnapshotQuotes)
      .innerJoin(
        screenerMarketSnapshots,
        eq(screenerMarketSnapshotQuotes.snapshotId, screenerMarketSnapshots.id),
      )
      .innerJoin(
        screenerSecurities,
        and(
          eq(
            screenerSecurities.ticker,
            screenerMarketSnapshotQuotes.requestedTicker,
          ),
          eq(screenerSecurities.issuerCnpj, screenerMarketSnapshots.issuerCnpj),
          eq(screenerSecurities.isActive, true),
        ),
      )
      .innerJoin(
        screenerIssuers,
        eq(screenerIssuers.cnpj, screenerMarketSnapshots.issuerCnpj),
      )
      .where(
        and(
          eq(screenerMarketSnapshotQuotes.requestedTicker, ticker),
          eq(screenerMarketSnapshotQuotes.returnedTicker, ticker),
          eq(screenerMarketSnapshotQuotes.validationResult, "VALIDATED"),
          eq(screenerMarketSnapshots.classSemanticsValidated, true),
          gt(screenerMarketSnapshotQuotes.price, "0"),
          gt(screenerMarketSnapshotQuotes.marketCap, "0"),
          gt(screenerMarketSnapshots.marketCap, "0"),
          eq(
            screenerMarketSnapshotQuotes.marketCap,
            screenerMarketSnapshots.marketCap,
          ),
          eq(
            screenerMarketSnapshotQuotes.quoteObservedAt,
            screenerMarketSnapshots.quoteObservedAt,
          ),
          gte(
            screenerMarketSnapshotQuotes.quoteObservedAt,
            earliestFreshObservation,
          ),
          lte(screenerMarketSnapshotQuotes.quoteObservedAt, now),
          gte(
            screenerMarketSnapshots.quoteObservedAt,
            earliestFreshObservation,
          ),
          lte(screenerMarketSnapshots.quoteObservedAt, now),
          gte(screenerMarketSnapshots.observedAt, earliestFreshObservation),
          lte(screenerMarketSnapshots.observedAt, now),
        ),
      )
      .orderBy(desc(screenerMarketSnapshotQuotes.quoteObservedAt))
      .limit(1);
    logger.info("screener_repository_validated_quote_loaded", {
      ticker,
      quoteAvailable: Boolean(quote),
      durationMs: Date.now() - startedAt,
    });
    return quote ?? null;
  }

  async getStockValuationContext(ticker: string) {
    const database = getDatabaseClient();
    const [issuer] = await database
      .select({ cnpj: screenerIssuers.cnpj, sector: screenerIssuers.sector })
      .from(screenerSecurities)
      .innerJoin(
        screenerIssuers,
        eq(screenerSecurities.issuerCnpj, screenerIssuers.cnpj),
      )
      .where(
        and(
          eq(screenerSecurities.ticker, ticker.toUpperCase()),
          eq(screenerSecurities.isActive, true),
        ),
      )
      .limit(1);
    if (!issuer)
      return { sector: "unknown" as const, shareGateComplete: false };

    const [reconciliation] = await database
      .select({
        tickerClassStatus: cvmShareClassReconciliations.tickerClassStatus,
        unitCompositionStatus:
          cvmShareClassReconciliations.unitCompositionStatus,
        crossSourceAlignmentStatus:
          cvmShareClassReconciliations.crossSourceAlignmentStatus,
        effectiveDateStatus: cvmShareClassReconciliations.effectiveDateStatus,
        eventHistoryStatus: cvmShareClassReconciliations.eventHistoryStatus,
        reconciledAt: cvmShareClassReconciliations.reconciledAt,
      })
      .from(cvmShareClassReconciliations)
      .where(
        and(
          eq(cvmShareClassReconciliations.ticker, ticker.toUpperCase()),
          eq(cvmShareClassReconciliations.issuerCnpj, issuer.cnpj),
        ),
      )
      .orderBy(desc(cvmShareClassReconciliations.reconciledAt))
      .limit(1);
    const shareClassReconciled =
      reconciliation?.tickerClassStatus === "COMPLETE" &&
      reconciliation.unitCompositionStatus === "COMPLETE" &&
      reconciliation.crossSourceAlignmentStatus === "COMPLETE" &&
      reconciliation.effectiveDateStatus === "COMPLETE" &&
      reconciliation.eventHistoryStatus === "COMPLETE";
    // The current reconciliation record has no effective economic date to compare with a market quote.
    const marketDateAligned = false;
    const shareGateComplete = Boolean(
      shareClassReconciled && marketDateAligned,
    );

    return {
      sector: classifyCvmSector(issuer.sector),
      shareGateComplete: Boolean(shareGateComplete),
    };
  }

  async hasSuccessfulSync() {
    const [run] = await getDatabaseClient()
      .select({ id: screenerIngestionRuns.id })
      .from(screenerIngestionRuns)
      .where(eq(screenerIngestionRuns.status, "COMPLETED"))
      .limit(1);
    return Boolean(run);
  }
  async getUniverse() {
    const database = getDatabaseClient();
    const issuers = await database
      .select({
        cnpj: screenerIssuers.cnpj,
        cvmCode: screenerIssuers.cvmCode,
        name: screenerIssuers.name,
        sector: screenerIssuers.sector,
      })
      .from(screenerIssuers);
    if (issuers.length === 0) return [];

    const cnpjs = issuers.map((issuer) => issuer.cnpj);
    const minimumReferenceDate = `${new Date().getUTCFullYear() - 6}-01-01`;
    const [securities, facts, snapshots] = await Promise.all([
      database
        .select({
          issuerCnpj: screenerSecurities.issuerCnpj,
          ticker: screenerSecurities.ticker,
          name: screenerSecurities.name,
        })
        .from(screenerSecurities)
        .where(
          and(
            inArray(screenerSecurities.issuerCnpj, cnpjs),
            eq(screenerSecurities.subType, "stock"),
            eq(screenerSecurities.isActive, true),
            isNull(screenerSecurities.baseTicker),
          ),
        ),
      database
        .select({
          issuerCnpj: screenerFinancialFacts.issuerCnpj,
          referenceDate: screenerFinancialFacts.referenceDate,
          accountCode: screenerFinancialFacts.accountCode,
          accountLabel: screenerFinancialFacts.accountLabel,
          value: screenerFinancialFacts.value,
          documentType: screenerFinancialFacts.documentType,
          statementScope: screenerFinancialFacts.statementScope,
          exerciseOrder: screenerFinancialFacts.exerciseOrder,
          version: screenerFinancialFacts.version,
          sourceFile: screenerFinancialFacts.sourceFile,
        })
        .from(screenerFinancialFacts)
        .where(
          and(
            inArray(screenerFinancialFacts.issuerCnpj, cnpjs),
            gte(screenerFinancialFacts.referenceDate, minimumReferenceDate),
            inArray(screenerFinancialFacts.accountCode, [
              "3.01",
              "3.11",
              "2.03",
              "6.01",
            ]),
            eq(screenerFinancialFacts.documentType, "DFP"),
            eq(screenerFinancialFacts.statementScope, "CONSOLIDATED"),
            eq(screenerFinancialFacts.exerciseOrder, "ULTIMO"),
          ),
        ),
      database
        .select({
          issuerCnpj: screenerMarketSnapshots.issuerCnpj,
          marketCap: screenerMarketSnapshots.marketCap,
          observedAt: screenerMarketSnapshots.observedAt,
          quoteObservedAt: screenerMarketSnapshots.quoteObservedAt,
          sourceTicker: screenerMarketSnapshots.sourceTicker,
          marketRefreshRunId: screenerMarketSnapshots.marketRefreshRunId,
          classSemanticsValidated:
            screenerMarketSnapshots.classSemanticsValidated,
        })
        .from(screenerMarketSnapshots)
        .where(inArray(screenerMarketSnapshots.issuerCnpj, cnpjs))
        .orderBy(desc(screenerMarketSnapshots.observedAt)),
    ]);

    const byIssuer = new Map(
      issuers.map((issuer) => [
        issuer.cnpj,
        {
          ...issuer,
          securities: [] as { ticker: string; name: string }[],
          facts: [] as typeof facts,
          marketSnapshot: null as (typeof snapshots)[number] | null,
        },
      ]),
    );
    for (const security of securities)
      byIssuer.get(security.issuerCnpj)?.securities.push({
        ticker: security.ticker,
        name: security.name,
      });
    for (const fact of facts) byIssuer.get(fact.issuerCnpj)?.facts.push(fact);
    for (const snapshot of snapshots) {
      const company = byIssuer.get(snapshot.issuerCnpj);
      if (company && company.marketSnapshot === null)
        company.marketSnapshot = snapshot;
    }
    return [...byIssuer.values()].filter(
      (issuer) => issuer.securities.length > 0,
    );
  }

  async getMarketDataStatus() {
    const database = getDatabaseClient();
    const [runs, quotes] = await Promise.all([
      database
        .select({
          status: screenerMarketRefreshRuns.status,
          startedAt: screenerMarketRefreshRuns.startedAt,
          completedAt: screenerMarketRefreshRuns.completedAt,
          attemptedIssuers: screenerMarketRefreshRuns.attemptedIssuers,
          updatedIssuers: screenerMarketRefreshRuns.updatedIssuers,
          unavailableIssuers: screenerMarketRefreshRuns.unavailableIssuers,
          skippedFreshIssuers: screenerMarketRefreshRuns.skippedFreshIssuers,
        })
        .from(screenerMarketRefreshRuns)
        .orderBy(desc(screenerMarketRefreshRuns.startedAt))
        .limit(1),
      database
        .select({
          quoteObservedAt: screenerMarketSnapshots.quoteObservedAt,
          sourceTicker: screenerMarketSnapshots.sourceTicker,
        })
        .from(screenerMarketSnapshots)
        .where(isNotNull(screenerMarketSnapshots.quoteObservedAt))
        .orderBy(desc(screenerMarketSnapshots.quoteObservedAt))
        .limit(1),
    ]);
    return {
      latestRun: runs[0] ?? null,
      latestQuote: quotes[0] ?? null,
    };
  }

  async startMarketRefreshRun(startedAt: Date) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const expiredAt = new Date(startedAt.getTime() - 3 * 60 * 1000);
        await transaction
          .update(screenerMarketRefreshRuns)
          .set({ status: "PARTIAL", completedAt: startedAt })
          .where(
            and(
              eq(screenerMarketRefreshRuns.status, "RUNNING"),
              lt(screenerMarketRefreshRuns.startedAt, expiredAt),
            ),
          );
        const [run] = await transaction
          .insert(screenerMarketRefreshRuns)
          .values({ startedAt })
          .returning({ id: screenerMarketRefreshRuns.id });
        return run?.id ?? null;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        return null;
      throw error;
    }
  }

  async saveMarketSnapshot(snapshot: {
    issuerCnpj: string;
    observedAt: Date;
    quoteObservedAt: Date | null;
    marketCap: number | null;
    price: number | null;
    sourceTicker: string;
    classSemanticsValidated: boolean;
    marketRefreshRunId: string;
    quoteEvidence: {
      requestedTicker: string;
      returnedTicker: string;
      price: number | null;
      marketCap: number | null;
      quoteObservedAt: Date | null;
      validationResult: string;
    }[];
  }) {
    await getDatabaseClient().transaction(async (transaction) => {
      const { quoteEvidence, ...snapshotValues } = snapshot;
      const [saved] = await transaction
        .insert(screenerMarketSnapshots)
        .values({
          ...snapshotValues,
          marketCap: snapshot.marketCap?.toString() ?? null,
          price: snapshot.price?.toString() ?? null,
        })
        .returning({ id: screenerMarketSnapshots.id });
      if (!saved) throw new Error("Market snapshot was not saved");
      if (quoteEvidence.length > 0)
        await transaction.insert(screenerMarketSnapshotQuotes).values(
          quoteEvidence.map((quote) => ({
            ...quote,
            snapshotId: saved.id,
            price: quote.price?.toString() ?? null,
            marketCap: quote.marketCap?.toString() ?? null,
          })),
        );
    });
  }
  async completeMarketRefreshRun(run: {
    id: string;
    completedAt: Date;
    attemptedIssuers: number;
    updatedIssuers: number;
    unavailableIssuers: number;
    skippedFreshIssuers: number;
    status: "COMPLETED" | "PARTIAL";
  }) {
    await getDatabaseClient()
      .update(screenerMarketRefreshRuns)
      .set({
        completedAt: run.completedAt,
        attemptedIssuers: run.attemptedIssuers,
        updatedIssuers: run.updatedIssuers,
        unavailableIssuers: run.unavailableIssuers,
        skippedFreshIssuers: run.skippedFreshIssuers,
        status: run.status,
      })
      .where(eq(screenerMarketRefreshRuns.id, run.id));
  }
}

export const screenerRepository = new ScreenerRepository();
