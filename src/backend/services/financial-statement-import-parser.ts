import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { ApplicationError } from "@/backend/errors/application-error";
import type { FinancialKind } from "@/backend/schemas/financial.schema";

export type StatementRawValue = string | number | boolean;
export type StatementRawRow = {
  sourceRow: number;
  values: StatementRawValue[];
};
export type StatementColumnMapping = {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: "DMY" | "MDY" | "ISO";
  decimalSeparator: "COMMA" | "DOT";
};

export type ParsedStatementRow = {
  sourceRow: number;
  kind: FinancialKind | null;
  description: string;
  actualDate: string | null;
  amount: number | null;
  errors: string[];
};

const MAX_STATEMENT_ROWS = 500;
const MAX_HEADER_SEARCH_ROWS = 20;
const MAX_STATEMENT_COLUMNS = 200;
const MAX_SHEET_ROWS = MAX_STATEMENT_ROWS + MAX_HEADER_SEARCH_ROWS + 1;
const MAX_DELIMITER_SAMPLE_CHARS = 128 * 1024;

function parseCsv(
  text: string,
  delimiter: string,
  options: {
    maxRows: number;
    stopAfterMaxRows?: boolean;
    allowIncompleteTail?: boolean;
    includeFinalRecord?: boolean;
  },
): StatementRawValue[][] {
  const rows: StatementRawValue[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let stopped = false;
  const appendField = () => {
    row.push(field);
    field = "";
    if (row.length > MAX_STATEMENT_COLUMNS) {
      throw new ApplicationError(
        "A planilha pode ter no máximo 200 colunas.",
        400,
      );
    }
  };
  const appendRecord = () => {
    appendField();
    if (row.some((value) => value.trim() !== "")) {
      if (rows.length >= options.maxRows) {
        if (options.stopAfterMaxRows) {
          stopped = true;
          return;
        }
        throw new ApplicationError(
          "O arquivo pode ter no máximo 500 lançamentos.",
          400,
        );
      }
      rows.push(row);
    }
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      appendField();
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      appendRecord();
      if (
        stopped ||
        (options.stopAfterMaxRows && rows.length >= options.maxRows)
      )
        break;
    } else field += character;
  }
  if (
    !stopped &&
    options.includeFinalRecord !== false &&
    (field || row.length)
  ) {
    appendRecord();
  }
  if (quoted && !options.allowIncompleteTail)
    throw new ApplicationError(
      "O CSV contém um campo entre aspas que não foi fechado.",
      400,
    );
  return rows;
}

function headerScore(row: StatementRawValue[]) {
  const values = row.map((value) =>
    String(value).trim().toLocaleLowerCase("pt-BR"),
  );
  const dateIndex = values.findIndex(
    (value) => value.includes("data") || value === "date",
  );
  const descriptionIndex = values.findIndex(
    (value, index) =>
      index !== dateIndex &&
      ["descri", "histórico", "historico", "description", "memo"].some(
        (token) => value.includes(token),
      ),
  );
  const amountIndex = values.findIndex(
    (value, index) =>
      index !== dateIndex &&
      index !== descriptionIndex &&
      [
        "valor",
        "amount",
        "montante",
        "débito",
        "debito",
        "crédito",
        "credito",
        "debit",
        "credit",
      ].some((token) => value.includes(token)),
  );
  return (
    Number(dateIndex >= 0) +
    Number(descriptionIndex >= 0) +
    Number(amountIndex >= 0)
  );
}

