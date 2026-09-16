import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    SSF: actual.SSF,
    read: vi.fn(actual.read),
    __actualRead: actual.read,
  };
});

import { ApplicationError } from "@/backend/errors/application-error";
import {
  extractAssetCode,
  parseB3MovementXlsx,
} from "@/backend/services/b3-movement-xlsx-parser";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Movimentacoes",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const headers = [
  "Entrada/Saída",
  "Data",
  "Movimentação",
  "Produto",
  "Instituição",
  "Quantidade",
  "Preço unitário",
  "Valor da Operação",
];

describe("parseB3MovementXlsx", () => {
  it("rejects a workbook without sheets", () => {
    const read = vi
      .spyOn(XLSX, "read")
      .mockReturnValue({ SheetNames: [], Sheets: {} } as never);
    expect(() => parseB3MovementXlsx(Buffer.from("empty"))).toThrow(
      ApplicationError,
    );
    read.mockImplementation(
      (XLSX as unknown as { __actualRead: typeof XLSX.read }).__actualRead,
    );
  });

  it("rejects numeric dates that cannot be converted", () => {
    const parseDate = vi
      .spyOn(XLSX.SSF, "parse_date_code")
      .mockReturnValue(null as never);
    expect(() =>
      parseB3MovementXlsx(
        workbookBuffer([
          headers,
          ["Credito", 46276, "Juros", "Produto", "", 1, "", ""],
        ]),
      ),
    ).toThrow(ApplicationError);
    parseDate.mockRestore();
  });

  it("treats undefined cells as missing values", () => {
    const rows = [
      headers,
      ["Credito", undefined, "Juros", undefined, undefined, "1", "", ""],
    ];
    const sheetToJson = vi
      .spyOn(XLSX.utils, "sheet_to_json")
      .mockReturnValue(rows as never);
    expect(() => parseB3MovementXlsx(workbookBuffer([headers]))).toThrow(
      ApplicationError,
    );
    sheetToJson.mockRestore();
  });
  it("parses credit and debit movements with Brazilian decimals and asset codes", () => {
    const movements = parseB3MovementXlsx(
      workbookBuffer([
        headers,
        [
          "Credito",
          "11/09/2026",
          "APLICAÇÃO",
          "CDB - CDB4265W9HJ",
          "BANCO INTER S/A",
          "20000",
          "R$ 0,01",
          "R$ 200,00",
        ],
        [
          "Debito",
          "26/06/2026",
          "RESGATE ANTECIPADO/",
          "CDB - CDB6265NQ0B - BANCO INTER S/A",
          "BANCO INTER S/A",
          "140792",
          "R$ 0,0100692",
          "R$ 1.417,66",
        ],
      ]),
    );

    expect(movements).toEqual([
      expect.objectContaining({
        direction: "CREDITO",
        occurredAt: "2026-09-11",
        movementType: "APLICAÇÃO",
        assetCode: "CDB4265W9HJ",
        quantity: "20000",
        unitPrice: "0.01",
        operationValue: "200.00",
      }),
      expect.objectContaining({
        direction: "DEBITO",
        occurredAt: "2026-06-26",
        assetCode: "CDB6265NQ0B",
        quantity: "140792",
        unitPrice: "0.0100692",
        operationValue: "1417.66",
      }),
    ]);
  });

  it("keeps invalid optional financial values empty", () => {
    const [movement] = parseB3MovementXlsx(
      workbookBuffer([
        headers,
        [
          "Credito",
          "11/09/2026",
          "Juros",
          "Produto",
          null,
          2,
          "invalid",
          "invalid",
        ],
      ]),
    );
    expect(movement).toMatchObject({ unitPrice: null, operationValue: null });
  });
  it("accepts spreadsheet dates and optional values", () => {
    const [movement] = parseB3MovementXlsx(
      workbookBuffer([
        headers,
        ["Credito", 46276, "Juros", "Produto sem código", "", 2, "", ""],
      ]),
    );
    expect(movement).toMatchObject({
      occurredAt: "2026-09-11",
      assetCode: null,
      institution: null,
      unitPrice: null,
      operationValue: null,
    });
  });

  it("extracts only recognizable asset codes", () => {
    expect(extractAssetCode("CDB - CDB4265W9HJ")).toBe("CDB4265W9HJ");
    expect(extractAssetCode("Produto comum")).toBeNull();
  });

  it("rejects invalid layouts and incomplete records", () => {
    expect(() =>
      parseB3MovementXlsx(workbookBuffer([["Produto"], ["CDB"]])),
    ).toThrow(ApplicationError);
    expect(() =>
      parseB3MovementXlsx(
        workbookBuffer([
          ["Entrada/Saída", "Data", "Movimentação", "Produto", "Quantidade"],
          ["Credito", "data", "APLICAÇÃO", "CDB", "1"],
        ]),
      ),
    ).toThrow(ApplicationError);
  });

  it("ignores blank rows and rejects invalid directions", () => {
    expect(() =>
      parseB3MovementXlsx(
        workbookBuffer([
          headers,
          ["", "", "", "", "", "", "", ""],
          ["Outro", "11/09/2026", "APLICAÇÃO", "CDB", "", "1", "", ""],
        ]),
      ),
    ).toThrow(ApplicationError);
  });
  it("rejects headers that identify movements but omit a required column", () => {
    expect(() =>
      parseB3MovementXlsx(
        workbookBuffer([
          ["Entrada/Saída", "Movimentação", "Produto"],
          ["Credito", "APLICAÇÃO", "CDB"],
        ]),
      ),
    ).toThrow(ApplicationError);
  });
  it("rejects a valid header with no movements", () => {
    expect(() => parseB3MovementXlsx(workbookBuffer([headers]))).toThrow(
      ApplicationError,
    );
  });
});
