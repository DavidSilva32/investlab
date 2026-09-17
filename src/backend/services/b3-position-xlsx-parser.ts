import * as XLSX from "xlsx";

import { ApplicationError } from "@/backend/errors/application-error";

export type ParsedB3PositionDocument = {
  estimationBaseDate: string | null;
  positions: ParsedB3Position[];
};
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
  valuationSource: "MTM" | "CURVA" | "FECHAMENTO" | "INFORMADO" | null;
  mtmUnitPrice: string | null;
  mtmTotalValue: string | null;
  curveUnitPrice: string | null;
  curveTotalValue: string | null;
  closingUnitPrice: string | null;
  closingTotalValue: string | null;
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
  const normalized = String(value)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
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

type Valuation = {
  source: ParsedB3Position["valuationSource"];
  unitPrice: string | null;
  totalValue: string | null;
};

const selectValuation = (valuations: Valuation[]) =>
  valuations.find(
    (valuation) => valuation.unitPrice || valuation.totalValue,
  ) ?? {
    source: null,
    unitPrice: null,
    totalValue: null,
  };
const estimationBaseDate = (workbook: XLSX.WorkBook, fileName?: string) => {
  const created = workbook.Props?.CreatedDate;
  if (created instanceof Date && !Number.isNaN(created.getTime()))
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(created);
  const match = fileName?.match(
    /^posicao-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}-\d{2}\.xlsx$/i,
  );
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};
function parseB3PositionXlsx(
  file: Buffer,
  fileName?: string,
): ParsedB3PositionDocument {
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
    const directValuation = {
      source: "INFORMADO" as const,
      unitPrice: parseDecimal(value(row, ["preco unitario", "preco atual"])),
      totalValue: parseDecimal(
        value(row, ["valor atual", "valor atualizado", "valor total"]),
      ),
    };
    const mtmValuation = {
      source: "MTM" as const,
      unitPrice: parseDecimal(value(row, ["preco atualizado mtm"])),
      totalValue: parseDecimal(value(row, ["valor atualizado mtm"])),
    };
    const curveValuation = {
      source: "CURVA" as const,
      unitPrice: parseDecimal(value(row, ["preco atualizado curva"])),
      totalValue: parseDecimal(value(row, ["valor atualizado curva"])),
    };
    const closingValuation = {
      source: "FECHAMENTO" as const,
      unitPrice: parseDecimal(
        value(row, ["preco atualizado fechamento", "preco de fechamento"]),
      ),
      totalValue: parseDecimal(
        value(row, ["valor atualizado fechamento", "valor de fechamento"]),
      ),
    };
    const selectedValuation = selectValuation([
      mtmValuation,
      curveValuation,
      closingValuation,
      directValuation,
    ]);
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
        unitPrice: selectedValuation.unitPrice,
        totalValue: selectedValuation.totalValue,
        valuationSource: selectedValuation.source,
        mtmUnitPrice: mtmValuation.unitPrice,
        mtmTotalValue: mtmValuation.totalValue,
        curveUnitPrice: curveValuation.unitPrice,
        curveTotalValue: curveValuation.totalValue,
        closingUnitPrice: closingValuation.unitPrice,
        closingTotalValue: closingValuation.totalValue,
      },
    ];
  });

  if (!positions.length)
    throw new ApplicationError(
      "Nenhuma posição foi encontrada na planilha.",
      422,
    );
  return {
    positions,
    estimationBaseDate: estimationBaseDate(workbook, fileName),
  };
}

export class B3PositionXlsxParser {
  parse(file: Buffer, fileName?: string): ParsedB3Position[] {
    return parseB3PositionXlsx(file, fileName).positions;
  }
  parseDocument(file: Buffer, fileName?: string): ParsedB3PositionDocument {
    return parseB3PositionXlsx(file, fileName);
  }
}
export const b3PositionXlsxParser = new B3PositionXlsxParser();
