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
    await getDatabaseClient()
      .insert(stockFundamentals)
      .values(
        periods.map((period) => ({
          ticker,
          cnpj,
          ...period,
          sourceDocument: "DFP",
          sourceVersion,
        })),
      );
  }
}
export const stockFundamentalsRepository = new StockFundamentalsRepository();
