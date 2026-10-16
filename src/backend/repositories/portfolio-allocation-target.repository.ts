import { and, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { logger } from "@/infrastructure/logging/logger";
import { portfolioAllocationTargets } from "@/infrastructure/database/schema";

export class PortfolioAllocationTargetRepository {
  async get(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const [settings] = await getDatabaseClient()
        .select()
        .from(portfolioAllocationTargets)
        .where(
          and(
            eq(portfolioAllocationTargets.id, userId),
            eq(portfolioAllocationTargets.userId, userId),
          ),
        );
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
    const userId = requireDataOwnerId();
    try {
      const [settings] = await getDatabaseClient()
        .insert(portfolioAllocationTargets)
        .values({ id: userId, userId, percentages, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [
            portfolioAllocationTargets.userId,
            portfolioAllocationTargets.id,
          ],
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
