import { and, eq, inArray, notInArray } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  portfolioObjectivesRepository,
  type ObjectiveAssignmentTransfer,
} from "@/backend/repositories/portfolio-objectives.repository";
import {
  emergencyReserveSettings,
  portfolioObjectivePositions,
  portfolioObjectives,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

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
    const selectedAssetKeys =
      await portfolioObjectivesRepository.listReserveAssignments();
    if (!settings && selectedAssetKeys.length === 0) return null;
    return {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
      selectedAssetKeys,
    };
  }

  async saveSettings(input: { monthlyExpenses: string; targetMonths: number }) {
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

  async saveAssignments(input: {
    selectedAssetKeys: string[];
    transfers?: ObjectiveAssignmentTransfer[];
  }) {
    const userId = requireDataOwnerId();
    const transfers = input.transfers ?? [];
    if (
      transfers.some(
        (transfer) =>
          !input.selectedAssetKeys.includes(transfer.assetKey) ||
          transfer.toObjectiveId !== reserveObjectiveId,
      )
    ) {
      throw new ApplicationError("Revise as transferências da Reserva.", 400);
    }
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const selectedKeys = input.selectedAssetKeys;
        if (selectedKeys.length) {
          await transaction
            .delete(portfolioObjectivePositions)
            .where(
              and(
                eq(portfolioObjectivePositions.objectiveId, reserveObjectiveId),
                eq(portfolioObjectivePositions.userId, userId),
                notInArray(portfolioObjectivePositions.assetKey, selectedKeys),
              ),
            );
        } else {
          await transaction
            .delete(portfolioObjectivePositions)
            .where(
              and(
                eq(portfolioObjectivePositions.objectiveId, reserveObjectiveId),
                eq(portfolioObjectivePositions.userId, userId),
              ),
            );
        }
        await portfolioObjectivesRepository.transferAssignments(
          transaction,
          transfers,
        );
        if (selectedKeys.length) {
          const assignments = await transaction
            .select()
            .from(portfolioObjectivePositions)
            .where(
              and(
                inArray(portfolioObjectivePositions.assetKey, selectedKeys),
                eq(portfolioObjectivePositions.userId, userId),
              ),
            )
            .for("update");
          const assignedByKey = new Map(
            assignments.map((assignment) => [
              assignment.assetKey,
              assignment.objectiveId,
            ]),
          );
          const conflict = assignments.find(
            (assignment) => assignment.objectiveId !== reserveObjectiveId,
          );
          if (conflict) {
            const [currentObjective] = await transaction
              .select({ name: portfolioObjectives.name })
              .from(portfolioObjectives)
              .where(
                and(
                  eq(portfolioObjectives.id, conflict.objectiveId),
                  eq(portfolioObjectives.userId, userId),
                ),
              )
              .limit(1);
            throw new ApplicationError(
              currentObjective?.name
                ? `A posição já está vinculada a ${currentObjective.name}. Atualize os objetivos e tente novamente.`
                : "A posição já está vinculada a outro objetivo. Atualize os objetivos e tente novamente.",
              409,
            );
          }
          const unassigned = selectedKeys.filter(
            (assetKey) => !assignedByKey.has(assetKey),
          );
          if (unassigned.length) {
            await transaction.insert(portfolioObjectivePositions).values(
              unassigned.map((assetKey) => ({
                objectiveId: reserveObjectiveId,
                userId,
                assetKey,
              })),
            );
          }
        }
        return { selectedAssetKeys: input.selectedAssetKeys };
      });
    } catch (error) {
      const postgresError = error as { code?: string; constraint?: string };
      if (
        postgresError.code === "23505" &&
        postgresError.constraint ===
          "portfolio_objective_positions_user_asset_uidx"
      ) {
        const current = await Promise.all(
          input.selectedAssetKeys.map((assetKey) =>
            portfolioObjectivesRepository.findAssignment(assetKey),
          ),
        );
        const currentObjective = current.find(
          (assignment) =>
            assignment && assignment.objectiveId !== reserveObjectiveId,
        );
        const currentAssignment = current.find((assignment) => assignment);
        const reserveAlreadyOwnsPosition = current.some(
          (assignment) => assignment?.objectiveId === reserveObjectiveId,
        );
        throw new ApplicationError(
          currentObjective?.objectiveName
            ? `Uma posição foi vinculada a ${currentObjective.objectiveName} enquanto você confirmava a transferência. Atualize os objetivos e tente novamente.`
            : reserveAlreadyOwnsPosition
              ? "Uma posição já foi atribuída à Reserva durante esta atualização. Atualize os objetivos e tente novamente."
              : currentAssignment
                ? "Uma posição foi vinculada a outro objetivo durante esta atualização. Atualize os objetivos e tente novamente."
                : "Uma posição mudou enquanto você confirmava a transferência e não está mais atribuída. Atualize os objetivos e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }
}

export const emergencyReserveRepository = new EmergencyReserveRepository();
