import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialCategoryPreferences,
  recurringFinancialOccurrences,
  financialRecurrences,
  financialCategories,
} from "@/infrastructure/database/schema";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";

function currentMonthStartDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-01`;
}

export type FinancialRecurrenceInput = {
  description: string;
  amount: string;
  frequency: string;
  firstDueDate: string;
  essential: boolean;
  kind: "INCOME" | "EXPENSE";
  categoryId: string | null;
};

export class FinancialRecurrencesRepository {
  async listRecurrences() {
    const userId = requireDataOwnerId();
    const category = sql<
      string | null
    >`coalesce(${financialCategoryPreferences.nameOverride}, ${financialCategories.name})`;
    return getDatabaseClient()
      .select({
        id: financialRecurrences.id,
        userId: financialRecurrences.userId,
        description: financialRecurrences.description,
        categoryId: financialRecurrences.categoryId,
        category,
        amount: financialRecurrences.amount,
        frequency: financialRecurrences.frequency,
        firstDueDate: financialRecurrences.firstDueDate,
        essential: financialRecurrences.essential,
        kind: financialRecurrences.kind,
        active: financialRecurrences.active,
        createdAt: financialRecurrences.createdAt,
        updatedAt: financialRecurrences.updatedAt,
      })
      .from(financialRecurrences)
      .leftJoin(
        financialCategories,
        eq(financialCategories.id, financialRecurrences.categoryId),
      )
      .leftJoin(
        financialCategoryPreferences,
        and(
          eq(financialCategoryPreferences.categoryId, financialCategories.id),
          eq(financialCategoryPreferences.userId, userId),
        ),
      )
      .where(eq(financialRecurrences.userId, userId))
      .orderBy(asc(financialRecurrences.description));
  }

  async findOrCreateCategory(kind: "INCOME" | "EXPENSE", name: string | null) {
    if (!name) return null;
    const userId = requireDataOwnerId();
    const normalized = name.trim().toLocaleLowerCase("pt-BR");
    const database = getDatabaseClient();
    const [existing] = await database
      .select({ id: financialCategories.id })
      .from(financialCategories)
      .where(
        and(
          eq(financialCategories.kind, kind),
          sql`lower(trim(${financialCategories.name})) = ${normalized}`,
          or(
            eq(financialCategories.userId, userId),
            sql`${financialCategories.userId} is null`,
          ),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const [created] = await database
      .insert(financialCategories)
      .values({ userId, kind, name: name.trim(), isDefault: false })
      .onConflictDoNothing()
      .returning({ id: financialCategories.id });
    if (created) return created.id;
    const [conflict] = await database
      .select({ id: financialCategories.id })
      .from(financialCategories)
      .where(
        and(
          eq(financialCategories.userId, userId),
          eq(financialCategories.kind, kind),
          sql`lower(trim(${financialCategories.name})) = ${normalized}`,
        ),
      )
      .limit(1);
    return conflict?.id ?? null;
  }

  async findCategoryForUser(id: string, kind: "INCOME" | "EXPENSE") {
    const userId = requireDataOwnerId();
    const [category] = await getDatabaseClient()
      .select({ id: financialCategories.id })
      .from(financialCategories)
      .where(
        and(
          eq(financialCategories.id, id),
          eq(financialCategories.kind, kind),
          or(
            eq(financialCategories.userId, userId),
            sql`${financialCategories.userId} is null`,
          ),
        ),
      )
      .limit(1);
    return category?.id ?? null;
  }

  async listOccurrencesForMonth(startDate: string, endDate: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(recurringFinancialOccurrences)
      .where(
        and(
          eq(recurringFinancialOccurrences.userId, userId),
          gte(recurringFinancialOccurrences.dueDate, startDate),
          lte(recurringFinancialOccurrences.dueDate, endDate),
        ),
      );
  }

  async listOccurrencesForFinancialPeriod(startDate: string, endDate: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(recurringFinancialOccurrences)
      .where(
        and(
          eq(recurringFinancialOccurrences.userId, userId),
          or(
            and(
              gte(recurringFinancialOccurrences.dueDate, startDate),
              lte(recurringFinancialOccurrences.dueDate, endDate),
            ),
            and(
              gte(recurringFinancialOccurrences.actualDate, startDate),
              lte(recurringFinancialOccurrences.actualDate, endDate),
            ),
          ),
        ),
      );
  }

  async listLatestRealizedBeforeDate(
    recurrenceIds: string[],
    beforeDate: string,
  ) {
    if (recurrenceIds.length === 0) return [];
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .selectDistinctOn([recurringFinancialOccurrences.recurrenceId])
      .from(recurringFinancialOccurrences)
      .where(
        and(
          eq(recurringFinancialOccurrences.userId, userId),
          inArray(recurringFinancialOccurrences.recurrenceId, recurrenceIds),
          lt(recurringFinancialOccurrences.dueDate, beforeDate),
          or(
            isNotNull(recurringFinancialOccurrences.actualAmount),
            isNotNull(recurringFinancialOccurrences.realizedAt),
          ),
          isNotNull(recurringFinancialOccurrences.realizedAt),
        ),
      )
      .orderBy(
        recurringFinancialOccurrences.recurrenceId,
        desc(recurringFinancialOccurrences.dueDate),
      );
  }

  async findRecurrence(id: string) {
    const userId = requireDataOwnerId();
    const [recurrence] = await getDatabaseClient()
      .select()
      .from(financialRecurrences)
      .where(
        and(
          eq(financialRecurrences.id, id),
          eq(financialRecurrences.userId, userId),
        ),
      )
      .limit(1);
    return recurrence ?? null;
  }

  async hasRealizedOccurrences(recurrenceId: string) {
    const userId = requireDataOwnerId();
    const [occurrence] = await getDatabaseClient()
      .select({ id: recurringFinancialOccurrences.id })
      .from(recurringFinancialOccurrences)
      .where(
        and(
          eq(recurringFinancialOccurrences.userId, userId),
          eq(recurringFinancialOccurrences.recurrenceId, recurrenceId),
          isNotNull(recurringFinancialOccurrences.actualAmount),
        ),
      )
      .limit(1);
    return Boolean(occurrence);
  }

  async createRecurrence(input: FinancialRecurrenceInput) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [currentMonthStartDate()],
      );
      const [recurrence] = await transaction
        .insert(financialRecurrences)
        .values({ ...input, userId })
        .returning();
      return recurrence;
    });
  }

  async updateRecurrence(
    id: string,
    input: FinancialRecurrenceInput & { active: boolean },
  ) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      const [existing] = await transaction
        .select({
          id: financialRecurrences.id,
          kind: financialRecurrences.kind,
        })
        .from(financialRecurrences)
        .where(
          and(
            eq(financialRecurrences.id, id),
            eq(financialRecurrences.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) return null;

      const affectedDates: Array<string | null | undefined> = [
        currentMonthStartDate(),
      ];
      if (existing.kind !== input.kind) {
        const occurrences = await transaction
          .select({
            dueDate: recurringFinancialOccurrences.dueDate,
            actualDate: recurringFinancialOccurrences.actualDate,
          })
          .from(recurringFinancialOccurrences)
          .where(
            and(
              eq(recurringFinancialOccurrences.userId, userId),
              eq(recurringFinancialOccurrences.recurrenceId, id),
            ),
          )
          .for("update");
        affectedDates.push(
          ...occurrences.flatMap(({ dueDate, actualDate }) => [
            dueDate,
            actualDate,
          ]),
        );
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        affectedDates,
      );
      const [recurrence] = await transaction
        .update(financialRecurrences)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(financialRecurrences.id, id),
            eq(financialRecurrences.userId, userId),
          ),
        )
        .returning();
      return recurrence ?? null;
    });
  }

  async removeRecurrenceSafely(id: string) {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      const [recurrence] = await transaction
        .select({ id: financialRecurrences.id })
        .from(financialRecurrences)
        .where(
          and(
            eq(financialRecurrences.id, id),
            eq(financialRecurrences.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!recurrence) return null;

      const occurrences = await transaction
        .select({
          id: recurringFinancialOccurrences.id,
          dueDate: recurringFinancialOccurrences.dueDate,
          actualDate: recurringFinancialOccurrences.actualDate,
          actualAmount: recurringFinancialOccurrences.actualAmount,
          realizedAt: recurringFinancialOccurrences.realizedAt,
        })
        .from(recurringFinancialOccurrences)
        .where(
          and(
            eq(recurringFinancialOccurrences.userId, userId),
            eq(recurringFinancialOccurrences.recurrenceId, recurrence.id),
          ),
        )
        .for("update");

      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [
          currentMonthStartDate(),
          ...occurrences.flatMap(({ dueDate, actualDate }) => [
            dueDate,
            actualDate,
          ]),
        ],
      );

      const hasRealizedOccurrence = occurrences.some(
        (occurrence) =>
          occurrence.actualAmount !== null || occurrence.realizedAt !== null,
      );

      if (hasRealizedOccurrence) {
        await transaction
          .update(financialRecurrences)
          .set({ active: false, updatedAt: new Date() })
          .where(
            and(
              eq(financialRecurrences.id, recurrence.id),
              eq(financialRecurrences.userId, userId),
            ),
          );
        return { id: recurrence.id, action: "ended" as const };
      }

      await transaction
        .delete(financialRecurrences)
        .where(
          and(
            eq(financialRecurrences.id, recurrence.id),
            eq(financialRecurrences.userId, userId),
          ),
        );
      return { id: recurrence.id, action: "deleted" as const };
    });
  }

  async realizeOccurrence(input: {
    recurrenceId: string;
    dueDate: string;
    actualDate: string | null;
    expectedAmount: string;
    actualAmount: string;
    realizedAt: Date;
  }) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ actualDate: recurringFinancialOccurrences.actualDate })
        .from(recurringFinancialOccurrences)
        .where(
          and(
            eq(recurringFinancialOccurrences.userId, userId),
            eq(recurringFinancialOccurrences.recurrenceId, input.recurrenceId),
            eq(recurringFinancialOccurrences.dueDate, input.dueDate),
          ),
        )
        .for("update")
        .limit(1);
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [existing?.actualDate, input.dueDate, input.actualDate],
      );
      const [occurrence] = await transaction
        .insert(recurringFinancialOccurrences)
        .values({ ...input, userId })
        .onConflictDoUpdate({
          target: [
            recurringFinancialOccurrences.userId,
            recurringFinancialOccurrences.recurrenceId,
            recurringFinancialOccurrences.dueDate,
          ],
          set: {
            actualAmount: input.actualAmount,
            actualDate: input.actualDate,
            realizedAt: input.realizedAt,
            updatedAt: new Date(),
          },
        })
        .returning();
      return occurrence;
    });
  }
}

export const financialRecurrencesRepository =
  new FinancialRecurrencesRepository();
