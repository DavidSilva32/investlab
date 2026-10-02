import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { personalInvestmentStrategy } from "@/infrastructure/database/schema";
import type { StrategyAllocationPercentages } from "@/lib/strategy-allocation";

const singletonId = "default";

export class PersonalInvestmentStrategyRepository {
  async get(requestId?: string) {
    try {
      const [record] = await getDatabaseClient()
        .select()
        .from(personalInvestmentStrategy)
        .where(eq(personalInvestmentStrategy.id, singletonId));
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
    try {
      const [record] = await getDatabaseClient()
        .insert(personalInvestmentStrategy)
        .values({
          id: singletonId,
          answers,
          selectedDirection,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: personalInvestmentStrategy.id,
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
    try {
      const [record] = await getDatabaseClient()
        .insert(personalInvestmentStrategy)
        .values({
          id: singletonId,
          allocationPercentages,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: personalInvestmentStrategy.id,
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
}

export const personalInvestmentStrategyRepository =
  new PersonalInvestmentStrategyRepository();
