import { ApplicationError } from "@/backend/errors/application-error";
import { financialRepository } from "@/backend/repositories/financial.repository";
import {
  financialStatementImportRepository,
  normalizeStatementDescription,
} from "@/backend/repositories/financial-statement-import.repository";
import {
  statementConfirmSchema,
  statementMappingSchema,
  type StatementMapping,
} from "@/backend/schemas/financial-statement-import.schema";
import {
  parseStatementFile,
  parseStatementRows,
  type StatementRawRow,
} from "@/backend/services/financial-statement-import-parser";

function assertSchema<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApplicationError(message, 400);
  return parsed.data;
}

function suggestColumn(headers: string[], words: string[]) {
  return headers.findIndex((header) =>
    words.some((word) => header.toLocaleLowerCase("pt-BR").includes(word)),
  );
}

function defaultMapping(headers: string[]): StatementMapping | null {
  const dateColumn = suggestColumn(headers, ["data", "date"]);
  const descriptionColumn = suggestColumn(headers, [
    "descri",
    "histórico",
    "historico",
    "description",
    "memo",
  ]);
  const amountColumn = suggestColumn(headers, ["valor", "amount", "montante"]);
  const debitColumn = suggestColumn(headers, ["débito", "debito", "debit"]);
  const creditColumn = suggestColumn(headers, ["crédito", "credito", "credit"]);
  if (dateColumn < 0 || descriptionColumn < 0) return null;
  if (
    amountColumn >= 0 &&
    amountColumn !== dateColumn &&
    amountColumn !== descriptionColumn
  ) {
    return {
      dateColumn,
      descriptionColumn,
      amountColumn,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    };
  }
  if (
    debitColumn >= 0 &&
    creditColumn >= 0 &&
    new Set([dateColumn, descriptionColumn, debitColumn, creditColumn]).size ===
      4
  ) {
    return {
      dateColumn,
      descriptionColumn,
      debitColumn,
      creditColumn,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    };
  }
  return null;
}

export class FinancialStatementImportService {
  async preview(file: { name: string; buffer: Buffer }, rawMapping?: unknown) {
    const parsedFile = parseStatementFile(file.name, file.buffer);
    const mapping =
      rawMapping === undefined
        ? defaultMapping(parsedFile.headers)
        : assertSchema(
            statementMappingSchema,
            rawMapping,
            "Revise o mapeamento das colunas.",
          );
    if (!mapping) {
      return {
        hash: parsedFile.hash,
        headers: parsedFile.headers,
        rows: parsedFile.rows,
        mapping: null,
      };
    }
    const rows = parseStatementRows(parsedFile.rows, mapping);
    const validRows = rows
      .filter(
        (row) =>
          row.errors.length === 0 &&
          row.kind &&
          row.actualDate &&
          row.amount !== null,
      )
      .map((row) => ({
        sourceRow: row.sourceRow,
        kind: row.kind!,
        description: row.description,
        actualDate: row.actualDate!,
        actualAmount: row.amount!,
      }));
    const alreadyImportedRows =
      await financialStatementImportRepository.listAlreadyImportedRows(
        parsedFile.hash,
        validRows.map((row) => row.sourceRow),
      );
    const alreadyImported = new Set(
      alreadyImportedRows.map((row) => row.sourceRow),
    );
    const savedRules =
      await financialStatementImportRepository.listSavedCategoryRules(
        validRows
          .filter((row) => !alreadyImported.has(row.sourceRow))
          .map((row) => ({
            kind: row.kind,
            descriptionKey: normalizeStatementDescription(row.description),
          })),
      );
    const categories = savedRules.length
      ? await financialRepository.listCategories()
      : [];
    const savedCategoryByDescription = new Map<string, string>();
    for (const rule of savedRules) {
      const category = categories.find(
        (candidate) =>
          candidate.id === rule.categoryId &&
          candidate.active &&
          candidate.kind === rule.kind,
      );
      if (category) {
        savedCategoryByDescription.set(
          `${rule.kind}|${rule.descriptionKey}`,
          category.id,
        );
      }
    }
    const duplicateRows =
      await financialStatementImportRepository.findPossibleDuplicateRows(
        validRows.filter((row) => !alreadyImported.has(row.sourceRow)),
      );
    return {
      hash: parsedFile.hash,
      headers: parsedFile.headers,
      mapping,
      rows: rows.map((row) => ({
        ...row,
        categoryId:
          row.kind && row.errors.length === 0
            ? (savedCategoryByDescription.get(
                `${row.kind}|${normalizeStatementDescription(row.description)}`,
              ) ?? null)
            : null,
        categorySource:
          row.kind &&
          row.errors.length === 0 &&
          savedCategoryByDescription.has(
            `${row.kind}|${normalizeStatementDescription(row.description)}`,
          )
            ? "saved"
            : null,
        alreadyImported: alreadyImported.has(row.sourceRow),
        possibleDuplicate: duplicateRows.includes(row.sourceRow),
      })),
    };
  }

  async confirm(rawInput: unknown) {
    const input = assertSchema(
      statementConfirmSchema,
      rawInput,
      "Revise os lançamentos antes de confirmar.",
    );
    const categories = await financialRepository.listCategories();
    if (
      input.rows.some(
        (row) =>
          !categories.some(
            (category) =>
              category.id === row.categoryId &&
              category.active &&
              category.kind === row.kind,
          ),
      )
    ) {
      throw new ApplicationError(
        "Escolha uma categoria ativa compatível com cada lançamento.",
        400,
      );
    }
    const alreadyImportedRows =
      await financialStatementImportRepository.listAlreadyImportedRows(
        input.fileHash,
        input.rows.map((row) => row.sourceRow),
      );
    const alreadyImported = new Set(
      alreadyImportedRows.map((row) => row.sourceRow),
    );
    const duplicateRows =
      await financialStatementImportRepository.findPossibleDuplicateRows(
        input.rows.filter((row) => !alreadyImported.has(row.sourceRow)),
      );
    if (duplicateRows.length && !input.allowPossibleDuplicates) {
      throw new ApplicationError(
        "Há possíveis duplicidades. Revise os avisos e confirme novamente se quiser importar mesmo assim.",
        409,
      );
    }
    const result = await financialStatementImportRepository.confirm(input);
    return { ...result, possibleDuplicateCount: duplicateRows.length };
  }
}

export const financialStatementImportService =
  new FinancialStatementImportService();
