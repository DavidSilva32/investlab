import { and, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { emergencyReserveSettings } from "@/infrastructure/database/schema";

export class EmergencyReserveRepository {
  async getSettings() {
    const userId = requireDataOwnerId();
    const [settings] = await getDatabaseClient()
      .select()
      .from(emergencyReserveSettings)
      .where(
        and(
          eq(emergencyReserveSettings.id, userId),
          eq(emergencyReserveSettings.userId, userId),
        ),
      )
      .limit(1);
    if (!settings) return null;
    return {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
    };
  }

  async saveSettings(input: {
    monthlyExpenses: string;
    targetMonths: number | null;
  }) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .insert(emergencyReserveSettings)
      .values({
        id: userId,
        userId,
        monthlyExpenses: input.monthlyExpenses,
        targetMonths: input.targetMonths,
      })
      .onConflictDoUpdate({
        target: [emergencyReserveSettings.userId, emergencyReserveSettings.id],
        set: {
          monthlyExpenses: input.monthlyExpenses,
          targetMonths: input.targetMonths,
          updatedAt: new Date(),
        },
      })
      .returning();
  }
}

export const emergencyReserveRepository = new EmergencyReserveRepository();
