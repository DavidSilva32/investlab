import { and, asc, eq, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  manualPortfolioOperations,
  movementItems,
  portfolioOperationReconciliationEvents,
} from "@/infrastructure/database/schema";
import type { ManualPortfolioOperationInput } from "@/backend/services/portfolio-operation-reconciliation";

const normalizeNumeric = (value: string | null) => {
  if (value === null) return null;
  const [integer = "0", fraction = ""] = value.trim().split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return `${normalizedInteger}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
};

export class PortfolioOperationRepository {
  async list(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const db = getDatabaseClient();
      const [operations, movements, events] = await Promise.all([
        db
          .select()
          .from(manualPortfolioOperations)
          .where(eq(manualPortfolioOperations.userId, userId))
          .orderBy(
            asc(manualPortfolioOperations.effectiveDate),
            asc(manualPortfolioOperations.createdAt),
          ),
        db.select().from(movementItems).where(eq(movementItems.userId, userId)),
        db
          .select()
          .from(portfolioOperationReconciliationEvents)
          .where(eq(portfolioOperationReconciliationEvents.userId, userId))
          .orderBy(asc(portfolioOperationReconciliationEvents.eventOrder)),
      ]);
      return { operations, movements, events };
    } catch (error) {
      logger.error("database_portfolio_operations_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async create(
    input: ManualPortfolioOperationInput,
    idempotencyKey: string,
    requestId?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      const db = getDatabaseClient();
      const [operation] = await db
        .insert(manualPortfolioOperations)
        .values({ ...input, idempotencyKey, userId })
        .onConflictDoNothing({
          target: [
            manualPortfolioOperations.userId,
            manualPortfolioOperations.idempotencyKey,
          ],
        })
        .returning();
      if (operation) return operation;

      const [existing] = await db
        .select()
        .from(manualPortfolioOperations)
        .where(
          and(
            eq(manualPortfolioOperations.idempotencyKey, idempotencyKey),
            eq(manualPortfolioOperations.userId, userId),
          ),
        )
        .limit(1);
      if (!existing)
        throw new Error("Idempotent operation insert returned no row.");
      const samePayload =
        existing.side === input.side &&
        existing.effectiveDate === input.effectiveDate &&
        existing.product === input.product &&
        existing.assetCode === input.assetCode &&
        normalizeNumeric(existing.quantity) ===
          normalizeNumeric(input.quantity) &&
        normalizeNumeric(existing.unitPrice) ===
          normalizeNumeric(input.unitPrice) &&
        existing.currency === input.currency &&
        normalizeNumeric(existing.fees) === normalizeNumeric(input.fees);
      if (!samePayload)
        throw new ApplicationError(
          "Esta chave já foi usada para outra operação. Revise os dados e tente novamente.",
          409,
        );
      return existing;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      logger.error("database_portfolio_operation_create_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async reconcile(
    operationId: string,
    movementId: string,
    action: "LINK" | "UNLINK",
    requestId: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${portfolioOperationReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [operation] = await transaction
          .select({ id: manualPortfolioOperations.id })
          .from(manualPortfolioOperations)
          .where(
            and(
              eq(manualPortfolioOperations.id, operationId),
              eq(manualPortfolioOperations.userId, userId),
            ),
          )
          .limit(1);
        const [movement] = await transaction
          .select({ id: movementItems.id })
          .from(movementItems)
          .where(
            and(
              eq(movementItems.id, movementId),
              eq(movementItems.userId, userId),
            ),
          )
          .limit(1);
        if (!operation || !movement)
          throw new ApplicationError(
            "A operação ou movimentação não está mais disponível.",
            409,
          );
        const events = await transaction
          .select()
          .from(portfolioOperationReconciliationEvents)
          .where(eq(portfolioOperationReconciliationEvents.userId, userId))
          .orderBy(asc(portfolioOperationReconciliationEvents.eventOrder));
        const active = new Map<string, string>();
        const movementOwners = new Map<string, string>();
        for (const event of events) {
          if (event.status === "UNLINK") {
            if (active.get(event.operationId) === event.movementId) {
              active.delete(event.operationId);
              movementOwners.delete(event.movementId);
            }
          } else {
            active.set(event.operationId, event.movementId);
            movementOwners.set(event.movementId, event.operationId);
          }
        }
        if (action === "LINK") {
          const currentMovement = active.get(operationId);
          const currentOwner = movementOwners.get(movementId);
          if (currentMovement === movementId)
            throw new ApplicationError(
              "Essa operação já está vinculada a essa movimentação.",
              409,
            );
          if (currentMovement || currentOwner)
            throw new ApplicationError(
              "Cada operação e movimentação pode ter apenas um vínculo confirmado. Desfaça o vínculo atual antes de criar outro.",
              409,
            );
        } else if (active.get(operationId) !== movementId) {
          throw new ApplicationError("Esse vínculo não está mais ativo.", 409);
        }
        const [event] = await transaction
          .insert(portfolioOperationReconciliationEvents)
          .values({
            operationId,
            movementId,
            status: action,
            requestId,
            userId,
          })
          .returning();
        return event;
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      logger.error("database_portfolio_operation_reconciliation_failed", {
        requestId,
        operationId,
        movementId,
        error,
      });
      throw error;
    }
  }
}

export const portfolioOperationRepository = new PortfolioOperationRepository();
