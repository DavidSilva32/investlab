import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
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
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class ScreenerRepository {
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
        quantitativeEligible: screenerIssuers.quantitativeEligible,
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
