import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/backend/errors/application-error";
import { b3PositionXlsxParser } from "@/backend/services/b3-position-xlsx-parser";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Posicoes",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("B3PositionXlsxParser", () => {
  it("parses B3 headers and preserves decimal quantities", () => {
    const positions = b3PositionXlsxParser.parse(
      workbookBuffer([
        [
          "Produto",
          "Código",
          "Quantidade",
          "Instituição",
          "Vencimento",
          "Preço Unitário",
          "Valor Atual",
          "Data de Emissão",
          "Quantidade Disponível",
          "Quantidade Indisponível",
        ],
        [
          "ETF Exemplo",
          "BOVA11",
          "1.234,50000000",
          "Corretora",
          "31/12/2030",
          "42,15",
          "52.037,50",
          "01/01/2020",
          "1000",
          "234,5",
        ],
      ]),
    );
    expect(positions).toEqual([
      expect.objectContaining({
        product: "ETF Exemplo",
        assetCode: "BOVA11",
        quantity: "1234.50000000",
        institution: "Corretora",
        maturityAt: "2030-12-31",
        issuedAt: "2020-01-01",
        availableQuantity: "1000",
        unavailableQuantity: "234.5",
        unitPrice: "42.15",
        totalValue: "52037.50",
      }),
    ]);
  });

  it("ignores empty rows and rejects incomplete positions", () => {
    expect(() =>
      b3PositionXlsxParser.parse(
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
      b3PositionXlsxParser.parse(
        workbookBuffer([
          ["Ativo", "Saldo"],
          ["ABC", 1],
        ]),
      ),
    ).toThrow(ApplicationError);
  });
  it("accepts numeric quantities and spreadsheet dates", () => {
    const positions = b3PositionXlsxParser.parse(
      workbookBuffer([
        ["Produto", "Quantidade", "Vencimento"],
        ["Título", 2, 47848],
      ]),
    );
    expect(positions[0]).toMatchObject({
      quantity: "2",
      maturityAt: "2030-12-31",
    });
  });

  it("rejects a B3 sheet missing a required column", () => {
    expect(() =>
      b3PositionXlsxParser.parse(workbookBuffer([["Produto"], ["Ativo"]])),
    ).toThrow(ApplicationError);
  });

  it("rejects a B3 sheet without positions", () => {
    expect(() =>
      b3PositionXlsxParser.parse(workbookBuffer([["Produto", "Quantidade"]])),
    ).toThrow(ApplicationError);
  });
  it("handles blank header cells", () => {
    const positions = b3PositionXlsxParser.parse(
      workbookBuffer([
        [null, "Produto", "Quantidade"],
        ["", "Ativo", "1"],
      ]),
    );
    expect(positions[0]).toMatchObject({ product: "Ativo", quantity: "1" });
  });
  it("keeps an invalid numeric maturity date empty", () => {
    const positions = b3PositionXlsxParser.parse(
      workbookBuffer([
        ["Produto", "Quantidade", "Vencimento"],
        ["Ativo", "1", 999999999],
      ]),
    );
    expect(positions[0].maturityAt).toBeNull();
  });
});
