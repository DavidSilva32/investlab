import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { ApplicationError } from "@/backend/errors/application-error";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialCategories,
  financialCategoryPreferences,
  financialEntries,
  financialEntryRelations,
  financialRecurrences,
} from "@/infrastructure/database/schema";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";

export type FinancialCategoryRecord = {
  id: string;
  userId: string | null;
  kind: string;
  name: string;
  originalName: string;
  isDefault: boolean;
  active: boolean;
};

export type FinancialEntryInput = {
  kind: string;
  description: string;
  categoryId: string;
  recurrenceId?: string | null;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
};

export type FinancialEntryRecurrenceInput = {
  amount: string;
  categoryId: string;
  description: string;
  essential: boolean;
  firstDueDate: string;
  frequency: string;
  kind: "INCOME" | "EXPENSE";
};

export class FinancialRepository {
  async listCategories(): Promise<FinancialCategoryRecord[]> {
    const userId = requireDataOwnerId();
    const displayName = sql<string>`coalesce(${financialCategoryPreferences.nameOverride}, ${financialCategories.name})`;
    const active = sql<boolean>`coalesce(${financialCategoryPreferences.active}, ${financialCategories.active})`;
    return getDatabaseClient()
      .select({
        id: financialCategories.id,
        userId: financialCategories.userId,
        kind: financialCategories.kind,
        name: displayName,
        originalName: financialCategories.name,
        isDefault: financialCategories.isDefault,
        active,
      })
      .from(financialCategories)
      .leftJoin(
        financialCategoryPreferences,
        and(
          eq(financialCategoryPreferences.categoryId, financialCategories.id),
          eq(financialCategoryPreferences.userId, userId),
        ),
      )
      .where(
        or(
          isNull(financialCategories.userId),
          eq(financialCategories.userId, userId),
        ),
      )
      .orderBy(asc(financialCategories.kind), asc(displayName));
  }

  async listEntries(startDate: string, endDate: string) {
    const userId = requireDataOwnerId();
    const categoryName = sql<string>`coalesce(${financialCategoryPreferences.nameOverride}, ${financialCategories.name})`;
    return getDatabaseClient()
      .select({
        id: financialEntries.id,
        userId: financialEntries.userId,
        kind: financialEntries.kind,
        description: financialEntries.description,
        categoryId: financialEntries.categoryId,
        recurrenceId: financialEntries.recurrenceId,
        channel: financialEntries.channel,
        accountAlias: financialEntries.accountAlias,
        reviewStatus: financialEntries.reviewStatus,
        sourceCategory: financialEntries.sourceCategory,
        cardSettlementStatus: financialEntries.cardSettlementStatus,
        categoryName,
        expectedAmount: financialEntries.expectedAmount,
        expectedDate: financialEntries.expectedDate,
        actualAmount: financialEntries.actualAmount,
        actualDate: financialEntries.actualDate,
        createdAt: financialEntries.createdAt,
        updatedAt: financialEntries.updatedAt,
      })
      .from(financialEntries)
      .innerJoin(
        financialCategories,
        eq(financialCategories.id, financialEntries.categoryId),
      )
      .leftJoin(
        financialCategoryPreferences,
        and(
          eq(financialCategoryPreferences.categoryId, financialCategories.id),
          eq(financialCategoryPreferences.userId, userId),
        ),
      )
      .where(
        and(
          eq(financialEntries.userId, userId),
          ne(financialEntries.channel, "CARD"),
          or(
            and(
              gte(financialEntries.expectedDate, startDate),
              lte(financialEntries.expectedDate, endDate),
            ),
            and(
              gte(financialEntries.actualDate, startDate),
              lte(financialEntries.actualDate, endDate),
            ),
          ),
        ),
      )
      .orderBy(
        asc(financialEntries.expectedDate),
        asc(financialEntries.actualDate),
      );
  }

  async findCategory(id: string) {
    const categories = await this.listCategories();
    return categories.find((category) => category.id === id) ?? null;
  }

  async findEntry(id: string) {
    const userId = requireDataOwnerId();
    const [entry] = await getDatabaseClient()
      .select()
      .from(financialEntries)
      .where(
        and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
      )
      .limit(1);
    return entry ?? null;
  }

