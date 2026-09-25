import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { emergencyReserveSettings } from "@/infrastructure/database/schema";

const singletonId = "default";

export class EmergencyReserveRepository {
  async getSettings() {
    const [settings] = await getDatabaseClient()
      .select()
      .from(emergencyReserveSettings)
      .where(eq(emergencyReserveSettings.id, singletonId))
      .limit(1);
    return settings ?? null;
  }

  async saveSettings(input: {
    monthlyExpenses: string;
    targetMonths: number;
    selectedAssetKeys: string[];
  }) {
    const [settings] = await getDatabaseClient()
      .insert(emergencyReserveSettings)
      .values({ id: singletonId, ...input })
      .onConflictDoUpdate({
        target: emergencyReserveSettings.id,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    return settings;
  }
}

export const emergencyReserveRepository = new EmergencyReserveRepository();
