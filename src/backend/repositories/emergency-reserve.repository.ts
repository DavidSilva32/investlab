import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import {
  emergencyReserveSettings,
  portfolioObjectivePositions,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const singletonId = "default";

export class EmergencyReserveRepository {
  async getSettings() {
    const [settings] = await getDatabaseClient()
      .select()
      .from(emergencyReserveSettings)
      .where(eq(emergencyReserveSettings.id, singletonId))
      .limit(1);
    const selectedAssetKeys =
      await portfolioObjectivesRepository.listReserveAssignments();
    if (!settings && selectedAssetKeys.length === 0) return null;
    return {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
      selectedAssetKeys,
    };
  }

  async saveSettings(input: {
    monthlyExpenses: string;
    targetMonths: number;
    selectedAssetKeys: string[];
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      const [settings] = await transaction
        .insert(emergencyReserveSettings)
        .values({
          id: singletonId,
          monthlyExpenses: input.monthlyExpenses,
          targetMonths: input.targetMonths,
        })
        .onConflictDoUpdate({
          target: emergencyReserveSettings.id,
          set: {
            monthlyExpenses: input.monthlyExpenses,
            targetMonths: input.targetMonths,
            updatedAt: new Date(),
          },
        })
        .returning();
      await transaction
        .delete(portfolioObjectivePositions)
        .where(eq(portfolioObjectivePositions.objectiveId, reserveObjectiveId));
      if (input.selectedAssetKeys.length) {
        await transaction.insert(portfolioObjectivePositions).values(
          input.selectedAssetKeys.map((assetKey) => ({
            objectiveId: reserveObjectiveId,
            assetKey,
          })),
        );
      }
      return { ...settings, selectedAssetKeys: input.selectedAssetKeys };
    });
  }
}

export const emergencyReserveRepository = new EmergencyReserveRepository();