  async createEntry(input: FinancialEntryInput) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        [input.expectedDate, input.actualDate]
          .filter((date): date is string => Boolean(date))
          .map((date) => date.slice(0, 7)),
      );
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [input.expectedDate, input.actualDate],
      );
      const [entry] = await transaction
        .insert(financialEntries)
        .values({ ...input, userId })
        .returning();
      return entry;
    });
  }

  async updateEntry(id: string, input: FinancialEntryInput) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      const [snapshot] = await transaction
        .select({
          kind: financialEntries.kind,
          expectedAmount: financialEntries.expectedAmount,
          expectedDate: financialEntries.expectedDate,
          actualAmount: financialEntries.actualAmount,
          actualDate: financialEntries.actualDate,
          reviewStatus: financialEntries.reviewStatus,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .limit(1);
      if (!snapshot) return null;
      const dates = [
        snapshot.expectedDate,
        snapshot.actualDate,
        input.expectedDate,
        input.actualDate,
      ];
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        dates
          .filter((date): date is string => Boolean(date))
          .map((date) => date.slice(0, 7)),
      );
      const [existing] = await transaction
        .select({
          kind: financialEntries.kind,
          expectedAmount: financialEntries.expectedAmount,
          expectedDate: financialEntries.expectedDate,
          actualAmount: financialEntries.actualAmount,
          actualDate: financialEntries.actualDate,
          reviewStatus: financialEntries.reviewStatus,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .for("update")
        .limit(1);
      if (!existing) return null;
      if (
        existing.reviewStatus === "REVERSAL_PENDING" &&
        input.kind !== "INCOME"
      ) {
        throw new ApplicationError(
          "Revise este crédito como estorno antes de alterar o tipo do lançamento.",
          409,
        );
      }
      const [relation] = await transaction
        .select({ id: financialEntryRelations.id })
        .from(financialEntryRelations)
        .where(
          and(
            eq(financialEntryRelations.userId, userId),
            or(
              eq(financialEntryRelations.entryId, id),
              eq(financialEntryRelations.relatedEntryId, id),
            ),
          ),
        )
        .limit(1);
      if (
        relation &&
        (existing.kind !== input.kind ||
          Number(existing.expectedAmount ?? 0) !==
            Number(input.expectedAmount ?? 0) ||
          existing.expectedDate !== input.expectedDate ||
          Number(existing.actualAmount ?? 0) !==
            Number(input.actualAmount ?? 0) ||
          existing.actualDate !== input.actualDate)
      ) {
        throw new ApplicationError(
          "Altere apenas a descrição ou a categoria deste lançamento enquanto o vínculo estiver ativo.",
          409,
        );
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        dates,
      );
      const [entry] = await transaction
        .update(financialEntries)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .returning();
      return entry ?? null;
    });
  }

  async saveEntryWithRecurrence(
    id: string | null,
    input: FinancialEntryInput,
    recurrence: FinancialEntryRecurrenceInput,
  ) {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      const [existing] = id
        ? await transaction
            .select({
              kind: financialEntries.kind,
              expectedAmount: financialEntries.expectedAmount,
              expectedDate: financialEntries.expectedDate,
              actualAmount: financialEntries.actualAmount,
              actualDate: financialEntries.actualDate,
            })
            .from(financialEntries)
            .where(
              and(
                eq(financialEntries.id, id),
                eq(financialEntries.userId, userId),
              ),
            )
            .limit(1)
        : [];
      if (id && !existing) {
        throw new Error("The linked financial entry could not be found.");
      }
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        [
          existing?.expectedDate,
          existing?.actualDate,
          input.expectedDate,
          input.actualDate,
        ]
          .filter((date): date is string => Boolean(date))
          .map((date) => date.slice(0, 7)),
      );
      if (id) {
        const [lockedEntry] = await transaction
          .select({
            id: financialEntries.id,
            kind: financialEntries.kind,
            expectedAmount: financialEntries.expectedAmount,
            expectedDate: financialEntries.expectedDate,
            actualAmount: financialEntries.actualAmount,
            actualDate: financialEntries.actualDate,
            reviewStatus: financialEntries.reviewStatus,
          })
          .from(financialEntries)
          .where(
            and(
              eq(financialEntries.id, id),
              eq(financialEntries.userId, userId),
            ),
          )
          .for("update")
          .limit(1);
        if (!lockedEntry) {
          throw new Error("The linked financial entry could not be found.");
        }
        if (
          lockedEntry.reviewStatus === "REVERSAL_PENDING" &&
          input.kind !== "INCOME"
        ) {
          throw new ApplicationError(
            "Revise este crédito como estorno antes de alterar o tipo do lançamento.",
            409,
          );
        }
        const [relation] = await transaction
          .select({ id: financialEntryRelations.id })
          .from(financialEntryRelations)
          .where(
            and(
              eq(financialEntryRelations.userId, userId),
              or(
                eq(financialEntryRelations.entryId, id),
                eq(financialEntryRelations.relatedEntryId, id),
              ),
            ),
          )
          .limit(1);
        if (
          relation &&
          (lockedEntry.kind !== input.kind ||
            Number(lockedEntry.expectedAmount ?? 0) !==
              Number(input.expectedAmount ?? 0) ||
            lockedEntry.expectedDate !== input.expectedDate ||
            Number(lockedEntry.actualAmount ?? 0) !==
              Number(input.actualAmount ?? 0) ||
            lockedEntry.actualDate !== input.actualDate)
        ) {
          throw new ApplicationError(
            "Altere apenas a descrição ou a categoria deste lançamento enquanto o vínculo estiver ativo.",
            409,
          );
        }
      }
      const [createdRecurrence] = await transaction
        .insert(financialRecurrences)
        .values({ ...recurrence, userId })
        .returning({ id: financialRecurrences.id });
      if (!createdRecurrence) {
        throw new Error("The recurrence could not be created.");
      }

      const values = {
        ...input,
        recurrenceId: createdRecurrence.id,
      };
      const [entry] = id
        ? await transaction
            .update(financialEntries)
            .set({ ...values, updatedAt: new Date() })
            .where(
              and(
                eq(financialEntries.id, id),
                eq(financialEntries.userId, userId),
              ),
            )
            .returning()
        : await transaction
            .insert(financialEntries)
            .values({ ...values, userId })
            .returning();
      if (!entry) {
        throw new Error("The linked financial entry could not be saved.");
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [
          existing?.expectedDate,
          existing?.actualDate,
          input.expectedDate,
          input.actualDate,
        ],
      );
      return entry;
    });
  }

  async deleteEntry(id: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      const [existing] = await transaction
        .select({
          kind: financialEntries.kind,
          actualAmount: financialEntries.actualAmount,
          expectedDate: financialEntries.expectedDate,
          actualDate: financialEntries.actualDate,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .limit(1);
      if (!existing) return null;
      const relatedRows = await transaction
        .select({
          id: financialEntryRelations.id,
          kind: financialEntryRelations.kind,
          entryId: financialEntryRelations.entryId,
          relatedEntryId: financialEntryRelations.relatedEntryId,
        })
        .from(financialEntryRelations)
        .where(
          and(
            eq(financialEntryRelations.userId, userId),
            or(
              eq(financialEntryRelations.entryId, id),
              eq(financialEntryRelations.relatedEntryId, id),
            ),
          ),
        );
      const counterpartIds = [
        ...new Set(
          relatedRows
            .map((relation) =>
              relation.entryId === id
                ? relation.relatedEntryId
                : relation.entryId,
            )
            .filter((counterpartId) => counterpartId !== id),
        ),
      ];
      const counterpartEntries = counterpartIds.length
        ? await transaction
            .select({
              id: financialEntries.id,
              kind: financialEntries.kind,
              actualDate: financialEntries.actualDate,
            })
            .from(financialEntries)
            .where(
              and(
                eq(financialEntries.userId, userId),
                inArray(financialEntries.id, counterpartIds),
              ),
            )
        : [];
      const dates = [
        existing.expectedDate,
        existing.actualDate,
        ...counterpartEntries.map((counterpart) => counterpart.actualDate),
      ];
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        dates
          .filter((date): date is string => Boolean(date))
          .map((date) => date.slice(0, 7)),
      );
      const [lockedEntry] = await transaction
        .select({ id: financialEntries.id })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .for("update")
        .limit(1);
      if (!lockedEntry) return null;
      const reversalCreditsToRestore = relatedRows
        .filter(
          (relation) =>
            relation.kind === "REVERSAL" && relation.relatedEntryId === id,
        )
        .map((relation) => relation.entryId);
      if (reversalCreditsToRestore.length > 0) {
        await transaction
          .update(financialEntries)
          .set({ reviewStatus: "REVERSAL_PENDING", updatedAt: new Date() })
          .where(
            and(
              eq(financialEntries.userId, userId),
              inArray(financialEntries.id, reversalCreditsToRestore),
            ),
          );
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        dates,
      );
      const [entry] = await transaction
        .delete(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .returning({ id: financialEntries.id });
      return entry ?? null;
    });
  }
}

export const financialRepository = new FinancialRepository();
