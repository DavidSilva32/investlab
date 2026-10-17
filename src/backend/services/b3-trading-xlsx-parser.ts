import * as XLSX from "xlsx";
import { ApplicationError } from "@/backend/errors/application-error";

export type ParsedB3Trade = {
  side: "BUY" | "SELL";
  tradingDate: string;
  settlementDate: null;
  movementType: string;
  market: string | null;
  product: string;
  assetCode: string | null;
  originalAssetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  grossValue: string | null;
  fees: null;
  sourceRow: number;
};

const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const requiredHeaders = [
  "data do negocio",
  "tipo de movimentacao",
  "codigo de negociacao",
  "quantidade",
  "preco",
  "valor",
];

const text = (value: unknown) => String(value ?? "").trim() || null;

const decimal = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return String(value);
  const normalized = String(value)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
};

const date = (value: unknown) => {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed)
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const match = String(value)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsedDate = new Date(`${isoDate}T00:00:00.000Z`);
  return parsedDate.toISOString().slice(0, 10) === isoDate ? isoDate : null;
};

const normalizeAssetCode = (value: string | null) => {
  if (!value) return null;
  const normalized = value.toLocaleUpperCase("pt-BR");
  return normalized.match(/^([A-Z]{4}\d{1,2})F$/)?.[1] ?? normalized;
};

export function parseB3TradingXlsx(file: Buffer): ParsedB3Trade[] {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return false;
    return XLSX.utils
      .sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: true,
      })
      .some((row) =>
        requiredHeaders.every((header) =>
          row.some((cell) => normalizeHeader(cell) === header),
        ),
      );
  });
  if (!sheetName)
    throw new ApplicationError(
      "O arquivo não corresponde ao formato de negociações da B3.",
      422,
    );
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName]!,
    {
      header: 1,
      defval: "",
      raw: true,
    },
  );
  const headerIndex = rows.findIndex((row) =>
    requiredHeaders.every((header) =>
      row.some((cell) => normalizeHeader(cell) === header),
    ),
  );
  const headers = rows[headerIndex].map(normalizeHeader);
  const value = (row: unknown[], name: string) => row[headers.indexOf(name)];
  const trades = rows.slice(headerIndex + 1).flatMap((row, rowIndex) => {
    if (row.every((cell) => String(cell).trim() === "")) return [];
    const movementType = text(value(row, "tipo de movimentacao"));
    const rawSide = normalizeHeader(movementType);
    const side: ParsedB3Trade["side"] | null =
      rawSide === "compra" ? "BUY" : rawSide === "venda" ? "SELL" : null;
    const tradingDate = date(value(row, "data do negocio"));
    const originalAssetCode = text(value(row, "codigo de negociacao"));
    const assetCode = normalizeAssetCode(originalAssetCode);
    const quantity = decimal(value(row, "quantidade"));
    const unitPrice = decimal(value(row, "preco"));
    const grossValue = decimal(value(row, "valor"));
    if (
      !movementType ||
      !side ||
      !tradingDate ||
      !originalAssetCode ||
      !quantity ||
      !unitPrice ||
      !grossValue
    )
      throw new ApplicationError(
        "Há uma negociação sem dados obrigatórios válidos.",
        422,
      );
    return [
      {
        side,
        tradingDate,
        settlementDate: null,
        movementType,
        market: text(value(row, "mercado")),
        product: originalAssetCode,
        assetCode,
        originalAssetCode,
        institution: text(value(row, "instituicao")),
        quantity,
        unitPrice,
        grossValue,
        fees: null,
        sourceRow: headerIndex + rowIndex + 2,
      },
    ];
  });
  if (!trades.length)
    throw new ApplicationError(
      "Nenhuma negociação foi encontrada na planilha.",
      422,
    );
  return trades;
}
