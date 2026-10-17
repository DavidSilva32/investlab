import * as XLSX from "xlsx";

import { ApplicationError } from "@/backend/errors/application-error";
import {
  classifyInstrumentKind,
  type InstrumentKind,
} from "@/lib/instrument-kind";

export type ParsedB3PositionDocument = {
  positions: ParsedB3Position[];
};
export type ParsedB3Position = {
  sourceSheet: string;
  sourceRow: number;
  instrumentKind: InstrumentKind;
  product: string;
  institution: string | null;
  account: string | null;
  issuer: string | null;
  issuerCnpj: string | null;
  sourceType: string | null;
  assetCode: string | null;
  originalAssetCode: string | null;
  isin: string | null;
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

const normalizeAssetCode = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLocaleUpperCase("pt-BR");
  return normalized.match(/^([A-Z]{4}\d{1,2})F$/)?.[1] ?? normalized;
};

type Valuation = {
  source: ParsedB3Position["valuationSource"];
  unitPrice: string | null;
  totalValue: string | null;
};

const selectValuation = (valuations: Valuation[]) =>
  valuations.find((valuation) => valuation.totalValue) ??
  valuations.find((valuation) => valuation.unitPrice) ?? {
    source: null,
    unitPrice: null,
    totalValue: null,
  };
function parseB3PositionXlsx(file: Buffer): ParsedB3PositionDocument {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0)
    throw new ApplicationError("A planilha não possui abas.", 422);
  const positions = sheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => normalizeHeader(cell) === "produto"),
    );
    if (headerRowIndex < 0) return [];
    const headers = rows[headerRowIndex].map(normalizeHeader);
    if (!["produto", "quantidade"].every((header) => headers.includes(header)))
      return [];
    const column = (names: string[]) =>
      names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ??
      -1;
    const value = (row: unknown[], names: string[]) => row[column(names)];

    return rows.slice(headerRowIndex + 1).flatMap((row, rowIndex) => {
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
          sourceSheet: sheetName,
          sourceRow: headerRowIndex + rowIndex + 2,
          instrumentKind: classifyInstrumentKind({
            sourceSheet: sheetName,
            sourceType: text(value(row, ["tipo"])),
            product,
          }),
          product,
          institution: text(value(row, ["instituicao"])),
          account: text(value(row, ["conta", "conta investimento"])),
          issuer: text(value(row, ["emissor"])),
          issuerCnpj: text(value(row, ["cnpj da empresa", "cnpj do fundo"])),
          sourceType: text(value(row, ["tipo"])),
          assetCode: normalizeAssetCode(
            text(value(row, ["codigo de negociacao", "codigo"])),
          ),
          originalAssetCode: text(
            value(row, ["codigo de negociacao", "codigo"]),
          ),
          isin: text(value(row, ["isin", "codigo isin / distribuicao"])),
          indexer: text(value(row, ["indexador"])),
          regimeType: text(value(row, ["tipo de regime"])),
          issuedAt: parseDate(value(row, ["data de emissao"])),
          maturityAt: parseDate(value(row, ["vencimento"])),
          quantity,
          availableQuantity: parseDecimal(
            value(row, ["quantidade disponivel"]),
          ),
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
  });

  if (!positions.length)
    throw new ApplicationError(
      "Nenhuma posição foi encontrada na planilha.",
      422,
    );
  return { positions };
}

export class B3PositionXlsxParser {
  parse(file: Buffer): ParsedB3Position[] {
    return parseB3PositionXlsx(file).positions;
  }
  parseDocument(file: Buffer): ParsedB3PositionDocument {
    return parseB3PositionXlsx(file);
  }
}
export const b3PositionXlsxParser = new B3PositionXlsxParser();
