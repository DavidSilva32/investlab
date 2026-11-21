import { ApplicationError } from "@/backend/errors/application-error";
import { financialRepository } from "@/backend/repositories/financial.repository";
import {
  financialStatementImportRepository,
  normalizeStatementDescription,
} from "@/backend/repositories/financial-statement-import.repository";
import {
  statementConfirmSchema,
  type ParsedStatementConfirmInput,
} from "@/backend/schemas/financial-statement-import.schema";
import type { FinancialKind } from "@/backend/schemas/financial.schema";
import {
  parseStatementFile,
  parseStatementRows,
  type StatementColumnMapping,
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

function normalizeHeader(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function resolveHeaderByPriority(
  headers: string[],
  priorities: Array<{ score: number; pattern: RegExp }>,
  excludedColumns: number[] = [],
) {
  const matches = headers.flatMap((header, index) => {
    if (excludedColumns.includes(index)) return [];
    const normalized = normalizeHeader(header);
    const score = priorities.find(({ pattern }) =>
      pattern.test(normalized),
    )?.score;
    return score === undefined ? [] : [{ index, score }];
  });
  if (!matches.length) return -1;
  const highestScore = Math.max(...matches.map((match) => match.score));
  const strongestMatches = matches.filter(
    (match) => match.score === highestScore,
  );
  return strongestMatches.length === 1 ? strongestMatches[0].index : -2;
}

function inferDateFormat(rows: StatementRawRow[], dateColumn: number) {
  let detected: StatementColumnMapping["dateFormat"] | null = null;
  for (const row of rows.slice(0, 20)) {
    const value = row.values[dateColumn];
    if (typeof value === "number") continue;
    const text = String(value ?? "").trim();
    if (!text) continue;
    let format: StatementColumnMapping["dateFormat"] | null = null;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) format = "ISO";
    else {
      const parts = /^(\d{1,2})[./-](\d{1,2})[./-]\d{4}$/.exec(text);
      if (!parts) continue;
      const first = Number(parts[1]);
      const second = Number(parts[2]);
      if (first > 12 && second <= 12) format = "DMY";
      else if (second > 12 && first <= 12) format = "MDY";
    }
    if (format && detected && format !== detected) {
      throw new ApplicationError(
        "Não foi possível reconhecer com segurança as datas deste arquivo.",
        400,
      );
    }
    detected = format ?? detected;
  }
  return detected ?? "DMY";
}

function inferDecimalSeparator(rows: StatementRawRow[], columns: number[]) {
  let detected: StatementColumnMapping["decimalSeparator"] | null = null;
  for (const row of rows.slice(0, 30)) {
    for (const column of columns) {
      const value = row.values[column];
      if (typeof value === "number") continue;
      let text = String(value ?? "")
        .trim()
        .replace(/[\s\u00a0]/g, "")
        .replace(/^(R\$|BRL)/i, "")
        .replace(/(R\$|BRL)$/i, "")
        .replace(/[()]/g, "")
        .replace(/^[+-]/, "");
      if (!text) continue;
      const comma = text.lastIndexOf(",");
      const dot = text.lastIndexOf(".");
      let format: StatementColumnMapping["decimalSeparator"] | null = null;
      if (comma >= 0 && dot >= 0) {
        format = comma > dot ? "COMMA" : "DOT";
      } else if (comma >= 0 || dot >= 0) {
        const separator = comma >= 0 ? "," : ".";
        const trailingDigits = text.length - text.lastIndexOf(separator) - 1;
        if (trailingDigits > 0 && trailingDigits <= 2)
          format = separator === "," ? "COMMA" : "DOT";
        else if (trailingDigits > 2)
          format = separator === "," ? "DOT" : "COMMA";
      }
      if (format && detected && format !== detected) {
        throw new ApplicationError(
          "Não foi possível reconhecer com segurança os valores deste arquivo.",
          400,
        );
      }
      detected = format ?? detected;
    }
  }
  return detected ?? "COMMA";
}

function columnDataRatio(
  rows: StatementRawRow[],
  column: number,
  test: (value: unknown) => boolean,
) {
  const values = rows
    .slice(0, 20)
    .map((row) => row.values[column])
    .filter((value) => String(value ?? "").trim() !== "");
  return values.length ? values.filter(test).length / values.length : 0;
}

function hasExplicitAmountEvidence(rows: StatementRawRow[], column: number) {
  return rows.slice(0, 30).some((row) => {
    const value = row.values[column];
    if (typeof value === "number") {
      return Number.isFinite(value) && !Number.isInteger(value);
    }
    const text = String(value ?? "")
      .trim()
      .replace(/[\s\u00a0]/g, "");
    if (!text) return false;
    if (/^(?:R\$|BRL)/i.test(text) || /^(?:\(|[+-])/.test(text)) {
      return /\d/.test(text);
    }
    return /\d[,.]\d{1,2}$/.test(text);
  });
}

function defaultMapping(
  headers: string[],
  rows: StatementRawRow[],
): StatementColumnMapping {
  const dateCandidates = headers
    .map((_, index) => index)
    .filter(
      (index) =>
        columnDataRatio(rows, index, (value) =>
          typeof value === "number"
            ? value >= 20_000 && value <= 100_000
            : /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})$/.test(
                String(value).trim(),
              ),
        ) >= 0.7,
    );
  const dateColumn = resolveHeaderByPriority(headers, [
    {
      score: 110,
      pattern:
        /^(data lancamento|data transacao|transaction date|posting date)$/,
    },
    {
      score: 100,
      pattern:
        /\b(data lancamento|data transacao|data movimentacao|transaction date|posting date)\b/,
    },
    { score: 90, pattern: /^(data|date|dt)$/ },
    { score: 50, pattern: /\b(data|date|dt)\b/ },
  ]);
  if (dateColumn === -2) {
    throw new ApplicationError(
      "Não foi possível identificar com segurança a data deste arquivo.",
      400,
    );
  }
  if (dateColumn < 0 && dateCandidates.length > 1) {
    throw new ApplicationError(
      "Não foi possível identificar com segurança a data deste arquivo.",
      400,
    );
  }
  const resolvedDateColumn = dateColumn >= 0 ? dateColumn : dateCandidates[0];
  const descriptionColumn = resolveHeaderByPriority(
    headers,
    [
      {
        score: 100,
        pattern:
          /^(descricao|historico|lancamento|transacao|estabelecimento|memo|detalhe)$/,
      },
      {
        score: 90,
        pattern:
          /\b(descricao|historico|lancamento|transacao|estabelecimento|memo|detalhe)\b/,
      },
    ],
    resolvedDateColumn === undefined ? [] : [resolvedDateColumn],
  );
  if (descriptionColumn === -2) {
    throw new ApplicationError(
      "Não foi possível identificar com segurança a descrição deste arquivo.",
      400,
    );
  }
  const descriptionCandidates = headers
    .map((_, index) => index)
    .filter(
      (index) =>
        index !== resolvedDateColumn &&
        columnDataRatio(
          rows,
          index,
          (value) =>
            typeof value === "string" &&
            value.trim() !== "" &&
            Number.isNaN(Number(value.replace(/[,\.]/g, ""))),
        ) >= 0.7,
    );
  const resolvedDescriptionColumn =
    descriptionColumn >= 0
      ? descriptionColumn
      : descriptionCandidates.length === 1
        ? descriptionCandidates[0]
        : -1;
  if (
    resolvedDateColumn === undefined ||
    resolvedDescriptionColumn < 0 ||
    resolvedDateColumn === resolvedDescriptionColumn
  ) {
    throw new ApplicationError(
      "Não foi possível identificar automaticamente as colunas deste arquivo. Confira se ele é um extrato exportado pelo banco.",
      400,
    );
  }

  const debitColumn = resolveHeaderByPriority(headers, [
    { score: 100, pattern: /^(debito|debit|saida)$/ },
    { score: 90, pattern: /\b(debito|debit|saida)\b/ },
  ]);
  const creditColumn = resolveHeaderByPriority(headers, [
    { score: 100, pattern: /^(credito|credit|entrada)$/ },
    { score: 90, pattern: /\b(credito|credit|entrada)\b/ },
  ]);
  if (debitColumn === -2 || creditColumn === -2) {
    throw new ApplicationError(
      "Não foi possível identificar com segurança as colunas de entrada e saída deste arquivo.",
      400,
    );
  }
  const amountColumn = resolveHeaderByPriority(headers, [
    { score: 100, pattern: /^(valor|amount|montante)$/ },
    { score: 90, pattern: /\b(valor|amount|montante)\b/ },
    { score: 80, pattern: /\b(total|valor da transacao|transaction amount)\b/ },
  ]);
  if (amountColumn === -2) {
    throw new ApplicationError(
      "Não foi possível identificar com segurança a coluna de valores deste arquivo.",
      400,
    );
  }
  const base = {
    dateColumn: resolvedDateColumn,
    descriptionColumn: resolvedDescriptionColumn,
    dateFormat: inferDateFormat(rows, resolvedDateColumn),
  };
  if (debitColumn >= 0 && creditColumn >= 0) {
    return {
      ...base,
      debitColumn,
      creditColumn,
      decimalSeparator: inferDecimalSeparator(rows, [
        debitColumn,
        creditColumn,
      ]),
    };
  }
  const numericCandidates = headers
    .map((_, index) => index)
    .filter(
      (index) =>
        index !== resolvedDateColumn &&
        index !== resolvedDescriptionColumn &&
        hasExplicitAmountEvidence(rows, index) &&
        columnDataRatio(rows, index, (value) => {
          if (typeof value === "number") return Number.isFinite(value);
          const text = String(value).trim();
          return text === "" || /^[+-]?(?:R\$|BRL)?\s*[\d.,]+$/i.test(text);
        }) >= 0.7,
    );
  const resolvedAmountColumn =
    amountColumn >= 0 &&
    amountColumn !== resolvedDateColumn &&
    amountColumn !== resolvedDescriptionColumn
      ? amountColumn
      : numericCandidates.length === 1
        ? numericCandidates[0]
        : undefined;
  if (resolvedAmountColumn === undefined) {
    throw new ApplicationError(
      "Não foi possível identificar automaticamente a coluna de valores deste arquivo.",
      400,
    );
  }
  return {
    ...base,
    amountColumn: resolvedAmountColumn,
    decimalSeparator: inferDecimalSeparator(rows, [resolvedAmountColumn]),
  };
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
    /\b(?:PAGAMENTO|PAGTO|DEBITO)\s+(?:(?:DA|DE)\s+)?FATURA\s+(?:DO\s+)?CARTAO\b/.test(
      text,
    )
  ) {
    return "Fatura do cartão";
  }
  if (
    kind === "INCOME" &&
    /\bCREDITO EVENTO B3\b/.test(text) &&
    /\bPROV\b/.test(text) &&
    /\bRENDIMENTO\b/.test(text)
  ) {
    return "Proventos de investimentos";
  }
  if (
    kind === "EXPENSE" &&
    /\bDEBITO B3\b/.test(text) &&
    /\bNOTA BOV\b/.test(text)
  ) {
    return "Investimentos";
  }
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
        /\b(RESTAURANTE|LANCHES?|LANCHONETE|PIZZARIA|IFOOD|RAPPI|UBER EATS)\b/,
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
      patterns: [
        /\b(IPTU|IPVA|DARF|IOF|IMPOSTO|TRIBUTO|TAXA DE LICENCIAMENTO)\b/,
      ],
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
  if (suggestedCategory) return suggestedCategory;
  if (isGenericTransfer) {
    return kind === "EXPENSE"
      ? "Transferências enviadas"
      : "Transferências recebidas";
  }
  return null;
}

export class FinancialStatementImportService {
  async preview(
    file: { name: string; buffer: Buffer },
    _ignoredMapping?: unknown,
  ) {
    const parsedFile = parseStatementFile(file.name, file.buffer);
    const mapping = defaultMapping(parsedFile.headers, parsedFile.rows);
    const rows = parseStatementRows(parsedFile.rows, mapping);
    const recognizedDates = rows
      .map((row) => row.actualDate)
      .filter((date): date is string => Boolean(date))
      .sort();
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
      coverageStart: recognizedDates[0] ?? null,
      coverageEnd: recognizedDates.at(-1) ?? null,
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
    const input = assertSchema<ParsedStatementConfirmInput>(
      statementConfirmSchema,
      rawInput,
      "Revise os lançamentos antes de confirmar.",
    );
    const categories = await financialRepository.listCategories();
    if (
      input.rows.some(
        (row) =>
          row.categoryId !== null &&
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
    const result = await financialStatementImportRepository.confirm(input);
    return {
      ...result,
      skippedCount: result.alreadyImportedCount + result.duplicateCount,
    };
  }
}

export const financialStatementImportService =
  new FinancialStatementImportService();
