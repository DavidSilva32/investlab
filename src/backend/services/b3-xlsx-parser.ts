import * as XLSX from "xlsx";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  b3PositionXlsxParser,
  type ParsedB3Position,
} from "@/backend/services/b3-position-xlsx-parser";
import {
  parseB3MovementXlsx,
  type ParsedB3Movement,
} from "@/backend/services/b3-movement-xlsx-parser";
import {
  parseB3TradingXlsx,
  type ParsedB3Trade,
} from "@/backend/services/b3-trading-xlsx-parser";
import {
  parseB3ProventoXlsx,
  type ParsedB3Provento,
} from "@/backend/services/b3-provento-xlsx-parser";

export type ParsedB3Import =
  | {
      documentType: "B3_POSITION_XLSX";
      positions: ParsedB3Position[];
    }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: ParsedB3Movement[] }
  | { documentType: "B3_TRADING_XLSX"; trades: ParsedB3Trade[] }
  | { documentType: "B3_PROVENTO_XLSX"; proventos: ParsedB3Provento[] };
const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export function parseB3Xlsx(file: Buffer): ParsedB3Import {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const rows = workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    return sheet
      ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: "",
          raw: true,
        })
      : [];
  });
  const headerRows = rows.map((row) => row.map(normalizeHeader));
  const tradingHeaders = headerRows.find((headers) =>
    headers.includes("data do negocio"),
  );
  if (tradingHeaders)
    return {
      documentType: "B3_TRADING_XLSX",
      trades: parseB3TradingXlsx(file),
    };
  const headers = headerRows.find((row) => row.includes("produto")) ?? [];
  if (headers.includes("entrada/saida") && headers.includes("movimentacao"))
    return {
      documentType: "B3_MOVEMENT_XLSX",
      movements: parseB3MovementXlsx(file),
    };
  if (
    headerRows.some(
      (row) =>
        row.includes("produto") &&
        row.includes("tipo de evento") &&
        row.includes("instituicao") &&
        row.includes("quantidade") &&
        row.includes("preco unitario") &&
        row.includes("valor liquido") &&
        (row.includes("pagamento") || row.includes("previsao de pagamento")),
    )
  )
    return {
      documentType: "B3_PROVENTO_XLSX",
      proventos: parseB3ProventoXlsx(file),
    };
  const positionHeadersRecognized = headerRows.some(
    (row) =>
      row.includes("produto") &&
      row.includes("quantidade") &&
      [
        "valor atual",
        "valor atualizado",
        "valor total",
        "valor atualizado mtm",
        "valor atualizado curva",
        "valor atualizado fechamento",
        "valor de fechamento",
      ].some((header) => row.includes(header)),
  );
  if (!positionHeadersRecognized)
    throw new ApplicationError(
      "A planilha não corresponde a um formato B3 reconhecido.",
      422,
    );
  return {
    documentType: "B3_POSITION_XLSX",
    ...b3PositionXlsxParser.parseDocument(file),
  };
}