function chooseCsvDelimiter(text: string) {
  const candidates = [";", ",", "\t", "|"];
  const sample = text.slice(0, MAX_DELIMITER_SAMPLE_CHARS);
  const columnOverflowCandidates: string[] = [];
  const candidatesWithScores = candidates.flatMap((delimiter) => {
    try {
      const parsed = parseCsv(sample, delimiter, {
        maxRows: MAX_HEADER_SEARCH_ROWS,
        stopAfterMaxRows: true,
        allowIncompleteTail: sample.length < text.length,
        includeFinalRecord: sample.length === text.length,
      });
      const bestHeader = Math.max(0, ...parsed.map(headerScore));
      const widest = Math.max(0, ...parsed.map((row) => row.length));
      return [
        {
          delimiter,
          parsed,
          score: bestHeader * 100 + (widest > 1 ? widest : 0),
        },
      ];
    } catch (caught) {
      if (
        caught instanceof ApplicationError &&
        caught.message === "A planilha pode ter no máximo 200 colunas."
      ) {
        columnOverflowCandidates.push(delimiter);
      }
      return [];
    }
  });
  const best = candidatesWithScores.sort(
    (left, right) => right.score - left.score,
  )[0];
  if (best && best.score >= 200) {
    return { delimiter: best.delimiter, headerRow: headerIndex(best.parsed) };
  }
  if (columnOverflowCandidates.length) {
    return { delimiter: columnOverflowCandidates[0], headerRow: 0 };
  }
  if (!best) {
    throw new ApplicationError(
      "Não foi possível identificar as colunas do CSV.",
      400,
    );
  }
  return { delimiter: best.delimiter, headerRow: headerIndex(best.parsed) };
}

function headerIndex(rows: StatementRawValue[][]) {
  const candidates = rows
    .slice(0, 20)
    .map((row, index) => ({ index, score: headerScore(row) }));
  return candidates.find((candidate) => candidate.score === 3)?.index ?? 0;
}

export function parseStatementFile(
  fileName: string,
  buffer: Buffer,
): { hash: string; headers: string[]; rows: StatementRawRow[] } {
  if (!/\.(csv|xls|xlsx)$/i.test(fileName)) {
    throw new ApplicationError("Use um arquivo CSV, XLS ou XLSX.", 400);
  }
  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    throw new ApplicationError("O arquivo deve ter até 5 MB.", 400);
  }

  let matrix: StatementRawValue[][];
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
    const selected = chooseCsvDelimiter(text);
    matrix = parseCsv(text, selected.delimiter, {
      maxRows: selected.headerRow + MAX_STATEMENT_ROWS + 1,
    });
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    } catch {
      throw new ApplicationError("Não foi possível ler este arquivo.", 400);
    }
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!firstSheet)
      throw new ApplicationError("O arquivo não contém uma tabela.", 400);
    const reference = firstSheet["!ref"];
    if (!reference)
      throw new ApplicationError("O arquivo não contém uma tabela.", 400);
    let range: XLSX.Range;
    try {
      range = XLSX.utils.decode_range(reference);
    } catch {
      throw new ApplicationError("Não foi possível ler este arquivo.", 400);
    }
    if (range.e.r + 1 > MAX_SHEET_ROWS) {
      throw new ApplicationError(
        "O arquivo pode ter no máximo 500 lançamentos.",
        400,
      );
    }
    if (range.e.c + 1 > MAX_STATEMENT_COLUMNS) {
      throw new ApplicationError(
        "A planilha pode ter no máximo 200 colunas.",
        400,
      );
    }
    matrix = XLSX.utils.sheet_to_json<StatementRawValue[]>(firstSheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
  }
  const headerRow = headerIndex(matrix);
  const rows = matrix.slice(headerRow);
  if (rows.length < 2) {
    throw new ApplicationError(
      "A planilha precisa ter cabeçalho e lançamentos.",
      400,
    );
  }
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ""));
  if (dataRows.length > MAX_STATEMENT_ROWS) {
    throw new ApplicationError(
      "O arquivo pode ter no máximo 500 lançamentos.",
      400,
    );
  }

  const width = Math.max(...rows.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => {
    const value = rows[0]?.[index];
    const header = String(value ?? "").trim();
    return header || `Coluna ${index + 1}`;
  });
  const rawRows: StatementRawRow[] = rows.slice(1).flatMap((row, index) =>
    row.some((value) => String(value).trim() !== "")
      ? [
          {
            sourceRow: headerRow + index + 2,
            values: Array.from({ length: width }, (_, column) => {
              const value = row[column];
              return typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
                ? value
                : String(value ?? "");
            }),
          },
        ]
      : [],
  );

  return {
    hash: createHash("sha256").update(buffer).digest("hex"),
    headers,
    rows: rawRows,
  };
}

