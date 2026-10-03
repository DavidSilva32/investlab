import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { stockOpportunityAnalysisSettings } from "@/infrastructure/database/schema";

const settingsId = 1;

export class StockOpportunityAnalysisSettingsRepository {
  async get() {
    const [settings] = await getDatabaseClient()
      .select()
      .from(stockOpportunityAnalysisSettings)
      .where(eq(stockOpportunityAnalysisSettings.id, settingsId))
      .limit(1);
    return (
      settings ?? { id: settingsId, bazinTargetYield: "6", updatedAt: null }
    );
  }

  async saveBazinTargetYield(value: number) {
    const [settings] = await getDatabaseClient()
      .insert(stockOpportunityAnalysisSettings)
      .values({ id: settingsId, bazinTargetYield: value.toFixed(4) })
      .onConflictDoUpdate({
        target: stockOpportunityAnalysisSettings.id,
        set: { bazinTargetYield: value.toFixed(4), updatedAt: new Date() },
      })
      .returning();
    return settings;
  }
}

export const stockOpportunityAnalysisSettingsRepository =
  new StockOpportunityAnalysisSettingsRepository();
