import { and, eq, inArray, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
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
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient()
        .select()
        .from(portfolioAssetClassifications)
        .where(
          and(
            inArray(portfolioAssetClassifications.assetKey, assetKeys),
            eq(portfolioAssetClassifications.userId, userId),
          ),
        );
    } catch (error) {
      logger.error("portfolio_classifications_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async upsert(input: ClassificationRecord, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const [classification] = await getDatabaseClient()
        .insert(portfolioAssetClassifications)
        .values({ ...input, userId })
        .onConflictDoUpdate({
          target: [
            portfolioAssetClassifications.userId,
            portfolioAssetClassifications.assetKey,
          ],
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
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) =>
        transaction
          .insert(portfolioAssetClassifications)
          .values(uniqueInputs.map((input) => ({ ...input, userId })))
          .onConflictDoUpdate({
            target: [
              portfolioAssetClassifications.userId,
              portfolioAssetClassifications.assetKey,
            ],
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
