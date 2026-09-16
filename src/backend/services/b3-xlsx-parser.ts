import * as XLSX from "xlsx";
import {
  b3PositionXlsxParser,
  type ParsedB3Position,
} from "@/backend/services/b3-position-xlsx-parser";
import {
  parseB3MovementXlsx,
  type ParsedB3Movement,
} from "@/backend/services/b3-movement-xlsx-parser";
export type ParsedB3Import =
  | { documentType: "B3_POSITION_XLSX"; positions: ParsedB3Position[] }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: ParsedB3Movement[] };
const normalizeHeader = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export function parseB3Xlsx(file: Buffer): ParsedB3Import {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: true,
      })
    : [];
  const headers =
    rows
      .find((row) => row.some((cell) => normalizeHeader(cell) === "produto"))
      ?.map(normalizeHeader) ?? [];
  if (headers.includes("entrada/saida") && headers.includes("movimentacao"))
    return {
      documentType: "B3_MOVEMENT_XLSX",
      movements: parseB3MovementXlsx(file),
    };
  return {
    documentType: "B3_POSITION_XLSX",
    positions: b3PositionXlsxParser.parse(file),
  };
}
