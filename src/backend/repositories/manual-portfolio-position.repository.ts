import { desc, eq, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  manualPortfolioPositionSnapshots,
  manualPortfolioPositions,
  portfolioAssetClassifications,
} from "@/infrastructure/database/schema";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

function saoPauloCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const date = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, part]),
  ) as Record<"year" | "month" | "day", string>;
  return `${date.year}-${date.month}-${date.day}`;
}

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
  private async recordSnapshot(
    transaction: DatabaseTransaction,
    position: typeof manualPortfolioPositions.$inferSelect,
    status: "ACTIVE" | "DELETED",
    recordedAt: Date,
  ) {
    await transaction
      .insert(manualPortfolioPositionSnapshots)
      .values({
        assetKey: position.assetKey,
        product: position.product,
        assetCode: position.assetCode,
        currency: position.currency,
        totalValue: position.totalValue,
        convertedValueBrl: position.convertedValueBrl,
        positionDate: position.positionDate,
        conversionDate: position.conversionDate,
        valueBasis: position.valueBasis,
        status,
        recordedAt,
      })
      .onConflictDoNothing({
        target: [
          manualPortfolioPositionSnapshots.assetKey,
          manualPortfolioPositionSnapshots.recordedAt,
        ],
      });
  }

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

  async listSnapshots(requestId?: string) {
    try {
      return await getDatabaseClient()
        .select()
        .from(manualPortfolioPositionSnapshots)
        .orderBy(
          manualPortfolioPositionSnapshots.recordedAt,
          manualPortfolioPositionSnapshots.assetKey,
        );
    } catch (error) {
      logger.error("manual_portfolio_position_snapshots_query_failed", {
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
      return await getDatabaseClient().transaction(async (transaction) => {
        const [position] = await transaction
          .insert(manualPortfolioPositions)
          .values(input)
          .returning();
        await this.recordSnapshot(
          transaction,
          position,
          "ACTIVE",
          position.createdAt,
        );
        if (classification) {
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
        }
        return position;
      });
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
      return await getDatabaseClient().transaction(async (transaction) => {
        const [previous] = await transaction
          .select()
          .from(manualPortfolioPositions)
          .where(eq(manualPortfolioPositions.id, id))
          .for("update")
          .limit(1);
        if (!previous) return null;
        await this.recordSnapshot(
          transaction,
          previous,
          "ACTIVE",
          previous.updatedAt,
        );
        const updatedAt = new Date(
          Math.max(Date.now(), previous.updatedAt.getTime() + 1),
        );
        const [position] = await transaction
          .update(manualPortfolioPositions)
          .set({ ...input, updatedAt })
          .where(eq(manualPortfolioPositions.id, id))
          .returning();
        if (!position) return null;
        await this.recordSnapshot(
          transaction,
          position,
          "ACTIVE",
          position.updatedAt,
        );
        if (classification) {
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
        }
        return position;
      });
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
      return await getDatabaseClient().transaction(async (transaction) => {
        const [position] = await transaction
          .select()
          .from(manualPortfolioPositions)
          .where(eq(manualPortfolioPositions.id, id))
          .for("update")
          .limit(1);
        if (!position) return null;
        await this.recordSnapshot(
          transaction,
          position,
          "ACTIVE",
          position.updatedAt,
        );
        const recordedAt = new Date(
          Math.max(Date.now(), position.updatedAt.getTime() + 1),
        );
        await this.recordSnapshot(
          transaction,
          {
            ...position,
            positionDate: saoPauloCalendarDate(recordedAt),
          },
          "DELETED",
          recordedAt,
        );
        const [deleted] = await transaction
          .delete(manualPortfolioPositions)
          .where(eq(manualPortfolioPositions.id, id))
          .returning({ id: manualPortfolioPositions.id });
        return deleted ?? null;
      });
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
