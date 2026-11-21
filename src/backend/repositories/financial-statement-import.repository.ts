import { and, eq, inArray, ne } from "drizzle-orm";
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
import type { FinancialKind } from "@/backend/schemas/financial.schema";
import { ApplicationError } from "@/backend/errors/application-error";

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
    choices: Array<{ kind: FinancialKind; descriptionKey: string }>,
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
      kind: FinancialKind;
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
          ne(financialEntries.channel, "CARD"),
        ),
      );
    const remaining = new Map<string, number>();
    for (const row of existing) {
      const key = duplicateKey({
        kind: row.kind,
        description: row.description,
        actualDate: row.actualDate!,
        actualAmount: row.actualAmount!,
      });
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const duplicates: number[] = [];
    for (const row of rows) {
      const key = duplicateKey(row);
      const count = remaining.get(key) ?? 0;
      if (count === 0) continue;
      duplicates.push(row.sourceRow);
      remaining.set(key, count - 1);
    }
    return duplicates;
  }

  async confirm(input: StatementConfirmInput) {
    const userId = requireDataOwnerId();
    const database = getDatabaseClient();
    const source = "ACCOUNT" as const;
    const coverageStart = input.coverageStart ?? null;
    const coverageEnd = input.coverageEnd ?? null;
    return database.transaction(async (transaction) => {
      await financialMonthCloseRepository.acquireFinancialWriteLock(
        transaction,
        userId,
      );
      const months = [
        ...new Set(input.rows.map((row) => row.actualDate.slice(0, 7))),
      ];
      await financialMonthCloseRepository.acquireMonthLocks(
        transaction,
        userId,
        months,
      );
      const dates = [...new Set(input.rows.map((row) => row.actualDate))];
      const existingEntries = dates.length
        ? await transaction
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
                ne(financialEntries.channel, "CARD"),
              ),
            )
        : [];
      const duplicateCounts = new Map<string, number>();
      for (const entry of existingEntries) {
        const key = duplicateKey({
          kind: entry.kind,
          description: entry.description,
          actualDate: entry.actualDate!,
          actualAmount: entry.actualAmount!,
        });
        duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
      }
      const [existingImport] = await transaction
        .select({
          id: financialStatementImports.id,
          source: financialStatementImports.source,
        })
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
            .values({
              userId,
              fileHash: input.fileHash,
              source,
              coverageStart,
              coverageEnd,
            })
            .onConflictDoNothing()
            .returning({
              id: financialStatementImports.id,
              source: financialStatementImports.source,
            });
      const [resolvedImport] = statementImport
        ? [
            {
              id: statementImport.id,
              source: statementImport.source ?? source,
            },
          ]
        : await transaction
            .select({
              id: financialStatementImports.id,
              source: financialStatementImports.source,
            })
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
      if (resolvedImport.source !== source) {
        throw new ApplicationError(
          "Este arquivo já foi importado com outra origem.",
          409,
        );
      }
      let importedCount = 0;
      let alreadyImportedCount = 0;
      let duplicateCount = 0;
      const importedDates: string[] = [];
      const rememberedRows: Array<
        StatementConfirmInput["rows"][number] & { categoryId: string }
      > = [];
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
        const key = duplicateKey(row);
        const existingCount = duplicateCounts.get(key) ?? 0;
        if (existingCount > 0) {
          duplicateCounts.set(key, existingCount - 1);
          duplicateCount += 1;
          continue;
        }
        if (row.possibleDuplicate)
          throw new ApplicationError(
            "Os lançamentos repetidos mudaram desde a revisão. Confira o extrato novamente.",
            409,
          );
        const categoryId = row.categoryId;
        if (!categoryId)
          throw new ApplicationError(
            "Escolha uma categoria para cada lançamento novo.",
            400,
          );
        const [entry] = await transaction
          .insert(financialEntries)
          .values({
            userId,
            kind: row.kind,
            description: row.description,
            categoryId,
            recurrenceId: null,
            channel: "ACCOUNT",
            sourceCategory: null,
            cardSettlementStatus: null,
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
        rememberedRows.push({ ...row, categoryId });
        importedCount += 1;
      }
      if (input.rememberCategories) {
        const choices = rememberedRows.map((row) => ({
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
      return { importedCount, alreadyImportedCount, duplicateCount };
    });
  }
}

export const financialStatementImportRepository =
  new FinancialStatementImportRepository();
