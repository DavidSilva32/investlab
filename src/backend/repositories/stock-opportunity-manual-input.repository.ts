import { and, eq, inArray } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { stockOpportunityManualInputs } from "@/infrastructure/database/schema";

export type StockOpportunityInputKey =
  "graham_eps" | "graham_book_value_per_share" | "bazin_dividend_per_share";

export type StockOpportunityManualInput = {
  ticker: string;
  inputKey: StockOpportunityInputKey;
  value: number;
  source: string;
  asOf: string;
};

export class StockOpportunityManualInputRepository {
  async listByTickers(tickers: string[]) {
    const userId = requireDataOwnerId();
    if (!tickers.length) return [];
    return getDatabaseClient()
      .select()
      .from(stockOpportunityManualInputs)
      .where(
        and(
          eq(stockOpportunityManualInputs.userId, userId),
          inArray(stockOpportunityManualInputs.ticker, tickers),
        ),
      );
  }

  async listByTicker(ticker: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(stockOpportunityManualInputs)
      .where(
        and(
          eq(stockOpportunityManualInputs.userId, userId),
          eq(stockOpportunityManualInputs.ticker, ticker),
        ),
      );
  }

  async upsert(input: StockOpportunityManualInput) {
    const userId = requireDataOwnerId();
    const [saved] = await getDatabaseClient()
      .insert(stockOpportunityManualInputs)
      .values({
        ...input,
        userId,
        value: input.value.toFixed(8),
      })
      .onConflictDoUpdate({
        target: [
          stockOpportunityManualInputs.userId,
          stockOpportunityManualInputs.ticker,
          stockOpportunityManualInputs.inputKey,
        ],
        set: {
          value: input.value.toFixed(8),
          source: input.source,
          asOf: input.asOf,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async delete(ticker: string, inputKey: StockOpportunityInputKey) {
    const userId = requireDataOwnerId();
    const [deleted] = await getDatabaseClient()
      .delete(stockOpportunityManualInputs)
      .where(
        and(
          eq(stockOpportunityManualInputs.userId, userId),
          eq(stockOpportunityManualInputs.ticker, ticker),
          eq(stockOpportunityManualInputs.inputKey, inputKey),
        ),
      )
      .returning({ id: stockOpportunityManualInputs.id });
    return deleted ?? null;
  }
}

export const stockOpportunityManualInputRepository =
  new StockOpportunityManualInputRepository();
