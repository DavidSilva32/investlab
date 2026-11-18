import { and, eq, inArray } from "drizzle-orm";
import {
  financialEntries,
  financialStatementCategoryRules,
  financialStatementImportRows,
  financialStatementImports,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { financialMonthCloseRepository } from "@/backend/repositories/financial-month-close.repository";
import type { StatementConfirmInput } from "@/backend/schemas/financial-statement-import.schema";

export function normalizeStatementDescription(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function duplicateKey(row: {
  kind: string;
  description: string;
  actualDate: string;
  actualAmount: number | string;
}) {
  return [
    row.kind,
    row.actualDate,
    Number(row.actualAmount).toFixed(2),
    normalizeStatementDescription(row.description),
  ].join("|");
}

export class FinancialStatementImportRepository {
  async listSavedCategoryRules(
    choices: Array<{ kind: "INCOME" | "EXPENSE"; descriptionKey: string }>,
  ) {
    if (choices.length === 0) return [];
    const userId = requireDataOwnerId();
    const kinds = [...new Set(choices.map((choice) => choice.kind))];
    const descriptionKeys = [
      ...new Set(choices.map((choice) => choice.descriptionKey)),
    ];
    return getDatabaseClient()
      .select({
        kind: financialStatementCategoryRules.kind,
        descriptionKey: financialStatementCategoryRules.descriptionKey,
        categoryId: financialStatementCategoryRules.categoryId,
      })
      .from(financialStatementCategoryRules)
      .where(
        and(
          eq(financialStatementCategoryRules.userId, userId),
          inArray(financialStatementCategoryRules.kind, kinds),
          inArray(
            financialStatementCategoryRules.descriptionKey,
            descriptionKeys,
          ),
        ),
      );
  }

  async listAlreadyImportedRows(fileHash: string, sourceRows: number[]) {
    if (sourceRows.length === 0) return [];
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select({ sourceRow: financialStatementImportRows.sourceRow })
      .from(financialStatementImportRows)
      .innerJoin(
        financialStatementImports,
        eq(financialStatementImports.id, financialStatementImportRows.importId),
      )
      .where(
        and(
          eq(financialStatementImportRows.userId, userId),
          eq(financialStatementImports.userId, userId),
          eq(financialStatementImports.fileHash, fileHash),
          inArray(financialStatementImportRows.sourceRow, sourceRows),
        ),
      );
  }

  async findPossibleDuplicateRows(
    rows: Array<{
      sourceRow: number;
      kind: "INCOME" | "EXPENSE";
      description: string;
      actualDate: string;
      actualAmount: number;
    }>,
  ) {
    if (rows.length === 0) return [];
    const userId = requireDataOwnerId();
    const dates = [...new Set(rows.map((row) => row.actualDate))];
    const existing = await getDatabaseClient()
      .select({
        kind: financialEntries.kind,
        description: financialEntries.description,
        actualDate: financialEntries.actualDate,
        actualAmount: financialEntries.actualAmount,
      })
      .from(financialEntries)
      .where(
        and(
          eq(financialEntries.userId, userId),
          inArray(financialEntries.actualDate, dates),
        ),
      );
    const keys = new Set(
      existing.map((row) =>
        duplicateKey({
          kind: row.kind,
          description: row.description,
          actualDate: row.actualDate!,
          actualAmount: row.actualAmount!,
        }),
      ),
    );
    return rows
      .filter((row) => keys.has(duplicateKey(row)))
      .map((row) => row.sourceRow);
  }

  async confirm(input: StatementConfirmInput) {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      const [existingImport] = await transaction
        .select({ id: financialStatementImports.id })
        .from(financialStatementImports)
        .where(
          and(
            eq(financialStatementImports.userId, userId),
            eq(financialStatementImports.fileHash, input.fileHash),
          ),
        )
        .limit(1);
      const [statementImport] = existingImport
        ? [existingImport]
        : await transaction
            .insert(financialStatementImports)
            .values({ userId, fileHash: input.fileHash })
            .onConflictDoNothing()
            .returning({ id: financialStatementImports.id });
      const [resolvedImport] = statementImport
        ? [statementImport]
        : await transaction
            .select({ id: financialStatementImports.id })
            .from(financialStatementImports)
            .where(
              and(
                eq(financialStatementImports.userId, userId),
                eq(financialStatementImports.fileHash, input.fileHash),
              ),
            )
            .limit(1);
      if (!resolvedImport)
        throw new Error("Statement import could not be reserved.");

      let importedCount = 0;
      let alreadyImportedCount = 0;
      const importedDates: string[] = [];
      for (const row of input.rows) {
        const [reservedRow] = await transaction
          .insert(financialStatementImportRows)
          .values({
            userId,
            importId: resolvedImport.id,
            sourceRow: row.sourceRow,
          })
          .onConflictDoNothing()
          .returning({ id: financialStatementImportRows.id });
        if (!reservedRow) {
          alreadyImportedCount += 1;
          continue;
        }
        const [entry] = await transaction
          .insert(financialEntries)
          .values({
            userId,
            kind: row.kind,
            description: row.description,
            categoryId: row.categoryId,
            recurrenceId: null,
            expectedAmount: null,
            expectedDate: null,
            actualAmount: row.actualAmount.toFixed(2),
            actualDate: row.actualDate,
          })
          .returning({ id: financialEntries.id });
        if (!entry)
          throw new Error("The financial entry could not be created.");
        await transaction
          .update(financialStatementImportRows)
          .set({ entryId: entry.id })
          .where(eq(financialStatementImportRows.id, reservedRow.id));
        importedDates.push(row.actualDate);
        importedCount += 1;
      }
      if (input.rememberCategories) {
        const choices = input.rows.map((row) => ({
          userId,
          kind: row.kind,
          descriptionKey: normalizeStatementDescription(row.description),
          categoryId: row.categoryId,
          updatedAt: new Date(),
        }));
        for (const choice of choices) {
          await transaction
            .insert(financialStatementCategoryRules)
            .values(choice)
            .onConflictDoUpdate({
              target: [
                financialStatementCategoryRules.userId,
                financialStatementCategoryRules.kind,
                financialStatementCategoryRules.descriptionKey,
              ],
              set: {
                categoryId: choice.categoryId,
                updatedAt: choice.updatedAt,
              },
            });
        }
      }
      await financialMonthCloseRepository.markDatesForReview(
        transaction,
        userId,
        importedDates,
      );
      return { importedCount, alreadyImportedCount };
    });
  }
}

export const financialStatementImportRepository =
  new FinancialStatementImportRepository();
