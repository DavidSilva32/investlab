import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  stockFundamentalRefreshes,
  stockFundamentals,
} from "@/infrastructure/database/schema";
import { logger } from "@/infrastructure/logging/logger";

export class StockFundamentalsRepository {
  async listByTicker(ticker: string) {
    const startedAt = Date.now();
    const periods = await getDatabaseClient()
      .select()
      .from(stockFundamentals)
      .where(eq(stockFundamentals.ticker, ticker))
      .orderBy(desc(stockFundamentals.referenceDate));
    logger.info("stock_fundamentals_repository_read_completed", {
      ticker,
      periods: periods.length,
      durationMs: Date.now() - startedAt,
    });
    return periods;
  }

  async getRefresh(ticker: string, cnpj: string, sourceVersion: string) {
    const [refresh] = await getDatabaseClient()
      .select({
        status: stockFundamentalRefreshes.status,
        retryAfter: stockFundamentalRefreshes.retryAfter,
        errorCode: stockFundamentalRefreshes.errorCode,
        refreshDue: sql<boolean>`${stockFundamentalRefreshes.completedAt} <= now() - interval '7 days'`,
        activeLease: sql<boolean>`${stockFundamentalRefreshes.leaseExpiresAt} > now()`,
        retryReady: sql<boolean>`${stockFundamentalRefreshes.retryAfter} IS NULL OR ${stockFundamentalRefreshes.retryAfter} <= now()`,
      })
      .from(stockFundamentalRefreshes)
      .where(
        and(
          eq(stockFundamentalRefreshes.ticker, ticker),
          eq(stockFundamentalRefreshes.cnpj, cnpj),
          eq(stockFundamentalRefreshes.sourceVersion, sourceVersion),
        ),
      )
      .limit(1);
    if (!refresh)
      return { status: "idle" as const, retryAfter: null, errorCode: null };
    if (refresh.status === "RUNNING" && !refresh.activeLease)
      return { status: "idle" as const, retryAfter: null, errorCode: null };
    if (refresh.status === "FAILED" && refresh.retryReady)
      return { status: "idle" as const, retryAfter: null, errorCode: null };
    if (refresh.status === "COMPLETED" && refresh.refreshDue)
      return { status: "idle" as const, retryAfter: null, errorCode: null };
    return {
      status: refresh.status.toLowerCase() as
        "running" | "completed" | "failed",
      retryAfter: refresh.retryAfter?.toISOString() ?? null,
      errorCode: refresh.errorCode,
    };
  }

  async listDueRefreshes(sourceVersion: string, limit: number) {
    return getDatabaseClient()
      .select({
        ticker: stockFundamentalRefreshes.ticker,
        cnpj: stockFundamentalRefreshes.cnpj,
        sourceVersion: stockFundamentalRefreshes.sourceVersion,
      })
      .from(stockFundamentalRefreshes)
      .where(
        and(
          eq(stockFundamentalRefreshes.sourceVersion, sourceVersion),
          or(
            and(
              eq(stockFundamentalRefreshes.status, "COMPLETED"),
              sql`${stockFundamentalRefreshes.completedAt} <= now() - interval '7 days'`,
            ),
            and(
              eq(stockFundamentalRefreshes.status, "FAILED"),
              sql`(${stockFundamentalRefreshes.retryAfter} IS NULL OR ${stockFundamentalRefreshes.retryAfter} <= now())`,
            ),
            and(
              eq(stockFundamentalRefreshes.status, "RUNNING"),
              sql`${stockFundamentalRefreshes.leaseExpiresAt} <= now()`,
            ),
          ),
        ),
      )
      .orderBy(sql`${stockFundamentalRefreshes.completedAt} ASC NULLS FIRST`)
      .limit(limit);
  }

