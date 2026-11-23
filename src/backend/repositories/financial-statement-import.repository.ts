import { and, eq, inArray, isNull, ne } from "drizzle-orm";
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
  accountAlias?: string | null;
}) {
  return [
    row.accountAlias?.trim().toLocaleLowerCase("pt-BR") ?? "<unknown-account>",
    row.kind,
    row.actualDate,
    Number(row.actualAmount).toFixed(2),
    normalizeStatementDescription(row.description),
  ].join("|");
}

function duplicateFingerprint(row: {
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

function isLikelyReversal(description: string) {
  return /\b(?:ESTORNO|ESTORNADO|DEVOLUCAO|DEVOLVIDO|REEMBOLSO)\b/.test(
    description
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleUpperCase("pt-BR"),
  );
}

export class FinancialStatementImportRepository {
  async listAccountAliases() {
    const userId = requireDataOwnerId();
    const rows = await getDatabaseClient()
      .selectDistinct({ accountAlias: financialStatementImports.accountAlias })
      .from(financialStatementImports)
      .where(
        and(
          eq(financialStatementImports.userId, userId),
          eq(financialStatementImports.source, "ACCOUNT"),
        ),
      );
    return rows
      .map((row) => row.accountAlias)
      .filter((alias): alias is string => Boolean(alias));
  }

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
        id: financialEntries.id,
        kind: financialEntries.kind,
        description: financialEntries.description,
        actualDate: financialEntries.actualDate,
        actualAmount: financialEntries.actualAmount,
        accountAlias: financialEntries.accountAlias,
      })
      .from(financialEntries)
      .where(
        and(
          eq(financialEntries.userId, userId),
          eq(financialEntries.channel, "ACCOUNT"),
          inArray(financialEntries.actualDate, dates),
          ne(financialEntries.channel, "CARD"),
        ),
      );
    const remaining = new Map<
      string,
      Array<{ id: string; accountAlias: string }>
    >();
    for (const row of existing) {
      const key = duplicateFingerprint({
        kind: row.kind,
        description: row.description,
        actualDate: row.actualDate!,
        actualAmount: row.actualAmount!,
      });
      remaining.set(key, [
        ...(remaining.get(key) ?? []),
        { id: row.id, accountAlias: row.accountAlias ?? "" },
      ]);
    }
    const duplicates: Array<{
      sourceRow: number;
      accountAliases: string[];
      accountDuplicateCandidates: Array<{
        entryId: string;
        accountAlias: string;
      }>;
    }> = [];
    for (const row of rows) {
      const key = duplicateFingerprint(row);
      const aliases = remaining.get(key) ?? [];
      if (aliases.length === 0) continue;
      duplicates.push({
        sourceRow: row.sourceRow,
        accountAliases: [aliases[0].accountAlias],
        accountDuplicateCandidates: [
          {
            entryId: aliases[0].id,
            accountAlias: aliases[0].accountAlias,
          },
        ],
      });
      remaining.set(key, aliases.slice(1));
    }
    return duplicates;
  }

  async findManualDuplicateCandidates(
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
        id: financialEntries.id,
        kind: financialEntries.kind,
        description: financialEntries.description,
        actualDate: financialEntries.actualDate,
        actualAmount: financialEntries.actualAmount,
      })
      .from(financialEntries)
      .where(
        and(
          eq(financialEntries.userId, userId),
          eq(financialEntries.channel, "MANUAL"),
          inArray(financialEntries.actualDate, dates),
        ),
      );
    return rows.flatMap((row) => {
      const candidates = existing.filter(
        (entry) =>
          entry.kind === row.kind &&
          entry.actualDate === row.actualDate &&
          Number(entry.actualAmount) === row.actualAmount,
      );
      return candidates.length
        ? [
            {
              sourceRow: row.sourceRow,
              candidates: candidates.map((entry) => ({
                id: entry.id,
                description: entry.description,
              })),
            },
          ]
        : [];
    });
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
              id: financialEntries.id,
              channel: financialEntries.channel,
              kind: financialEntries.kind,
              description: financialEntries.description,
              actualDate: financialEntries.actualDate,
              actualAmount: financialEntries.actualAmount,
              accountAlias: financialEntries.accountAlias,
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
      const accountCandidates = new Map<string, typeof existingEntries>();
      for (const entry of existingEntries) {
        if (entry.channel !== "ACCOUNT") continue;
        const fingerprint = duplicateKey({
          kind: entry.kind,
          description: entry.description,
          actualDate: entry.actualDate!,
          actualAmount: entry.actualAmount!,
        });
        accountCandidates.set(fingerprint, [
          ...(accountCandidates.get(fingerprint) ?? []),
          entry,
        ]);
        if (entry.accountAlias?.trim()) {
          const key = duplicateKey({
            kind: entry.kind,
            description: entry.description,
            actualDate: entry.actualDate!,
            actualAmount: entry.actualAmount!,
            accountAlias: entry.accountAlias.trim().toLocaleLowerCase("pt-BR"),
          });
          duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
        }
      }
      const [existingImport] = await transaction
        .select({
          id: financialStatementImports.id,
          source: financialStatementImports.source,
          accountAlias: financialStatementImports.accountAlias,
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
              accountAlias: input.accountAlias?.trim() || null,
              coverageStart,
              coverageEnd,
            })
            .onConflictDoNothing()
            .returning({
              id: financialStatementImports.id,
              source: financialStatementImports.source,
              accountAlias: financialStatementImports.accountAlias,
            });
      const [resolvedImport] = statementImport
        ? [
            {
              id: statementImport.id,
              source: statementImport.source ?? source,
              accountAlias: statementImport.accountAlias,
            },
          ]
        : await transaction
            .select({
              id: financialStatementImports.id,
              source: financialStatementImports.source,
              accountAlias: financialStatementImports.accountAlias,
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
      if (
        existingImport &&
        input.accountAlias?.trim() &&
        !resolvedImport.accountAlias
      ) {
        await transaction
          .update(financialStatementImports)
          .set({ accountAlias: input.accountAlias.trim() })
          .where(eq(financialStatementImports.id, resolvedImport.id));
        const importedEntryRows = await transaction
          .select({ entryId: financialStatementImportRows.entryId })
          .from(financialStatementImportRows)
          .where(
            and(
              eq(financialStatementImportRows.userId, userId),
              eq(financialStatementImportRows.importId, resolvedImport.id),
            ),
          );
        for (const importedRow of importedEntryRows) {
          if (!importedRow.entryId) continue;
          await transaction
            .update(financialEntries)
            .set({ accountAlias: input.accountAlias.trim() })
            .where(
              and(
                eq(financialEntries.userId, userId),
                eq(financialEntries.id, importedRow.entryId),
                isNull(financialEntries.accountAlias),
              ),
            );
        }
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
        const matchingManualEntries = existingEntries.filter(
          (entry) =>
            entry.channel === "MANUAL" &&
            entry.kind === row.kind &&
            entry.actualDate === row.actualDate &&
            Number(entry.actualAmount) === row.actualAmount,
        );
        if (matchingManualEntries.length > 0) {
          const selectedManual = matchingManualEntries.find(
            (entry) => entry.id === row.manualDuplicateEntryId,
          );
          if (row.manualDuplicateEntryId && !selectedManual) {
            throw new ApplicationError(
              "A possível duplicidade mudou. Revise o extrato novamente.",
              409,
            );
          }
          if (!row.confirmedDistinct && !selectedManual) {
            throw new ApplicationError(
              "Revise a possível duplicidade antes de confirmar a importação.",
              409,
            );
          }
          if (selectedManual) {
            if (
              input.accountAlias?.trim() &&
              selectedManual.accountAlias === null
            ) {
              await transaction
                .update(financialEntries)
                .set({ accountAlias: input.accountAlias.trim() })
                .where(
                  and(
                    eq(financialEntries.userId, userId),
                    eq(financialEntries.id, selectedManual.id),
                    isNull(financialEntries.accountAlias),
                  ),
                );
            }
            await transaction
              .update(financialStatementImportRows)
              .set({ entryId: selectedManual.id })
              .where(eq(financialStatementImportRows.id, reservedRow.id));
            duplicateCount += 1;
            continue;
          }
        }
        const fingerprint = duplicateKey(row);
        const candidates = accountCandidates.get(fingerprint) ?? [];
        const alias = input.accountAlias?.trim().toLocaleLowerCase("pt-BR");
        if (row.accountDuplicateEntryId) {
          const selectedEntry = candidates.find(
            (candidate) => candidate.id === row.accountDuplicateEntryId,
          );
          if (
            !selectedEntry ||
            selectedEntry.accountAlias?.trim() ||
            !input.accountAlias?.trim()
          ) {
            throw new ApplicationError(
              "A possível duplicidade mudou. Confira a conta e revise o extrato novamente.",
              409,
            );
          }
          await transaction
            .update(financialEntries)
            .set({ accountAlias: input.accountAlias.trim() })
            .where(
              and(
                eq(financialEntries.userId, userId),
                eq(financialEntries.id, selectedEntry.id),
                isNull(financialEntries.accountAlias),
              ),
            );
          await transaction
            .update(financialStatementImportRows)
            .set({ entryId: selectedEntry.id })
            .where(eq(financialStatementImportRows.id, reservedRow.id));
          duplicateCount += 1;
          continue;
        }
        const key = duplicateKey({ ...row, accountAlias: alias });
        const existingCount = duplicateCounts.get(key) ?? 0;
        if (existingCount > 0) {
          duplicateCounts.set(key, existingCount - 1);
          duplicateCount += 1;
          continue;
        }
        const hasAmbiguousAccountCandidate =
          candidates.length > 0 &&
          (!alias || candidates.some((entry) => !entry.accountAlias?.trim()));
        if (hasAmbiguousAccountCandidate && !row.confirmedDistinct) {
          throw new ApplicationError(
            "Confira a conta e revise a possível duplicidade antes de importar.",
            409,
          );
        }
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
            accountAlias: input.accountAlias?.trim() || null,
            reviewStatus:
              row.kind === "INCOME" && isLikelyReversal(row.description)
                ? "REVERSAL_PENDING"
                : "NONE",
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
      return {
        importedCount,
        alreadyImportedCount,
        duplicateCount,
      };
    });
  }
}

export const financialStatementImportRepository =
  new FinancialStatementImportRepository();
