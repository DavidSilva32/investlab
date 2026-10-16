import { and, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { stockOpportunityAnalysisSettings } from "@/infrastructure/database/schema";

export class StockOpportunityAnalysisSettingsRepository {
  async get() {
    const userId = requireDataOwnerId();
    const [settings] = await getDatabaseClient()
      .select()
      .from(stockOpportunityAnalysisSettings)
      .where(
        and(
          eq(stockOpportunityAnalysisSettings.userId, userId),
          eq(stockOpportunityAnalysisSettings.id, userId),
        ),
      )
      .limit(1);
    return settings ?? { id: userId, bazinTargetYield: "6", updatedAt: null };
  }

  async saveBazinTargetYield(value: number) {
    const userId = requireDataOwnerId();
    const [settings] = await getDatabaseClient()
      .insert(stockOpportunityAnalysisSettings)
      .values({ userId, id: userId, bazinTargetYield: value.toFixed(4) })
      .onConflictDoUpdate({
        target: [
          stockOpportunityAnalysisSettings.userId,
          stockOpportunityAnalysisSettings.id,
        ],
        set: { bazinTargetYield: value.toFixed(4), updatedAt: new Date() },
      })
      .returning();
    return settings;
  }
}

export const stockOpportunityAnalysisSettingsRepository =
  new StockOpportunityAnalysisSettingsRepository();
