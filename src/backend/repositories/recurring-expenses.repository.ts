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
} from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  recurringExpenseOccurrences,
  recurringExpenses,
} from "@/infrastructure/database/schema";

export type RecurringExpenseInput = {
  description: string;
  category: string | null;
  amount: string;
  frequency: string;
  firstDueDate: string;
  essential: boolean;
};

export class RecurringExpensesRepository {
  async listExpenses() {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(recurringExpenses)
      .where(eq(recurringExpenses.userId, userId))
      .orderBy(asc(recurringExpenses.description));
  }

  async listOccurrencesForMonth(startDate: string, endDate: string) {
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(recurringExpenseOccurrences)
      .where(
        and(
          eq(recurringExpenseOccurrences.userId, userId),
          gte(recurringExpenseOccurrences.dueDate, startDate),
          lte(recurringExpenseOccurrences.dueDate, endDate),
        ),
      );
  }

  async listLatestRealizedBeforeDate(
    recurringExpenseIds: string[],
    beforeDate: string,
  ) {
    if (recurringExpenseIds.length === 0) return [];
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .selectDistinctOn([recurringExpenseOccurrences.recurringExpenseId])
      .from(recurringExpenseOccurrences)
      .where(
        and(
          eq(recurringExpenseOccurrences.userId, userId),
          inArray(
            recurringExpenseOccurrences.recurringExpenseId,
            recurringExpenseIds,
          ),
          lt(recurringExpenseOccurrences.dueDate, beforeDate),
          isNotNull(recurringExpenseOccurrences.actualAmount),
          isNotNull(recurringExpenseOccurrences.realizedAt),
        ),
      )
      .orderBy(
        recurringExpenseOccurrences.recurringExpenseId,
        desc(recurringExpenseOccurrences.dueDate),
      );
  }

  async findExpense(id: string) {
    const userId = requireDataOwnerId();
    const [expense] = await getDatabaseClient()
      .select()
      .from(recurringExpenses)
      .where(
        and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
      )
      .limit(1);
    return expense ?? null;
  }

  async createExpense(input: RecurringExpenseInput) {
    const userId = requireDataOwnerId();
    const [expense] = await getDatabaseClient()
      .insert(recurringExpenses)
      .values({ ...input, userId })
      .returning();
    return expense;
  }

  async updateExpense(
    id: string,
    input: RecurringExpenseInput & { active: boolean },
  ) {
    const userId = requireDataOwnerId();
    const [expense] = await getDatabaseClient()
      .update(recurringExpenses)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
      )
      .returning();
    return expense ?? null;
  }

  async setRealized(input: {
    recurringExpenseId: string;
    dueDate: string;
    expectedAmount: string;
    actualAmount: string;
    realizedAt: Date;
  }) {
    const userId = requireDataOwnerId();
    const [occurrence] = await getDatabaseClient()
      .insert(recurringExpenseOccurrences)
      .values({ ...input, userId })
      .onConflictDoUpdate({
        target: [
          recurringExpenseOccurrences.userId,
          recurringExpenseOccurrences.recurringExpenseId,
          recurringExpenseOccurrences.dueDate,
        ],
        set: {
          actualAmount: input.actualAmount,
          realizedAt: input.realizedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return occurrence;
  }
}

export const recurringExpensesRepository = new RecurringExpensesRepository();
