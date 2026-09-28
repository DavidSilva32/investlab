import { desc, eq, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  manualPortfolioPositions,
  portfolioAssetClassifications,
} from "@/infrastructure/database/schema";

export type ManualPortfolioPositionClassification = {
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
};

export type ManualPortfolioPositionInput = Pick<
  typeof manualPortfolioPositions.$inferInsert,
  | "id"
  | "assetKey"
  | "product"
  | "assetCode"
  | "institution"
  | "quantity"
  | "currency"
  | "unitPrice"
  | "totalValue"
  | "valueBasis"
  | "positionDate"
  | "convertedValueBrl"
  | "conversionDate"
>;

export class ManualPortfolioPositionRepository {
  async list(requestId?: string) {
    try {
      return await getDatabaseClient()
        .select()
        .from(manualPortfolioPositions)
        .orderBy(
          manualPortfolioPositions.product,
          desc(manualPortfolioPositions.updatedAt),
        );
    } catch (error) {
      logger.error("manual_portfolio_positions_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async create(
    input: ManualPortfolioPositionInput,
    requestId?: string,
    classification?: ManualPortfolioPositionClassification,
  ) {
    try {
      if (classification) {
        return await getDatabaseClient().transaction(async (transaction) => {
          const [position] = await transaction
            .insert(manualPortfolioPositions)
            .values(input)
            .returning();
          await transaction
            .insert(portfolioAssetClassifications)
            .values({
              assetKey: input.assetKey,
              ...classification,
            })
            .onConflictDoUpdate({
              target: portfolioAssetClassifications.assetKey,
              set: {
                assetClass: sql.raw('excluded."assetClass"'),
                subClass: sql.raw('excluded."subClass"'),
                geography: sql.raw('excluded."geography"'),
                updatedAt: new Date(),
              },
            });
          return position;
        });
      }
      const [position] = await getDatabaseClient()
        .insert(manualPortfolioPositions)
        .values(input)
        .returning();
      return position;
    } catch (error) {
      logger.error("manual_portfolio_position_create_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async update(
    id: string,
    input: Omit<ManualPortfolioPositionInput, "id" | "assetKey">,
    requestId?: string,
    classification?: ManualPortfolioPositionClassification,
  ) {
    try {
      if (classification) {
        return await getDatabaseClient().transaction(async (transaction) => {
          const [position] = await transaction
            .update(manualPortfolioPositions)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(manualPortfolioPositions.id, id))
            .returning();
          if (!position) return null;
          await transaction
            .insert(portfolioAssetClassifications)
            .values({
              assetKey: position.assetKey,
              ...classification,
            })
            .onConflictDoUpdate({
              target: portfolioAssetClassifications.assetKey,
              set: {
                assetClass: sql.raw('excluded."assetClass"'),
                subClass: sql.raw('excluded."subClass"'),
                geography: sql.raw('excluded."geography"'),
                updatedAt: new Date(),
              },
            });
          return position;
        });
      }
      const [position] = await getDatabaseClient()
        .update(manualPortfolioPositions)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(manualPortfolioPositions.id, id))
        .returning();
      return position ?? null;
    } catch (error) {
      logger.error("manual_portfolio_position_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async delete(id: string, requestId?: string) {
    try {
      const [position] = await getDatabaseClient()
        .delete(manualPortfolioPositions)
        .where(eq(manualPortfolioPositions.id, id))
        .returning({ id: manualPortfolioPositions.id });
      return position ?? null;
    } catch (error) {
      logger.error("manual_portfolio_position_delete_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}

export const manualPortfolioPositionRepository =
  new ManualPortfolioPositionRepository();