  async claimRefresh(ticker: string, cnpj: string, sourceVersion: string) {
    const leaseToken = randomUUID();
    const [claimed] = await getDatabaseClient()
      .insert(stockFundamentalRefreshes)
      .values({
        ticker,
        cnpj,
        sourceVersion,
        status: "RUNNING",
        leaseToken,
        startedAt: sql`now()`,
        leaseExpiresAt: sql`now() + interval '5 minutes'`,
        attemptCount: 1,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [
          stockFundamentalRefreshes.ticker,
          stockFundamentalRefreshes.cnpj,
          stockFundamentalRefreshes.sourceVersion,
        ],
        set: {
          status: "RUNNING",
          leaseToken,
          startedAt: sql`now()`,
          leaseExpiresAt: sql`now() + interval '5 minutes'`,
          completedAt: null,
          retryAfter: null,
          errorCode: null,
          attemptCount: sql`${stockFundamentalRefreshes.attemptCount} + 1`,
          updatedAt: sql`now()`,
        },
        setWhere: or(
          and(
            eq(stockFundamentalRefreshes.status, "RUNNING"),
            sql`${stockFundamentalRefreshes.leaseExpiresAt} <= now()`,
          ),
          and(
            eq(stockFundamentalRefreshes.status, "FAILED"),
            sql`(${stockFundamentalRefreshes.retryAfter} IS NULL OR ${stockFundamentalRefreshes.retryAfter} <= now())`,
          ),
          and(
            eq(stockFundamentalRefreshes.status, "COMPLETED"),
            sql`${stockFundamentalRefreshes.completedAt} <= now() - interval '7 days'`,
          ),
        ),
      })
      .returning({ leaseToken: stockFundamentalRefreshes.leaseToken });
    return claimed?.leaseToken ?? null;
  }

  async completeRefresh(
    ticker: string,
    cnpj: string,
    sourceVersion: string,
    leaseToken: string,
    periods: FundamentalPeriod[],
  ) {
    if (periods.length === 0) return false;
    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      const [completed] = await transaction
        .update(stockFundamentalRefreshes)
        .set({
          status: "COMPLETED",
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(stockFundamentalRefreshes.ticker, ticker),
            eq(stockFundamentalRefreshes.cnpj, cnpj),
            eq(stockFundamentalRefreshes.sourceVersion, sourceVersion),
            eq(stockFundamentalRefreshes.leaseToken, leaseToken),
            eq(stockFundamentalRefreshes.status, "RUNNING"),
            sql`${stockFundamentalRefreshes.leaseExpiresAt} > now()`,
          ),
        )
        .returning({ ticker: stockFundamentalRefreshes.ticker });
      if (!completed) return false;
      await transaction
        .delete(stockFundamentals)
        .where(eq(stockFundamentals.ticker, ticker));
      await transaction.insert(stockFundamentals).values(
        periods.map((period) => ({
          ticker,
          cnpj,
          periodType: period.periodType,
          referenceDate: period.referenceDate,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          filingReferenceDate: period.filingReferenceDate,
          exerciseOrder: period.exerciseOrder,
          periodBasis: period.periodBasis,
          revenueVersion: period.revenueVersion,
          revenueAccountLabel: period.revenueAccountLabel,
          netIncomeVersion: period.netIncomeVersion,
          netIncomeAccount: period.netIncomeAccount,
          netIncomeConcept: period.netIncomeConcept,
          equityVersion: period.equityVersion,
          equityAccount: period.equityAccount,
          equityConcept: period.equityConcept,
          revenue: period.revenue,
          netIncome: period.netIncome,
          equity: period.equity,
          assets: period.assets,
          liabilities: period.liabilities,
          cash: period.cash,
          debt: period.debt,
          sourceDocument: period.sourceDocument,
          sourceVersion,
        })),
      );
      return true;
    });
  }

  async failRefresh(
    ticker: string,
    cnpj: string,
    sourceVersion: string,
    leaseToken: string,
    errorCode: string,
  ) {
    await getDatabaseClient()
      .update(stockFundamentalRefreshes)
      .set({
        status: "FAILED",
        errorCode,
        retryAfter: sql`now() + interval '5 minutes'`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(stockFundamentalRefreshes.ticker, ticker),
          eq(stockFundamentalRefreshes.cnpj, cnpj),
          eq(stockFundamentalRefreshes.sourceVersion, sourceVersion),
          eq(stockFundamentalRefreshes.leaseToken, leaseToken),
          eq(stockFundamentalRefreshes.status, "RUNNING"),
          sql`${stockFundamentalRefreshes.leaseExpiresAt} > now()`,
        ),
      );
  }
}
export const stockFundamentalsRepository = new StockFundamentalsRepository();
