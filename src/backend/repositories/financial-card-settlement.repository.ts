import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";
import type { FinancialCardSettlementResolution } from "@/backend/schemas/financial-card-settlement.schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialCategories,
  financialCardSettlementLinks,
  financialEntries,
} from "@/infrastructure/database/schema";

export class FinancialCardSettlementRepository {
  async listReview() {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    const [settlements, cardEntries] = await Promise.all([
      database
        .select({
          id: financialEntries.id,
          description: financialEntries.description,
          actualDate: financialEntries.actualDate,
          actualAmount: financialEntries.actualAmount,
        })
        .from(financialEntries)
        .innerJoin(
          financialCategories,
          eq(financialCategories.id, financialEntries.categoryId),
        )
        .where(
          and(
            eq(financialEntries.userId, userId),
            inArray(financialEntries.channel, ["ACCOUNT", "MANUAL"]),
            eq(financialEntries.kind, "EXPENSE"),
            or(
              eq(financialEntries.cardSettlementStatus, "AGGREGATE"),
              and(
                eq(financialEntries.channel, "MANUAL"),
                eq(financialCategories.name, "Fatura do cartão"),
                isNull(financialEntries.cardSettlementStatus),
              ),
            ),
          ),
        )
        .orderBy(asc(financialEntries.actualDate)),
      database
        .select({
          id: financialEntries.id,
          description: financialEntries.description,
          actualDate: financialEntries.actualDate,
          actualAmount: financialEntries.actualAmount,
          sourceCategory: financialEntries.sourceCategory,
        })
        .from(financialEntries)
        .leftJoin(
          financialCardSettlementLinks,
          and(
            eq(financialCardSettlementLinks.userId, userId),
            eq(financialCardSettlementLinks.cardEntryId, financialEntries.id),
          ),
        )
        .where(
          and(
            eq(financialEntries.userId, userId),
            eq(financialEntries.channel, "CARD"),
            eq(financialEntries.kind, "EXPENSE"),
            isNotNull(financialEntries.actualDate),
            isNull(financialCardSettlementLinks.id),
          ),
        )
        .orderBy(asc(financialEntries.actualDate)),
    ]);
    return { settlements, cardEntries };
  }

  async resolve(input: FinancialCardSettlementResolution) {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      const [settlement] = await transaction
        .select({
          actualDate: financialEntries.actualDate,
          actualAmount: financialEntries.actualAmount,
        })
        .from(financialEntries)
        .innerJoin(
          financialCategories,
          eq(financialCategories.id, financialEntries.categoryId),
        )
        .where(
          and(
            eq(financialEntries.id, input.settlementEntryId),
            eq(financialEntries.userId, userId),
            inArray(financialEntries.channel, ["ACCOUNT", "MANUAL"]),
            eq(financialEntries.kind, "EXPENSE"),
            or(
              eq(financialEntries.cardSettlementStatus, "AGGREGATE"),
              and(
                eq(financialEntries.channel, "MANUAL"),
                eq(financialCategories.name, "Fatura do cartão"),
                isNull(financialEntries.cardSettlementStatus),
              ),
            ),
          ),
        )
        .for("update")
        .limit(1);
      if (!settlement) {
        throw new ApplicationError(
          "Este pagamento não está mais aguardando conferência.",
          409,
        );
      }

      const cardEntries = input.cardEntryIds.length
        ? await transaction
            .select({
              id: financialEntries.id,
              actualDate: financialEntries.actualDate,
              actualAmount: financialEntries.actualAmount,
            })
            .from(financialEntries)
            .where(
              and(
                eq(financialEntries.userId, userId),
                inArray(financialEntries.id, input.cardEntryIds),
                eq(financialEntries.channel, "CARD"),
                eq(financialEntries.kind, "EXPENSE"),
                isNotNull(financialEntries.actualDate),
              ),
            )
            .for("update")
        : [];
      if (cardEntries.length !== input.cardEntryIds.length) {
        throw new ApplicationError(
          "Uma ou mais compras não estão disponíveis para vincular.",
          409,
        );
      }

      if (input.resolution === "LINKED") {
        const targetCents = amountToCents(settlement.actualAmount);
        const selectedCents = cardEntries.reduce(
          /* v8 ignore next -- persisted CARD entries require positive amount and date by database constraint. */
          (total, entry) => total + (amountToCents(entry.actualAmount) ?? 0n),
          0n,
        );
        if (targetCents === null || selectedCents !== targetCents) {
          throw new ApplicationError(
            "O total das compras selecionadas precisa ser igual ao pagamento da fatura.",
            400,
          );
        }
      }

      const months = [
        settlement.actualDate?.slice(0, 7),
        ...cardEntries.map((entry) => entry.actualDate?.slice(0, 7)),
      ].filter((month): month is string => Boolean(month));
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        months,
      );

      if (input.resolution === "LINKED") {
        const existingLinks = await transaction
          .select({ cardEntryId: financialCardSettlementLinks.cardEntryId })
          .from(financialCardSettlementLinks)
          .where(
            and(
              eq(financialCardSettlementLinks.userId, userId),
              inArray(
                financialCardSettlementLinks.cardEntryId,
                input.cardEntryIds,
              ),
            ),
          );
        if (existingLinks.length > 0) {
          throw new ApplicationError(
            "Uma ou mais compras já estão vinculadas a outra fatura.",
            409,
          );
        }
        await transaction.insert(financialCardSettlementLinks).values(
          cardEntries.map((entry) => ({
            userId,
            settlementEntryId: input.settlementEntryId,
            cardEntryId: entry.id,
          })),
        );
      }
      const nextStatus =
        input.resolution === "LINKED" ? "LINKED" : "NOT_RELATED";
      await transaction
        .update(financialEntries)
        .set({ cardSettlementStatus: nextStatus, updatedAt: new Date() })
        .where(
          and(
            eq(financialEntries.id, input.settlementEntryId),
            eq(financialEntries.userId, userId),
          ),
        );
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [
          settlement.actualDate,
          ...cardEntries.map((entry) => entry.actualDate),
        ],
      );
      return { resolution: input.resolution };
    });
  }
}

function amountToCents(value: string | null | undefined) {
  /* v8 ignore next -- persisted settlement and CARD values are non-null by query and schema constraints. */
  if (value === null || value === undefined) return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  /* v8 ignore next -- database constraints prohibit negative realized amounts. */
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0"));
  return sign * (whole * 100n + fraction);
}

export const financialCardSettlementRepository =
  new FinancialCardSettlementRepository();
