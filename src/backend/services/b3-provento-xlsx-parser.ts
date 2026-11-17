import * as XLSX from "xlsx";
import { ApplicationError } from "@/backend/errors/application-error";

export type ParsedB3Provento = {
  status: "RECEIVED" | "UPCOMING";
  sourceSheet: string;
  sourceRow: number;
  product: string;
  eventType: string;
  paymentDate: string;
  institution: string | null;
  quantity: string;
  unitPrice: string;
  netValue: string;
};

const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function parseDate(value: unknown) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date)
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

function parseDecimal(value: unknown) {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : null;
  const text = String(value ?? "")
    .trim()
    .replace(/^R\$\s*/i, "");
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return /^\d+(?:\.\d+)?$/.test(normalized) &&
    Number.isFinite(Number(normalized))
    ? normalized
    : null;
}

function parseSheet(sheetName: string, sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes("produto") &&
      headers.includes("tipo de evento") &&
      headers.includes("instituicao") &&
      headers.includes("quantidade") &&
      headers.includes("preco unitario") &&
      headers.includes("valor liquido") &&
      (headers.includes("pagamento") ||
        headers.includes("previsao de pagamento"))
    );
  });
  if (headerRowIndex < 0) return null;

  const headers = rows[headerRowIndex]!.map(normalizeHeader);
  const upcoming = headers.includes("previsao de pagamento");
  const column = (name: string) => headers.indexOf(name);
  const value = (row: unknown[], name: string) => row[column(name)];
  const dateColumn = upcoming ? "previsao de pagamento" : "pagamento";
  const records: ParsedB3Provento[] = [];

  rows.slice(headerRowIndex + 1).forEach((row, rowOffset) => {
    const product = String(value(row, "produto") ?? "").trim();
    if (!product) return; // Ignores blank rows and footer totals.
    const eventType = String(value(row, "tipo de evento") ?? "").trim();
    const paymentDate = parseDate(value(row, dateColumn));
    const quantity = parseDecimal(value(row, "quantidade"));
    const unitPrice = parseDecimal(value(row, "preco unitario"));
    const netValue = parseDecimal(value(row, "valor liquido"));
    if (
      !eventType ||
      paymentDate === null ||
      quantity === null ||
      unitPrice === null ||
      netValue === null
    )
      throw new ApplicationError(
        "Há um provento sem evento, data ou valor válido na planilha.",
        422,
      );
    const institution = String(value(row, "instituicao") ?? "").trim();
    records.push({
      status: upcoming ? "UPCOMING" : "RECEIVED",
      sourceSheet: sheetName,
      sourceRow: headerRowIndex + rowOffset + 2,
      product,
      eventType,
      paymentDate,
      institution: institution || null,
      quantity,
      unitPrice,
      netValue,
    });
  });
  if (!records.length)
    throw new ApplicationError(
      "A planilha de proventos não contém registros.",
      422,
    );
  return records;
}

export function parseB3ProventoXlsx(file: Buffer) {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const records = parseSheet(sheetName, sheet);
    if (records) return records;
  }
  throw new ApplicationError(
    "O arquivo não corresponde aos formatos de proventos recebidos ou a receber da B3.",
    422,
  );
}
