import { eq, inArray } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { portfolioAssetClassifications } from "@/infrastructure/database/schema";

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

  async upsert(
    input: {
      assetKey: string;
      assetClass: string | null;
      subClass: string | null;
      geography: string | null;
    },
    requestId?: string,
  ) {
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
}

export const portfolioClassificationRepository =
  new PortfolioClassificationRepository();
