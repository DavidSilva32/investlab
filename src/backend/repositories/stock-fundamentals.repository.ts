import { desc, eq } from "drizzle-orm";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { stockFundamentals } from "@/infrastructure/database/schema";

export class StockFundamentalsRepository {
  async listByTicker(ticker: string) {
    return getDatabaseClient()
      .select()
      .from(stockFundamentals)
      .where(eq(stockFundamentals.ticker, ticker))
      .orderBy(desc(stockFundamentals.referenceDate));
  }

  async save(
    ticker: string,
    cnpj: string,
    sourceVersion: string,
    periods: FundamentalPeriod[],
  ) {
    if (!periods.length) return;
    const database = getDatabaseClient();
    await database.transaction(async (transaction) => {
      await transaction
        .delete(stockFundamentals)
        .where(eq(stockFundamentals.ticker, ticker));
      await transaction.insert(stockFundamentals).values(
        periods.map((period) => ({
          ticker,
          cnpj,
          periodType: period.periodType,
          referenceDate: period.referenceDate,
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
    });
  }
}
export const stockFundamentalsRepository = new StockFundamentalsRepository();