function cell(row: StatementRawRow, index: number) {
  return row.values[index] ?? "";
}

function parseDate(
  value: StatementRawValue,
  format: StatementColumnMapping["dateFormat"],
): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y >= 1900 && parsed.y <= 2200) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    return null;
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso && format === "ISO")
    return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (!parts || format === "ISO") return null;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const year = Number(parts[3]);
  const day = format === "DMY" ? first : second;
  const month = format === "DMY" ? second : first;
  return validDate(year, month, day);
}

function validDate(year: number, month: number, day: number) {
  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function parseAmount(
  value: StatementRawValue,
  decimalSeparator: StatementColumnMapping["decimalSeparator"],
): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  let text = String(value)
    .trim()
    .replace(/[\s\u00a0]/g, "");
  if (!text) return 0;
  text = text.replace(/^(R\$|BRL)/i, "").replace(/(R\$|BRL)$/i, "");
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^[+-]/, "");
  const decimal = decimalSeparator === "COMMA" ? "," : ".";
  const thousands = decimalSeparator === "COMMA" ? "." : ",";
  if ((text.match(new RegExp(`\\${decimal}`, "g")) ?? []).length > 1)
    return null;
  const [whole = "", fraction = ""] = text.split(decimal);
  if (fraction.length > 2 || !/^\d{1,3}(?:[.,]\d{3})*$|^\d+$/.test(whole))
    return null;
  const normalized = `${whole.replace(new RegExp(`\\${thousands}`, "g"), "")}${fraction ? `.${fraction}` : ""}`;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999_999_999.99)
    return null;
  return negative ? -parsed : parsed;
}

export function parseStatementRows(
  rows: StatementRawRow[],
  mapping: StatementColumnMapping,
): ParsedStatementRow[] {
  const signedAmount = mapping.amountColumn !== undefined;
  return rows.map((row) => {
    const errors: string[] = [];
    const description = String(cell(row, mapping.descriptionColumn)).trim();
    const actualDate = parseDate(
      cell(row, mapping.dateColumn),
      mapping.dateFormat,
    );
    if (!description) errors.push("Informe a descrição.");
    if (description.length > 120)
      errors.push("A descrição deve ter até 120 caracteres.");
    if (!actualDate) errors.push("Confira a data e o formato selecionado.");

    let amount: number | null = null;
    let kind: ParsedStatementRow["kind"] = null;
    if (signedAmount) {
      const signed = parseAmount(
        cell(row, mapping.amountColumn!),
        mapping.decimalSeparator,
      );
      if (signed === null)
        errors.push("Confira o valor e o separador decimal.");
      else if (signed === 0) errors.push("O valor precisa ser maior que zero.");
      else {
        kind = signed > 0 ? "INCOME" : "EXPENSE";
        amount = Math.abs(signed);
      }
    } else {
      const debitValue = cell(row, mapping.debitColumn!);
      const creditValue = cell(row, mapping.creditColumn!);
      const debitText = String(debitValue).trim();
      const creditText = String(creditValue).trim();
      const debit = parseAmount(debitValue, mapping.decimalSeparator);
      const credit = parseAmount(creditValue, mapping.decimalSeparator);
      if (debit === null || credit === null)
        errors.push("Confira os valores de débito e crédito.");
      else if (debitText && creditText)
        errors.push("A linha tem débito e crédito; revise antes de importar.");
      else if (debit > 0) {
        kind = "EXPENSE";
        amount = debit;
      } else if (credit > 0) {
        kind = "INCOME";
        amount = credit;
      } else
        errors.push("A linha precisa ter um débito ou crédito maior que zero.");
    }
    return {
      sourceRow: row.sourceRow,
      kind,
      description,
      actualDate,
      amount,
      errors,
    };
  });
}
