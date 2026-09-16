import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/backend/errors/application-error";
import { parseB3PositionXlsx } from "@/backend/services/b3-position-xlsx-parser";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Posicoes",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseB3PositionXlsx", () => {
  it("parses B3 headers and preserves decimal quantities", () => {
    const positions = parseB3PositionXlsx(
      workbookBuffer([
        ["Produto", "Codigo", "Quantidade", "Instituicao", "Vencimento"],
        ["ETF Exemplo", "BOVA11", "1.234,50000000", "Corretora", "31/12/2030"],
      ]),
    );
    expect(positions).toEqual([
      expect.objectContaining({
        product: "ETF Exemplo",
        assetCode: "BOVA11",
        quantity: "1234.50000000",
        institution: "Corretora",
        maturityAt: "2030-12-31",
      }),
    ]);
  });

  it("ignores empty rows and rejects incomplete positions", () => {
    expect(() =>
      parseB3PositionXlsx(
        workbookBuffer([
          ["Produto", "Quantidade"],
          ["", ""],
          ["Ativo", "invalida"],
        ]),
      ),
    ).toThrow(ApplicationError);
  });

  it("rejects a document without B3 headers", () => {
    expect(() =>
      parseB3PositionXlsx(
        workbookBuffer([
          ["Ativo", "Saldo"],
          ["ABC", 1],
        ]),
      ),
    ).toThrow(ApplicationError);
  });
  it("accepts numeric quantities and spreadsheet dates", () => {
    const positions = parseB3PositionXlsx(
      workbookBuffer([
        ["Produto", "Quantidade", "Vencimento"],
        ["T�tulo", 2, new Date("2030-12-31T12:00:00.000Z")],
      ]),
    );
    expect(positions[0]).toMatchObject({
      quantity: "2",
      maturityAt: "2030-12-31",
    });
  });

  it("rejects a B3 sheet missing a required column", () => {
    expect(() =>
      parseB3PositionXlsx(workbookBuffer([["Produto"], ["Ativo"]])),
    ).toThrow(ApplicationError);
  });

  it("rejects a B3 sheet without positions", () => {
    expect(() =>
      parseB3PositionXlsx(workbookBuffer([["Produto", "Quantidade"]])),
    ).toThrow(ApplicationError);
  });
  it("handles blank header cells", () => {
    const positions = parseB3PositionXlsx(
      workbookBuffer([
        [null, "Produto", "Quantidade"],
        ["", "Ativo", "1"],
      ]),
    );
    expect(positions[0]).toMatchObject({ product: "Ativo", quantity: "1" });
  });
});
