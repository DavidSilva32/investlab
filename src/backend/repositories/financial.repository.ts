import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  financialCategories,
  financialCategoryPreferences,
  financialEntries,
} from "@/infrastructure/database/schema";

export type FinancialCategoryRecord = {
  id: string;
  userId: string | null;
  kind: string;
  name: string;
  originalName: string;
  isDefault: boolean;
  active: boolean;
};

export type FinancialCategoryInput = {
  kind: string;
  name: string;
};

export type FinancialCategoryUpdate = {
  nameOverride: string | null;
  active: boolean;
};

export type FinancialEntryInput = {
  kind: string;
  description: string;
  categoryId: string;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
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

  async createCategory(input: FinancialCategoryInput) {
    const userId = requireDataOwnerId();
    const [category] = await getDatabaseClient()
      .insert(financialCategories)
      .values({ ...input, userId, isDefault: false })
      .returning();
    return category;
  }

  async updateOwnedCategory(id: string, input: FinancialCategoryInput) {
    const userId = requireDataOwnerId();
    const [category] = await getDatabaseClient()
      .update(financialCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(financialCategories.id, id),
          eq(financialCategories.userId, userId),
          eq(financialCategories.isDefault, false),
        ),
      )
      .returning();
    return category ?? null;
  }

  async saveDefaultCategoryPreference(
    categoryId: string,
    input: FinancialCategoryUpdate,
  ) {
    const userId = requireDataOwnerId();
    await getDatabaseClient()
      .insert(financialCategoryPreferences)
      .values({ ...input, userId, categoryId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          financialCategoryPreferences.userId,
          financialCategoryPreferences.categoryId,
        ],
        set: { ...input, updatedAt: new Date() },
      });
    return (
      (await this.listCategories()).find(
        (category) => category.id === categoryId,
      ) ?? null
    );
  }

  async setOwnedCategoryActive(id: string, active: boolean) {
    const userId = requireDataOwnerId();
    const [category] = await getDatabaseClient()
      .update(financialCategories)
      .set({ active, updatedAt: new Date() })
      .where(
        and(
          eq(financialCategories.id, id),
          eq(financialCategories.userId, userId),
          eq(financialCategories.isDefault, false),
        ),
      )
      .returning();
    return category ?? null;
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
    const [entry] = await getDatabaseClient()
      .insert(financialEntries)
      .values({ ...input, userId })
      .returning();
    return entry;
  }

  async updateEntry(id: string, input: FinancialEntryInput) {
    const userId = requireDataOwnerId();
    const [entry] = await getDatabaseClient()
      .update(financialEntries)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
      )
      .returning();
    return entry ?? null;
  }

  async deleteEntry(id: string) {
    const userId = requireDataOwnerId();
    const [entry] = await getDatabaseClient()
      .delete(financialEntries)
      .where(
        and(eq(financialEntries.id, id), eq(financialEntries.userId, userId)),
      )
      .returning({ id: financialEntries.id });
    return entry ?? null;
  }
}

export const financialRepository = new FinancialRepository();
