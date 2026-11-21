import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialMonthlyClosureVersions,
  financialMonthlyClosures,
} from "@/infrastructure/database/schema";

export type FinancialDatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

export type FinancialCloseTotals = {
  expectedIncome: string | null;
  realizedIncome: string | null;
  expectedExpenses: string | null;
  realizedExpenses: string | null;
  expectedBalance: string | null;
  recordedBalance: string | null;
  realizedCardSpending?: string | null;
  accountCashOutflow?: string | null;
  accountCashBalance?: string | null;
};

export type FinancialCloseHistoryItem = {
  closedAt: string;
  totals: FinancialCloseTotals;
};

export type FinancialCloseState = {
  status: "closed" | "needs_review";
  closedAt: string;
  totals: FinancialCloseTotals;
  history: FinancialCloseHistoryItem[];
};

function monthsFromDates(dates: Array<string | null | undefined>) {
  return [...new Set(dates.filter(Boolean).map((date) => date!.slice(0, 7)))];
}

function completeTotals(totals: {
  expectedIncome: string | null;
  realizedIncome: string | null;
  expectedExpenses: string | null;
  realizedExpenses: string | null;
  expectedBalance: string | null;
  recordedBalance: string | null;
  realizedCardSpending?: string | null;
  accountCashOutflow?: string | null;
  accountCashBalance?: string | null;
}): FinancialCloseTotals {
  return {
    ...totals,
    realizedCardSpending: totals.realizedCardSpending ?? null,
    accountCashOutflow: totals.accountCashOutflow ?? null,
    accountCashBalance: totals.accountCashBalance ?? null,
  };
}

export class FinancialMonthCloseRepository {
  async acquireFinancialWriteLock(
    transaction: FinancialDatabaseTransaction,
    userId: string,
  ) {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext('financial-entry-writes'))`,
    );
  }

  async acquireMonthLocks(
    transaction: FinancialDatabaseTransaction,
    userId: string,
    months: string[],
  ) {
    for (const month of [...new Set(months)].sort()) {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${month}))`,
      );
    }
  }

  async markDatesForReview(
    transaction: FinancialDatabaseTransaction,
    userId: string,
    dates: Array<string | null | undefined>,
  ) {
    const months = monthsFromDates(dates);
    if (months.length === 0) return;
    await this.acquireMonthLocks(transaction, userId, months);
    await transaction
      .update(financialMonthlyClosures)
      .set({ status: "NEEDS_REVIEW", updatedAt: new Date() })
      .where(
        and(
          eq(financialMonthlyClosures.userId, userId),
          inArray(financialMonthlyClosures.month, months),
        ),
      );
  }

  async getCurrent(month: string) {
    const userId = requireDataOwnerId();
    const [closure] = await getDatabaseClient()
      .select({
        id: financialMonthlyClosures.id,
        month: financialMonthlyClosures.month,
        status: financialMonthlyClosures.status,
        currentVersion: financialMonthlyClosures.currentVersion,
        closedAt: financialMonthlyClosures.closedAt,
      })
      .from(financialMonthlyClosures)
      .where(
        and(
          eq(financialMonthlyClosures.userId, userId),
          eq(financialMonthlyClosures.month, month),
        ),
      )
      .limit(1);
    if (!closure) return null;
    const database = getDatabaseClient();
    const [version] = await database
      .select({ totals: financialMonthlyClosureVersions.totals })
      .from(financialMonthlyClosureVersions)
      .where(
        and(
          eq(financialMonthlyClosureVersions.closureId, closure.id),
          eq(financialMonthlyClosureVersions.version, closure.currentVersion),
        ),
      )
      .limit(1);
    if (!version) return null;
    const history = await database
      .select({
        closedAt: financialMonthlyClosureVersions.closedAt,
        totals: financialMonthlyClosureVersions.totals,
      })
      .from(financialMonthlyClosureVersions)
      .where(
        and(
          eq(financialMonthlyClosureVersions.closureId, closure.id),
          lt(financialMonthlyClosureVersions.version, closure.currentVersion),
        ),
      )
      .orderBy(desc(financialMonthlyClosureVersions.version))
      .limit(5);
    return {
      status:
        closure.status === "NEEDS_REVIEW"
          ? ("needs_review" as const)
          : ("closed" as const),
      closedAt: closure.closedAt.toISOString(),
      totals: completeTotals(version.totals),
      history: history.map((item) => ({
        closedAt: item.closedAt.toISOString(),
        totals: completeTotals(item.totals),
      })),
    };
  }

  async closeMonth(
    month: string,
    loadTotals: () => Promise<FinancialCloseTotals>,
  ) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await this.acquireMonthLocks(transaction, userId, [month]);
      const totals = await loadTotals();
      const [existing] = await transaction
        .select()
        .from(financialMonthlyClosures)
        .where(
          and(
            eq(financialMonthlyClosures.userId, userId),
            eq(financialMonthlyClosures.month, month),
          ),
        )
        .for("update")
        .limit(1);
      const now = new Date();
      const [closure] = existing
        ? await transaction
            .update(financialMonthlyClosures)
            .set({
              status: "CLOSED",
              currentVersion: existing.currentVersion + 1,
              closedAt: now,
              updatedAt: now,
            })
            .where(eq(financialMonthlyClosures.id, existing.id))
            .returning()
        : await transaction
            .insert(financialMonthlyClosures)
            .values({ userId, month, status: "CLOSED", currentVersion: 1 })
            .returning();
      if (!closure) throw new Error("The financial month could not be closed.");
      await transaction.insert(financialMonthlyClosureVersions).values({
        closureId: closure.id,
        version: closure.currentVersion,
        totals: completeTotals(totals),
        closedAt: now,
      });
      const history = await transaction
        .select({
          closedAt: financialMonthlyClosureVersions.closedAt,
          totals: financialMonthlyClosureVersions.totals,
        })
        .from(financialMonthlyClosureVersions)
        .where(
          and(
            eq(financialMonthlyClosureVersions.closureId, closure.id),
            lt(financialMonthlyClosureVersions.version, closure.currentVersion),
          ),
        )
        .orderBy(desc(financialMonthlyClosureVersions.version))
        .limit(5);
      return {
        status: "closed" as const,
        closedAt: now.toISOString(),
        totals,
        history: history.map((item) => ({
          closedAt: item.closedAt.toISOString(),
          totals: item.totals,
        })),
      };
    });
  }

  async listVersions(month: string) {
    const userId = requireDataOwnerId();
    const [closure] = await getDatabaseClient()
      .select({ id: financialMonthlyClosures.id })
      .from(financialMonthlyClosures)
      .where(
        and(
          eq(financialMonthlyClosures.userId, userId),
          eq(financialMonthlyClosures.month, month),
        ),
      )
      .limit(1);
    if (!closure) return [];
    return getDatabaseClient()
      .select()
      .from(financialMonthlyClosureVersions)
      .where(eq(financialMonthlyClosureVersions.closureId, closure.id))
      .orderBy(asc(financialMonthlyClosureVersions.version));
  }
}

export const financialMonthCloseRepository =
  new FinancialMonthCloseRepository();
