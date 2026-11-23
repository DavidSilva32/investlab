import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ApplicationError } from "@/backend/errors/application-error";
import type { FinancialEntryRelationInput } from "@/backend/schemas/financial-entry-relation.schema";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  financialEntries,
  financialEntryRelations,
} from "@/infrastructure/database/schema";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";

function cents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

export class FinancialEntryRelationsRepository {
  async listForEntries(entryIds: string[]) {
    if (!entryIds.length) return [];
    const userId = requireDataOwnerId();
    const relatedEntry = alias(financialEntries, "related_financial_entry");
    return getDatabaseClient()
      .select({
        id: financialEntryRelations.id,
        kind: financialEntryRelations.kind,
        entryId: financialEntryRelations.entryId,
        relatedEntryId: financialEntryRelations.relatedEntryId,
        entryKind: financialEntries.kind,
        entryAmount: financialEntries.actualAmount,
        entryDate: financialEntries.actualDate,
        relatedKind: relatedEntry.kind,
        relatedAmount: relatedEntry.actualAmount,
        relatedDate: relatedEntry.actualDate,
      })
      .from(financialEntryRelations)
      .innerJoin(
        financialEntries,
        and(
          eq(financialEntries.id, financialEntryRelations.entryId),
          eq(financialEntries.userId, userId),
        ),
      )
      .innerJoin(
        relatedEntry,
        and(
          eq(relatedEntry.id, financialEntryRelations.relatedEntryId),
          eq(relatedEntry.userId, userId),
        ),
      )
      .where(
        and(
          eq(financialEntryRelations.userId, userId),
          or(
            inArray(financialEntryRelations.entryId, entryIds),
            inArray(financialEntryRelations.relatedEntryId, entryIds),
          ),
        ),
      );
  }

  async create(input: FinancialEntryRelationInput) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      if (input.kind === "REVERSAL_DISMISSED") {
        const [entry] = await transaction
          .select()
          .from(financialEntries)
          .where(
            and(
              eq(financialEntries.userId, userId),
              eq(financialEntries.id, input.entryId),
            ),
          );
        if (!entry)
          throw new ApplicationError("Lançamento não encontrado.", 404);
        if (
          entry.kind !== "INCOME" ||
          entry.channel !== "ACCOUNT" ||
          entry.reviewStatus !== "REVERSAL_PENDING" ||
          !entry.actualDate
        ) {
          throw new ApplicationError(
            "Este lançamento não está aguardando revisão como estorno.",
            409,
          );
        }
        await financialMonthCloseRepository.acquireMonthLocks(
          transaction,
          userId,
          [entry.actualDate.slice(0, 7)],
        );
        await transaction
          .update(financialEntries)
          .set({ reviewStatus: "REVERSAL_DISMISSED", updatedAt: new Date() })
          .where(
            and(
              eq(financialEntries.userId, userId),
              eq(financialEntries.id, input.entryId),
            ),
          );
        await financialMonthCloseRepository.markDatesForReview(
          transaction,
          userId,
          [entry.actualDate],
        );
        return { id: entry.id, kind: input.kind };
      }
      const entries = await transaction
        .select()
        .from(financialEntries)
        .where(
          and(
            eq(financialEntries.userId, userId),
            inArray(financialEntries.id, [input.entryId, input.relatedEntryId]),
          ),
        );
      const entry = entries.find((candidate) => candidate.id === input.entryId);
      const related = entries.find(
        (candidate) => candidate.id === input.relatedEntryId,
      );
      if (!entry || !related)
        throw new ApplicationError(
          "Não foi possível localizar os lançamentos.",
          404,
        );
      if (
        !entry.actualAmount ||
        !related.actualAmount ||
        !entry.actualDate ||
        !related.actualDate
      ) {
        throw new ApplicationError(
          "Só é possível relacionar lançamentos realizados.",
          400,
        );
      }

      const previousLinks = await transaction
        .select({
          id: financialEntryRelations.id,
          kind: financialEntryRelations.kind,
          entryId: financialEntryRelations.entryId,
          relatedEntryId: financialEntryRelations.relatedEntryId,
        })
        .from(financialEntryRelations)
        .where(eq(financialEntryRelations.userId, userId));

