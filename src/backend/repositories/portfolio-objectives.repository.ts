import { and, eq, inArray } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  portfolioObjectivePositions,
  portfolioObjectives,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

export type ObjectiveAssignmentTransfer = {
  assetKey: string;
  fromObjectiveId: string;
  toObjectiveId: string;
};

export class PortfolioObjectivesRepository {
  async list() {
    const [objectives, assignments] = await Promise.all([
      getDatabaseClient()
        .select()
        .from(portfolioObjectives)
        .orderBy(portfolioObjectives.createdAt),
      this.listAssignments(),
    ]);
    return { objectives, assignments };
  }

  async listAssignments() {
    return getDatabaseClient().select().from(portfolioObjectivePositions);
  }

  async create(input: {
    name: string;
    targetAmount: string | null;
    monthlyPlannedAmount: string | null;
  }) {
    const [objective] = await getDatabaseClient()
      .insert(portfolioObjectives)
      .values({ ...input, kind: "CUSTOM" })
      .returning();
    return objective;
  }

  async update(
    objectiveId: string,
    input: {
      name: string;
      targetAmount: string | null;
      monthlyPlannedAmount: string | null;
    },
  ) {
    const [objective] = await getDatabaseClient()
      .update(portfolioObjectives)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(portfolioObjectives.id, objectiveId))
      .returning();
    return objective ?? null;
  }

  async delete(objectiveId: string) {
    const [objective] = await getDatabaseClient()
      .delete(portfolioObjectives)
      .where(eq(portfolioObjectives.id, objectiveId))
      .returning();
    return objective ?? null;
  }

  async replaceAssignments(objectiveId: string, assetKeys: string[]) {
    return getDatabaseClient().transaction(async (transaction) => {
      await transaction
        .delete(portfolioObjectivePositions)
        .where(eq(portfolioObjectivePositions.objectiveId, objectiveId));
      if (assetKeys.length) {
        await transaction
          .insert(portfolioObjectivePositions)
          .values(assetKeys.map((assetKey) => ({ objectiveId, assetKey })));
      }
    });
  }

  async transferAssignments(
    transaction: DatabaseTransaction,
    transfers: ObjectiveAssignmentTransfer[],
  ) {
    if (transfers.length === 0) return;
    const assetKeys = transfers.map((transfer) => transfer.assetKey);
    if (
      new Set(assetKeys).size !== assetKeys.length ||
      transfers.some(
        (transfer) => transfer.fromObjectiveId === transfer.toObjectiveId,
      )
    ) {
      throw new ApplicationError("Revise as transferências de posições.", 400);
    }
    const assignments = await transaction
      .select()
      .from(portfolioObjectivePositions)
      .where(inArray(portfolioObjectivePositions.assetKey, assetKeys))
      .for("update");
    const assignmentByKey = new Map(
      assignments.map((assignment) => [assignment.assetKey, assignment]),
    );
    for (const transfer of transfers) {
      const assignment =
        assignmentByKey.get(transfer.assetKey) ??
        (
          await transaction
            .select()
            .from(portfolioObjectivePositions)
            .where(eq(portfolioObjectivePositions.assetKey, transfer.assetKey))
            .for("update")
        )[0];
      if (assignment?.objectiveId !== transfer.fromObjectiveId) {
        const [currentObjective] = assignment
          ? await transaction
              .select({ name: portfolioObjectives.name })
              .from(portfolioObjectives)
              .where(eq(portfolioObjectives.id, assignment.objectiveId))
              .limit(1)
          : [];
        throw new ApplicationError(
          currentObjective
            ? `A posição mudou desde a busca e agora está vinculada a ${currentObjective.name}. Atualize os objetivos e tente novamente.`
            : "A posição mudou desde a busca e está sem destino. Atualize os objetivos e tente novamente.",
          409,
        );
      }
      await transaction
        .update(portfolioObjectivePositions)
        .set({ objectiveId: transfer.toObjectiveId, assignedAt: new Date() })
        .where(
          and(
            eq(portfolioObjectivePositions.assetKey, transfer.assetKey),
            eq(
              portfolioObjectivePositions.objectiveId,
              transfer.fromObjectiveId,
            ),
          ),
        );
    }
  }

  async findAssignment(assetKey: string) {
    const [assignment] = await getDatabaseClient()
      .select()
      .from(portfolioObjectivePositions)
      .where(eq(portfolioObjectivePositions.assetKey, assetKey))
      .limit(1);
    if (!assignment) return null;
    const objective = await this.getObjective(assignment.objectiveId);
    return { ...assignment, objectiveName: objective?.name ?? null };
  }

  async getObjective(objectiveId: string) {
    const [objective] = await getDatabaseClient()
      .select()
      .from(portfolioObjectives)
      .where(eq(portfolioObjectives.id, objectiveId))
      .limit(1);
    return objective ?? null;
  }

  async listReserveAssignments() {
    const assignments = await this.listAssignments();
    return assignments
      .filter((assignment) => assignment.objectiveId === reserveObjectiveId)
      .map((assignment) => assignment.assetKey);
  }

  async replaceReserveAssignments(assetKeys: string[]) {
    return this.replaceAssignments(reserveObjectiveId, assetKeys);
  }
}

export const portfolioObjectivesRepository =
  new PortfolioObjectivesRepository();
