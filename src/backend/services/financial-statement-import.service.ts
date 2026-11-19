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
import type { FinancialKind } from "@/backend/schemas/financial.schema";
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

function normalizedKeywords(description: string) {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

function inferEverydayCategory(description: string, kind: FinancialKind) {
  const text = normalizedKeywords(description);
  if (
    kind === "EXPENSE" &&
    /\b(CDB|RDB|PORQUINHO|INVESTIMENTO)\b/.test(text) &&
    /\b(APLICACAO|APORTE|APLICAR)\b/.test(text)
  ) {
    return "Investimentos";
  }
  if (
    kind === "INCOME" &&
    /\b(CDB|RDB|PORQUINHO|INVESTIMENTO)\b/.test(text) &&
    /\bRESGATE\b/.test(text)
  ) {
    return "Resgates de investimentos";
  }
  if (/\bMERCADO (LIVRE|PAGO)\b/.test(text)) return null;
  const isGenericTransfer =
    /\b(PIX|TED|DOC|TRANSFERENCIA|TRANSFERIDO|TRANSFERENCIA ENTRE CONTAS)\b/.test(
      text,
    );

  const catalog: Array<{
    kind: FinancialKind;
    category: string;
    patterns: RegExp[];
  }> = [
    {
      kind: "EXPENSE",
      category: "Transporte",
      patterns: [
        /\bUBER\b(?!\s+EATS\b)/,
        /\b99(?:APP|POP|TAXI| TECNOLOGIA)\b/,
        /\bTAXI\b/,
      ],
    },
    {
      kind: "EXPENSE",
      category: "Alimentação",
      patterns: [
        /\b(SUPERMERCADO|MERCADO|HORTIFRUTI|MERCEARIA|ACOUGUE|PADARIA)\b/,
        /\b(RESTAURANTE|LANCHONETE|PIZZARIA|IFOOD|RAPPI|UBER EATS)\b/,
      ],
    },
    {
      kind: "EXPENSE",
      category: "Saúde",
      patterns: [/\b(FARMACIA|DROGARIA|HOSPITAL|CLINICA|LABORATORIO)\b/],
    },
    {
      kind: "EXPENSE",
      category: "Moradia",
      patterns: [/\b(ALUGUEL|CONDOMINIO|IMOBILIARIA)\b/],
    },
    {
      kind: "EXPENSE",
      category: "Contas e serviços",
      patterns: [
        /\b(INTERNET|TELEFONE|TELEFONIA|CELULAR|BANDA LARGA)\b/,
        /\b(LUZ|AGUA|ENERGIA|ELETRICIDADE|GAS|GAS ENCANADO)\b/,
      ],
    },
    {
      kind: "EXPENSE",
      category: "Educação",
      patterns: [
        /\b(ESCOLA|FACULDADE|UNIVERSIDADE|MENSALIDADE ESCOLAR|MATERIAL ESCOLAR)\b/,
      ],
    },
    {
      kind: "EXPENSE",
      category: "Impostos e taxas",
      patterns: [/\b(IPTU|IPVA|DARF|IMPOSTO|TRIBUTO|TAXA DE LICENCIAMENTO)\b/],
    },
    {
      kind: "EXPENSE",
      category: "Seguros",
      patterns: [/\b(SEGURO|SEGURADORA|APOLICE)\b/],
    },
    {
      kind: "EXPENSE",
      category: "Lazer",
      patterns: [
        /\b(CINEMA|TEATRO|SHOW|PARQUE DE DIVERSOES|SPOTIFY|NETFLIX)\b/,
      ],
    },
    {
      kind: "INCOME",
      category: "Salário",
      patterns: [/\b(SALARIO|FOLHA DE PAGAMENTO|PAGAMENTO DE SALARIO)\b/],
    },
    {
      kind: "INCOME",
      category: "Renda de aluguel",
      patterns: [/\b(ALUGUEL RECEBIDO|RECEBIMENTO DE ALUGUEL)\b/],
    },
    {
      kind: "INCOME",
      category: "Benefícios",
      patterns: [/\b(BENEFICIO INSS|PENSAO|APOSENTADORIA)\b/],
    },
  ];
  const suggestedCategory =
    catalog.find(
      (rule) =>
        rule.kind === kind &&
        rule.patterns.some((pattern) => pattern.test(text)),
    )?.category ?? null;
  return isGenericTransfer && !suggestedCategory ? null : suggestedCategory;
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
    const categories = await financialRepository.listCategories();
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
      rows: rows.map((row) => {
        const descriptionKey = normalizeStatementDescription(row.description);
        const kind = row.kind;
        const key = kind ? `${kind}|${descriptionKey}` : "";
        const savedCategoryId = key
          ? savedCategoryByDescription.get(key)
          : undefined;
        const suggestedName = kind
          ? inferEverydayCategory(row.description, kind)
          : null;
        const suggestedCategoryId = categories.find(
          (category) =>
            category.isDefault &&
            category.active &&
            category.kind === kind &&
            (category.originalName ?? category.name).toLocaleLowerCase(
              "pt-BR",
            ) === suggestedName?.toLocaleLowerCase("pt-BR"),
        )?.id;
        return {
          ...row,
          kind,
          categoryId:
            row.errors.length === 0
              ? (savedCategoryId ?? suggestedCategoryId ?? null)
              : null,
          categorySource:
            row.errors.length > 0
              ? null
              : savedCategoryId
                ? "saved"
                : suggestedCategoryId
                  ? "suggested"
                  : null,
          alreadyImported: alreadyImported.has(row.sourceRow),
          possibleDuplicate: duplicateRows.includes(row.sourceRow),
        };
      }),
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
