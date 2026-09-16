import * as XLSX from "xlsx";
import { ApplicationError } from "@/backend/errors/application-error";

export type ParsedB3Movement = {
  direction: "CREDITO" | "DEBITO";
  occurredAt: string;
  movementType: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
};

const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};
const text = (value: unknown) => String(value ?? "").trim() || null;
export const extractAssetCode = (product: string) =>
  product.match(/(?:^|\s-\s)([A-Z]{2,}\d[A-Z0-9]*)\b/)?.[1] ?? null;

export function parseB3MovementXlsx(file: Buffer): ParsedB3Movement[] {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new ApplicationError("A planilha não possui abas.", 422);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const headerRow = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "movimentacao"),
  );
  if (headerRow < 0)
    throw new ApplicationError(
      "O arquivo não corresponde ao formato de movimentações da B3.",
      422,
    );
  const headers = rows[headerRow].map(normalizeHeader);
  const required = [
    "entrada/saida",
    "data",
    "movimentacao",
    "produto",
    "quantidade",
  ];
  if (required.some((header) => !headers.includes(header)))
    throw new ApplicationError(
      "A planilha B3 não possui as colunas obrigatórias.",
      422,
    );
  const column = (name: string) => headers.indexOf(name);
  const value = (row: unknown[], name: string) => row[column(name)];
  const movements = rows.slice(headerRow + 1).flatMap((row) => {
    const product = text(value(row, "produto"));
    const quantity = decimal(value(row, "quantidade"));
    if (!product && !quantity) return [];
    const rawDirection = normalizeHeader(value(row, "entrada/saida"));
    const direction: ParsedB3Movement["direction"] | null =
      rawDirection === "credito"
        ? "CREDITO"
        : rawDirection === "debito"
          ? "DEBITO"
          : null;
    const occurredAt = date(value(row, "data"));
    const movementType = text(value(row, "movimentacao"));
    if (!direction || !occurredAt || !movementType || !product || !quantity)
      throw new ApplicationError(
        "Há uma movimentação sem dados obrigatórios válidos.",
        422,
      );
    return [
      {
        direction,
        occurredAt,
        movementType,
        product,
        assetCode: extractAssetCode(product),
        institution: text(value(row, "instituicao")),
        quantity,
        unitPrice: decimal(value(row, "preco unitario")),
        operationValue: decimal(value(row, "valor da operacao")),
      },
    ];
  });
  if (!movements.length)
    throw new ApplicationError(
      "Nenhuma movimentação foi encontrada na planilha.",
      422,
    );
  return movements;
}
