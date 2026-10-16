import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  positionReconciliationEvents,
  manualPortfolioPositions,
} from "@/infrastructure/database/schema";
import { logger } from "@/infrastructure/logging/logger";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  activeReconciliationLinks,
  latestReconciliationEventsByPair,
  type ReconciliationEvent,
} from "@/backend/services/position-reconciliation";

export class PositionReconciliationRepository {
  async listEvents(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient()
        .select()
        .from(positionReconciliationEvents)
        .where(eq(positionReconciliationEvents.userId, userId))
        .orderBy(
          asc(positionReconciliationEvents.recordedAt),
          asc(positionReconciliationEvents.id),
        );
    } catch (error) {
      logger.error("position_reconciliation_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async reverse(
    manualAssetKey: string,
    effectiveFrom: string,
    requestId: string,
    importedAssetKey?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${manualPortfolioPositions}, ${positionReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const events = await transaction
          .select()
          .from(positionReconciliationEvents)
          .where(
            and(
              eq(positionReconciliationEvents.manualAssetKey, manualAssetKey),
              eq(positionReconciliationEvents.userId, userId),
            ),
          )
          .orderBy(
            desc(positionReconciliationEvents.recordedAt),
            desc(positionReconciliationEvents.id),
          );
        const [activeLink] = activeReconciliationLinks(events, effectiveFrom);
        const latestSeparate = importedAssetKey
          ? latestReconciliationEventsByPair(
              events as ReconciliationEvent[],
            ).get(JSON.stringify([manualAssetKey, importedAssetKey]))
          : null;
        const latest = importedAssetKey ? latestSeparate : activeLink;
        const canReopenSeparate = latest?.status === "SEPARATE";
        if (
          !latest ||
          (importedAssetKey && !canReopenSeparate) ||
          (!importedAssetKey && latest.status !== "LINK")
        ) {
          throw new ApplicationError(
            "Esta decisão não pode ser desfeita porque já foi alterada.",
            409,
          );
        }
        const [event] = await transaction
          .insert(positionReconciliationEvents)
          .values({
            manualAssetKey,
            userId,
            importedAssetKey: latest.importedAssetKey,
            status: "UNLINK",
            effectiveFrom,
            recordedAt: new Date(
              Math.max(Date.now(), new Date(latest.recordedAt).getTime() + 1),
            ),
            requestId,
          })
          .returning();
        return event;
      });
    } catch (error) {
      logger.error("position_reconciliation_reverse_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}

export const positionReconciliationRepository =
  new PositionReconciliationRepository();
