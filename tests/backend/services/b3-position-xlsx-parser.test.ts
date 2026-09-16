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
        valuationSource: "INFORMADO",
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
  it("selects CURVA for fixed income when MTM and FECHAMENTO are empty", () => {
    const [position] = b3PositionXlsxParser.parse(
      workbookBuffer([
        [
          "Produto",
          "Código",
          "Quantidade",
          "Preço Atualizado MTM",
          "Valor Atualizado MTM",
          "Preço Atualizado CURVA",
          "Valor Atualizado CURVA",
          "Preço Atualizado FECHAMENTO",
          "Valor Atualizado FECHAMENTO",
        ],
        [
          "CDB",
          "CDB4265W9HJ",
          "300000",
          "",
          "",
          "R$ 0,01059225",
          "R$ 3.177,67",
          "",
          "",
        ],
      ]),
    );
    expect(position).toMatchObject({
      assetCode: "CDB4265W9HJ",
      unitPrice: "0.01059225",
      totalValue: "3177.67",
      valuationSource: "CURVA",
      curveUnitPrice: "0.01059225",
      curveTotalValue: "3177.67",
      mtmTotalValue: null,
      closingTotalValue: null,
    });
  });

  it("prioritizes MTM when it is available", () => {
    const [position] = b3PositionXlsxParser.parse(
      workbookBuffer([
        [
          "Produto",
          "Quantidade",
          "Preço Atualizado MTM",
          "Valor Atualizado MTM",
          "Preço Atualizado CURVA",
          "Valor Atualizado CURVA",
        ],
        ["Ativo", "1", "R$ 2,50", "R$ 10,00", "R$ 3,50", "R$ 11,00"],
      ]),
    );
    expect(position).toMatchObject({
      unitPrice: "2.50",
      totalValue: "10.00",
      valuationSource: "MTM",
      curveTotalValue: "11.00",
    });
  });

  it("uses FECHAMENTO when higher-priority valuations are absent", () => {
    const [position] = b3PositionXlsxParser.parse(
      workbookBuffer([
        [
          "Produto",
          "Quantidade",
          "Preço Atualizado FECHAMENTO",
          "Valor Atualizado FECHAMENTO",
        ],
        ["Ativo", "1", "R$ 4,25", "R$ 17,00"],
      ]),
    );
    expect(position).toMatchObject({
      unitPrice: "4.25",
      totalValue: "17.00",
      valuationSource: "FECHAMENTO",
      closingUnitPrice: "4.25",
      closingTotalValue: "17.00",
    });
  });

  it("does not invent a valuation when all valuation columns are empty", () => {
    const [position] = b3PositionXlsxParser.parse(
      workbookBuffer([
        [
          "Produto",
          "Quantidade",
          "Preço Atualizado MTM",
          "Valor Atualizado CURVA",
          "Valor Atualizado FECHAMENTO",
        ],
        ["Ativo", "1", "", "", ""],
      ]),
    );
    expect(position).toMatchObject({
      unitPrice: null,
      totalValue: null,
      valuationSource: null,
      mtmUnitPrice: null,
      curveTotalValue: null,
      closingTotalValue: null,
    });
  });
});
