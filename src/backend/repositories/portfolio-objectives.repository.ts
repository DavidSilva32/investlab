import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  portfolioObjectivePositions,
  portfolioObjectives,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

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