      if (input.kind === "TRANSFER") {
        if (
          entry.kind !== "EXPENSE" ||
          related.kind !== "INCOME" ||
          related.reviewStatus === "REVERSAL_PENDING" ||
          entry.channel !== "ACCOUNT" ||
          related.channel !== "ACCOUNT" ||
          cents(entry.actualAmount) !== cents(related.actualAmount) ||
          !entry.accountAlias ||
          !related.accountAlias ||
          entry.accountAlias.trim().toLocaleLowerCase("pt-BR") ===
            related.accountAlias.trim().toLocaleLowerCase("pt-BR")
        ) {
          throw new ApplicationError(
            "Confirme uma saída e uma entrada de mesmo valor entre contas identificadas diferentes.",
            400,
          );
        }
        const used = previousLinks.some(
          (link) =>
            (link.kind === "TRANSFER" || link.kind === "REVERSAL") &&
            [link.entryId, link.relatedEntryId].some((id) =>
              [input.entryId, input.relatedEntryId].includes(id),
            ),
        );
        if (used)
          throw new ApplicationError(
            "Um destes lançamentos já está vinculado a uma transferência.",
            409,
          );
      } else {
        if (
          entry.kind !== "INCOME" ||
          entry.channel !== "ACCOUNT" ||
          entry.reviewStatus !== "REVERSAL_PENDING" ||
          related.kind !== "EXPENSE" ||
          related.channel === "CARD" ||
          related.actualDate > entry.actualDate
        ) {
          throw new ApplicationError(
            "Vincule um estorno pendente a uma despesa realizada.",
            400,
          );
        }
        if (
          previousLinks.some(
            (link) =>
              link.kind === "REVERSAL" && link.entryId === input.entryId,
          )
        ) {
          throw new ApplicationError(
            "Este estorno já está vinculado a uma despesa.",
            409,
          );
        }
        if (
          previousLinks.some(
            (link) =>
              link.kind === "TRANSFER" &&
              [link.entryId, link.relatedEntryId].includes(
                input.relatedEntryId,
              ),
          )
        ) {
          throw new ApplicationError(
            "Não é possível relacionar um estorno a uma transferência já confirmada.",
            409,
          );
        }
        if (
          previousLinks.some(
            (link) =>
              link.kind === "TRANSFER" &&
              [link.entryId, link.relatedEntryId].includes(input.entryId),
          )
        ) {
          throw new ApplicationError(
            "Não é possível relacionar um estorno a uma transferência já confirmada.",
            409,
          );
        }
        const previouslyReversed = previousLinks
          .filter(
            (link) =>
              link.kind === "REVERSAL" &&
              link.relatedEntryId === input.relatedEntryId,
          )
          .map((link) => link.entryId);
        const previousAmounts = previouslyReversed.length
          ? await transaction
              .select({ actualAmount: financialEntries.actualAmount })
              .from(financialEntries)
              .where(
                and(
                  eq(financialEntries.userId, userId),
                  inArray(financialEntries.id, previouslyReversed),
                ),
              )
          : [];
        const totalReversed = previousAmounts.reduce(
          (total, item) => total + cents(item.actualAmount ?? "0"),
          0n,
        );
        if (
          totalReversed + cents(entry.actualAmount) >
          cents(related.actualAmount)
        ) {
          throw new ApplicationError(
            "O total dos estornos não pode superar o valor da despesa.",
            400,
          );
        }
      }

      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        [entry.actualDate.slice(0, 7), related.actualDate.slice(0, 7)],
      );
      const [relation] = await transaction
        .insert(financialEntryRelations)
        .values({
          userId,
          kind: input.kind,
          entryId: input.entryId,
          relatedEntryId: input.relatedEntryId,
        })
        .returning({ id: financialEntryRelations.id });
      if (input.kind === "REVERSAL") {
        await transaction
          .update(financialEntries)
          .set({ reviewStatus: "NONE", updatedAt: new Date() })
          .where(
            and(
              eq(financialEntries.id, input.entryId),
              eq(financialEntries.userId, userId),
            ),
          );
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [entry.actualDate, related.actualDate],
      );
      return { ...relation, kind: input.kind };
    });
  }
}

export const financialEntryRelationsRepository =
  new FinancialEntryRelationsRepository();
