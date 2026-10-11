import { asc, desc, eq, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  positionReconciliationEvents,
  manualPortfolioPositions,
} from "@/infrastructure/database/schema";
import { logger } from "@/infrastructure/logging/logger";
import { activeReconciliationLinks } from "@/backend/services/position-reconciliation";

export class PositionReconciliationRepository {
  async listEvents(requestId?: string) {
    try {
      return await getDatabaseClient()
        .select()
        .from(positionReconciliationEvents)
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
  ) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${manualPortfolioPositions}, ${positionReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const events = await transaction
          .select()
          .from(positionReconciliationEvents)
          .where(
            eq(positionReconciliationEvents.manualAssetKey, manualAssetKey),
          )
          .orderBy(
            desc(positionReconciliationEvents.recordedAt),
            desc(positionReconciliationEvents.id),
          );
        const [latest] = activeReconciliationLinks(events, effectiveFrom);
        if (!latest) {
          throw new ApplicationError(
            "Esta posição não possui conciliação ativa.",
            409,
          );
        }
        const [event] = await transaction
          .insert(positionReconciliationEvents)
          .values({
            manualAssetKey,
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
