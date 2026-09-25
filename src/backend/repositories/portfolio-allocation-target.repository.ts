import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { portfolioAllocationTargets } from "@/infrastructure/database/schema";

const singletonId = "default";

export class PortfolioAllocationTargetRepository {
  async get(requestId?: string) {
    try {
      const [settings] = await getDatabaseClient()
        .select()
        .from(portfolioAllocationTargets)
        .where(eq(portfolioAllocationTargets.id, singletonId));
      return settings?.percentages ?? {};
    } catch (error) {
      logger.error("portfolio_allocation_targets_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async save(percentages: Record<string, number>, requestId?: string) {
    try {
      const [settings] = await getDatabaseClient()
        .insert(portfolioAllocationTargets)
        .values({ id: singletonId, percentages, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: portfolioAllocationTargets.id,
          set: { percentages, updatedAt: new Date() },
        })
        .returning();
      return settings.percentages;
    } catch (error) {
      logger.error("portfolio_allocation_targets_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}

export const portfolioAllocationTargetRepository =
  new PortfolioAllocationTargetRepository();
