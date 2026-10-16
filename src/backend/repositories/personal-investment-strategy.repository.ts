import { and, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { logger } from "@/infrastructure/logging/logger";
import { personalInvestmentStrategy } from "@/infrastructure/database/schema";
import type { StrategyAllocationPercentages } from "@/lib/strategy-allocation";

export class PersonalInvestmentStrategyRepository {
  async get(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const [record] = await getDatabaseClient()
        .select()
        .from(personalInvestmentStrategy)
        .where(
          and(
            eq(personalInvestmentStrategy.id, userId),
            eq(personalInvestmentStrategy.userId, userId),
          ),
        );
      return record ?? null;
    } catch (error) {
      logger.error("personal_investment_strategy_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async save(
    answers: {
      horizonYears: number;
      internationalInterest: "interested" | "not_interested" | "unsure";
    },
    selectedDirection: "review_horizon" | "consider_international",
    requestId?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      const [record] = await getDatabaseClient()
        .insert(personalInvestmentStrategy)
        .values({
          id: userId,
          userId,
          answers,
          selectedDirection,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            personalInvestmentStrategy.userId,
            personalInvestmentStrategy.id,
          ],
          set: { answers, selectedDirection, updatedAt: new Date() },
        })
        .returning();
      return record;
    } catch (error) {
      logger.error("personal_investment_strategy_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async saveAllocationPercentages(
    allocationPercentages: StrategyAllocationPercentages,
    requestId?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      const [record] = await getDatabaseClient()
        .insert(personalInvestmentStrategy)
        .values({
          id: userId,
          userId,
          allocationPercentages,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            personalInvestmentStrategy.userId,
            personalInvestmentStrategy.id,
          ],
          set: { allocationPercentages, updatedAt: new Date() },
        })
        .returning();
      return record;
    } catch (error) {
      logger.error("personal_investment_strategy_allocation_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async activateAllocation(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const [record] = await getDatabaseClient()
        .insert(personalInvestmentStrategy)
        .values({
          id: userId,
          userId,
          allocationActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            personalInvestmentStrategy.userId,
            personalInvestmentStrategy.id,
          ],
          set: { allocationActive: true, updatedAt: new Date() },
        })
        .returning();
      return record;
    } catch (error) {
      logger.error("personal_investment_strategy_activation_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}

export const personalInvestmentStrategyRepository =
  new PersonalInvestmentStrategyRepository();
