import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, read: vi.fn(actual.read), __actualRead: actual.read };
});

const positionParser = vi.hoisted(() => vi.fn());
const positionDocumentParser = vi.hoisted(() => vi.fn());
const movementParser = vi.hoisted(() => vi.fn());
const tradingParser = vi.hoisted(() => vi.fn());
vi.mock("@/backend/services/b3-position-xlsx-parser", () => ({
  b3PositionXlsxParser: {
    parse: positionParser,
    parseDocument: positionDocumentParser,
  },
}));
vi.mock("@/backend/services/b3-movement-xlsx-parser", () => ({
  parseB3MovementXlsx: movementParser,
}));
vi.mock("@/backend/services/b3-trading-xlsx-parser", () => ({
  parseB3TradingXlsx: tradingParser,
}));

import { parseB3Xlsx } from "@/backend/services/b3-xlsx-parser";

function workbookBuffer(headers: string[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headers]),
    "B3",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseB3Xlsx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects B3 movements before delegating to their parser", () => {
    movementParser.mockReturnValue([{ product: "CDB" }]);
    expect(
      parseB3Xlsx(workbookBuffer(["Entrada/Saída", "Movimentação", "Produto"])),
    ).toEqual({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }],
    });
    expect(positionParser).not.toHaveBeenCalled();
  });

  it("detects B3 trading rows on any worksheet", () => {
    tradingParser.mockReturnValue([{ assetCode: "BBSE3" }]);
    expect(
      parseB3Xlsx(workbookBuffer(["Data do Negócio", "Código de Negociação"])),
    ).toEqual({
      documentType: "B3_TRADING_XLSX",
      trades: [{ assetCode: "BBSE3" }],
    });
    expect(positionParser).not.toHaveBeenCalled();
  });

  it("skips missing worksheets while detecting a movement document", () => {
    const movementSheet = XLSX.utils.aoa_to_sheet([
      ["Entrada/Saída", "Movimentação", "Produto"],
    ]);
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ["Missing", "B3"],
      Sheets: { B3: movementSheet },
    } as XLSX.WorkBook);
    movementParser.mockReturnValue([{ product: "CDB" }]);

    expect(parseB3Xlsx(Buffer.from("xlsx"))).toEqual({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }],
    });
  });

  it("uses the existing position parser when the workbook has no first sheet", () => {
    positionDocumentParser.mockReturnValue({
      positions: [{ product: "ETF" }],
    });
    const read = vi
      .spyOn(XLSX, "read")
      .mockReturnValue({ SheetNames: [], Sheets: {} } as never);
    expect(parseB3Xlsx(Buffer.from("empty"))).toEqual({
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "ETF" }],
    });
    read.mockImplementation(
      (XLSX as unknown as { __actualRead: typeof XLSX.read }).__actualRead,
    );
  });
  it("delegates other worksheets to the existing position parser", () => {
    positionDocumentParser.mockReturnValue({
      positions: [{ product: "ETF" }],
    });
    expect(parseB3Xlsx(workbookBuffer(["Produto", "Quantidade"]))).toEqual({
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "ETF" }],
    });
  });

  it("does not classify a position sheet with only one movement header as movement", () => {
    positionDocumentParser.mockReturnValue({
      positions: [{ product: "Renda fixa" }],
    });

    expect(parseB3Xlsx(workbookBuffer(["Entrada/Saída", "Produto"]))).toEqual({
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "Renda fixa" }],
    });
    expect(movementParser).not.toHaveBeenCalled();
  });
});
