import * as XLSX from "xlsx";

import { ApplicationError } from "@/backend/errors/application-error";

export type ParsedB3Position = {
  product: string;
  institution: string | null;
  issuer: string | null;
  assetCode: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  quantity: string;
  availableQuantity: string | null;
  unavailableQuantity: string | null;
  unitPrice: string | null;
  totalValue: string | null;
};

const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseDecimal = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value.toString();
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
};

const parseDate = (value: unknown): string | null => {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date)
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const text = (value: unknown) => {
  const valueAsText = String(value ?? "").trim();
  return valueAsText || null;
};

function parseB3PositionXlsx(file: Buffer): ParsedB3Position[] {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  /* v8 ignore next -- XLSX refuses to create a workbook without worksheets. */
  if (!firstSheet)
    throw new ApplicationError("A planilha não possui abas.", 422);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "produto"),
  );
  if (headerRowIndex < 0)
    throw new ApplicationError(
      "O arquivo não corresponde ao formato de posições da B3.",
      422,
    );

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const required = ["produto", "quantidade"];
  if (required.some((header) => !headers.includes(header)))
    throw new ApplicationError(
      "A planilha B3 não possui as colunas obrigatórias.",
      422,
    );
  const column = (names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ??
    -1;
  const value = (row: unknown[], names: string[]) => row[column(names)];

  const positions = rows.slice(headerRowIndex + 1).flatMap((row) => {
    const product = text(value(row, ["produto"]));
    const quantity = parseDecimal(value(row, ["quantidade"]));
    if (!product && !quantity) return [];
    if (!product || !quantity)
      throw new ApplicationError(
        "Há uma posição sem produto ou quantidade válida.",
        422,
      );
    return [
      {
        product,
        institution: text(value(row, ["instituicao"])),
        issuer: text(value(row, ["emissor"])),
        assetCode: text(value(row, ["codigo"])),
        indexer: text(value(row, ["indexador"])),
        regimeType: text(value(row, ["tipo de regime"])),
        issuedAt: parseDate(value(row, ["data de emissao"])),
        maturityAt: parseDate(value(row, ["vencimento"])),
        quantity,
        availableQuantity: parseDecimal(value(row, ["quantidade disponivel"])),
        unavailableQuantity: parseDecimal(
          value(row, ["quantidade indisponivel"]),
        ),
        unitPrice: parseDecimal(
          value(row, ["preco unitario", "preco de fechamento", "preco atual"]),
        ),
        totalValue: parseDecimal(
          value(row, ["valor atual", "valor atualizado", "valor total"]),
        ),
      },
    ];
  });

  if (!positions.length)
    throw new ApplicationError(
      "Nenhuma posição foi encontrada na planilha.",
      422,
    );
  return positions;
}

export class B3PositionXlsxParser {
  parse(file: Buffer): ParsedB3Position[] {
    return parseB3PositionXlsx(file);
  }
}

export const b3PositionXlsxParser = new B3PositionXlsxParser();
