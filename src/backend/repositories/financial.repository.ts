import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialCategories,
  financialCategoryPreferences,
  financialEntries,
  financialCardSettlementLinks,
  financialRecurrences,
  financialStatementImports,
} from "@/infrastructure/database/schema";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";

type FinancialTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

type LinkedSettlementContext = {
  settlementEntryIds: string[];
  dates: Array<string | null>;
};

async function getLinkedSettlementContext(
  transaction: FinancialTransaction,
  userId: string,
  entryId: string,
): Promise<LinkedSettlementContext> {
  const [link] = await transaction
    .select({
      settlementEntryId: financialCardSettlementLinks.settlementEntryId,
    })
    .from(financialCardSettlementLinks)
    .where(
      and(
        eq(financialCardSettlementLinks.userId, userId),
        or(
          eq(financialCardSettlementLinks.settlementEntryId, entryId),
          eq(financialCardSettlementLinks.cardEntryId, entryId),
        ),
      ),
    )
    .limit(1);
  if (!link?.settlementEntryId) return { settlementEntryIds: [], dates: [] };

  const settlementEntryIds = [link.settlementEntryId];
  const links = await transaction
    .select({ cardEntryId: financialCardSettlementLinks.cardEntryId })
    .from(financialCardSettlementLinks)
    .where(
      and(
        eq(financialCardSettlementLinks.userId, userId),
        inArray(
          financialCardSettlementLinks.settlementEntryId,
          settlementEntryIds,
        ),
      ),
    );
  const entryIds = [
    ...settlementEntryIds,
    ...links.map((row) => row.cardEntryId),
  ];
  const entries = await transaction
    .select({
      expectedDate: financialEntries.expectedDate,
      actualDate: financialEntries.actualDate,
    })
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.userId, userId),
        inArray(financialEntries.id, entryIds),
      ),
    );
  return {
    settlementEntryIds,
    dates: entries.flatMap((entry) => [entry.expectedDate, entry.actualDate]),
  };
}

async function resetLinkedSettlement(
  transaction: FinancialTransaction,
  userId: string,
  context: LinkedSettlementContext,
) {
  if (context.settlementEntryIds.length === 0) return;
  await transaction
    .update(financialEntries)
    .set({ cardSettlementStatus: "AGGREGATE", updatedAt: new Date() })
    .where(
      and(
        eq(financialEntries.userId, userId),
        inArray(financialEntries.id, context.settlementEntryIds),
        eq(financialEntries.cardSettlementStatus, "LINKED"),
      ),
    );
  await transaction
    .delete(financialCardSettlementLinks)
    .where(
      and(
        eq(financialCardSettlementLinks.userId, userId),
        inArray(
          financialCardSettlementLinks.settlementEntryId,
          context.settlementEntryIds,
        ),
      ),
    );
}

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

  async listStatementCoverage(startDate: string, endDate: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select({
        source: financialStatementImports.source,
        coverageStart: financialStatementImports.coverageStart,
        coverageEnd: financialStatementImports.coverageEnd,
        importedAt: financialStatementImports.importedAt,
      })
      .from(financialStatementImports)
      .where(
        and(
          eq(financialStatementImports.userId, userId),
          lte(financialStatementImports.coverageStart, endDate),
          gte(financialStatementImports.coverageEnd, startDate),
        ),
      )
      .orderBy(asc(financialStatementImports.importedAt));
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
          expectedDate: financialEntries.expectedDate,
          actualDate: financialEntries.actualDate,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .limit(1);
      if (!snapshot) return null;
      const linkedSettlement = await getLinkedSettlementContext(
        transaction,
        userId,
        id,
      );
      const dates = [
        snapshot.expectedDate,
        snapshot.actualDate,
        input.expectedDate,
        input.actualDate,
        ...linkedSettlement.dates,
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
          expectedDate: financialEntries.expectedDate,
          actualDate: financialEntries.actualDate,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .for("update")
        .limit(1);
      if (!existing) return null;
      await resetLinkedSettlement(transaction, userId, linkedSettlement);
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
              expectedDate: financialEntries.expectedDate,
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
      const linkedSettlement = id
        ? await getLinkedSettlementContext(transaction, userId, id)
        : { settlementEntryIds: [], dates: [] };
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        [
          existing?.expectedDate,
          existing?.actualDate,
          input.expectedDate,
          input.actualDate,
          ...linkedSettlement.dates,
        ]
          .filter((date): date is string => Boolean(date))
          .map((date) => date.slice(0, 7)),
      );
      if (id) {
        const [lockedEntry] = await transaction
          .select({ id: financialEntries.id })
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
        await resetLinkedSettlement(transaction, userId, linkedSettlement);
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
          ...linkedSettlement.dates,
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
          expectedDate: financialEntries.expectedDate,
          actualDate: financialEntries.actualDate,
        })
        .from(financialEntries)
        .where(
          and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
        )
        .limit(1);
      if (!existing) return null;
      const linkedSettlement = await getLinkedSettlementContext(
        transaction,
        userId,
        id,
      );
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        [existing.expectedDate, existing.actualDate, ...linkedSettlement.dates]
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
      await resetLinkedSettlement(transaction, userId, linkedSettlement);
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        [existing.expectedDate, existing.actualDate, ...linkedSettlement.dates],
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
