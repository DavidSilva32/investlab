import { inArray, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { portfolioAssetClassifications } from "@/infrastructure/database/schema";

type ClassificationRecord = {
  assetKey: string;
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
};

export class PortfolioClassificationRepository {
  async listByAssetKeys(assetKeys: string[], requestId?: string) {
    if (!assetKeys.length) return [];
    try {
      return await getDatabaseClient()
        .select()
        .from(portfolioAssetClassifications)
        .where(inArray(portfolioAssetClassifications.assetKey, assetKeys));
    } catch (error) {
      logger.error("portfolio_classifications_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async upsert(input: ClassificationRecord, requestId?: string) {
    try {
      const [classification] = await getDatabaseClient()
        .insert(portfolioAssetClassifications)
        .values(input)
        .onConflictDoUpdate({
          target: portfolioAssetClassifications.assetKey,
          set: {
            assetClass: input.assetClass,
            subClass: input.subClass,
            geography: input.geography,
            updatedAt: new Date(),
          },
        })
        .returning();
      return classification;
    } catch (error) {
      logger.error("portfolio_classification_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async upsertMany(inputs: ClassificationRecord[], requestId?: string) {
    const uniqueInputs = [
      ...new Map(inputs.map((input) => [input.assetKey, input])).values(),
    ];
    if (uniqueInputs.length === 0) return [];
    try {
      return await getDatabaseClient().transaction(async (transaction) =>
        transaction
          .insert(portfolioAssetClassifications)
          .values(uniqueInputs)
          .onConflictDoUpdate({
            target: portfolioAssetClassifications.assetKey,
            set: {
              assetClass: sql`excluded."assetClass"`,
              subClass: sql`excluded."subClass"`,
              geography: sql`excluded.geography`,
              updatedAt: new Date(),
            },
          })
          .returning(),
      );
    } catch (error) {
      logger.error("portfolio_classification_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}

export const portfolioClassificationRepository =
  new PortfolioClassificationRepository();
