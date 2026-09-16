import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, read: vi.fn(actual.read), __actualRead: actual.read };
});

const positionParser = vi.hoisted(() => vi.fn());
const movementParser = vi.hoisted(() => vi.fn());
vi.mock("@/backend/services/b3-position-xlsx-parser", () => ({
  b3PositionXlsxParser: { parse: positionParser },
}));
vi.mock("@/backend/services/b3-movement-xlsx-parser", () => ({
  parseB3MovementXlsx: movementParser,
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

  it("uses the existing position parser when the workbook has no first sheet", () => {
    positionParser.mockReturnValue([{ product: "ETF" }]);
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
    positionParser.mockReturnValue([{ product: "ETF" }]);
    expect(parseB3Xlsx(workbookBuffer(["Produto", "Quantidade"]))).toEqual({
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "ETF" }],
    });
  });
});
