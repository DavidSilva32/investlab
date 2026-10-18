import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    read: vi.fn(actual.read),
    __actualRead: actual.read,
    SSF: actual.SSF,
    utils: actual.utils,
    write: actual.write,
  };
});

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
  const actualXlsxRead = (
    XLSX as typeof XLSX & { __actualRead: typeof XLSX.read }
  ).__actualRead;
  afterEach(() => {
    vi.mocked(XLSX.read).mockReset().mockImplementation(actualXlsxRead);
  });

  it("rejects workbooks without worksheets", () => {
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: [],
      Sheets: {},
    } as XLSX.WorkBook);

    expect(() => b3PositionXlsxParser.parse(Buffer.from("xlsx"))).toThrow(
      ApplicationError,
    );
  });

  it("skips a worksheet name missing from the workbook sheet map", () => {
    const validSheet = XLSX.utils.aoa_to_sheet([
      ["Produto", "Quantidade"],
      ["Ativo", 1],
    ]);
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ["Missing", "Posicoes"],
      Sheets: { Posicoes: validSheet },
    } as XLSX.WorkBook);

    expect(b3PositionXlsxParser.parse(Buffer.from("xlsx"))).toEqual([
      expect.objectContaining({ product: "Ativo", quantity: "1" }),
    ]);
  });

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

it("uses workbook CreatedDate as an operational base date in São Paulo", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Produto", "Quantidade"],
      ["CDB", "1"],
    ]),
    "Posicoes",
  );
  workbook.Props = { CreatedDate: new Date("2026-09-17T02:30:00.000Z") };
  const file = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  expect(b3PositionXlsxParser.parseDocument(file)).not.toHaveProperty(
    "referenceDate",
  );
});

it("uses only the recognized position filename when CreatedDate is absent", () => {
  const file = workbookBuffer([
    ["Produto", "Quantidade"],
    ["CDB", "1"],
  ]);
  expect(b3PositionXlsxParser.parseDocument(file)).not.toHaveProperty(
    "referenceDate",
  );
  expect(b3PositionXlsxParser.parseDocument(file)).not.toHaveProperty(
    "referenceDate",
  );
});

it("combines B3 position tabs and retains fractional ticker source identity", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "Produto",
        "Instituição",
        "Conta",
        "Código de Negociação",
        "Quantidade",
        "Preço de Fechamento",
        "Valor Atualizado",
      ],
      ["Ação exemplo", "Corretora", "Conta 1", "BBSE3F", 10, 20, 200],
    ]),
    "Ações",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "Produto",
        "Instituição",
        "Código de Negociação",
        "Tipo",
        "Quantidade",
        "Preço de Fechamento",
        "Valor Atualizado",
      ],
      [
        "Fundo de investimento exemplo",
        "Corretora",
        "HGLG11",
        "FII",
        2,
        100,
        200,
      ],
    ]),
    "Fundos de Investimento",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Produto", "Emissor", "Quantidade", "Valor Atualizado MTM"],
      ["CDB exemplo", "Banco", 5, 500],
    ]),
    "Renda Fixa",
  );
  const file = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  expect(b3PositionXlsxParser.parse(file)).toEqual([
    expect.objectContaining({
      sourceSheet: "Ações",
      sourceRow: 2,
      instrumentKind: "EQUITY",
      account: "Conta 1",
      assetCode: "BBSE3",
      originalAssetCode: "BBSE3F",
    }),
    expect.objectContaining({
      sourceSheet: "Fundos de Investimento",
      instrumentKind: "FII",
      assetCode: "HGLG11",
      sourceType: "FII",
    }),
    expect.objectContaining({
      sourceSheet: "Renda Fixa",
      instrumentKind: "FIXED_INCOME",
    }),
  ]);
});

it("uses explicit real estate fund product evidence even without an FII source type", () => {
  const [position] = b3PositionXlsxParser.parse(
    workbookBuffer([
      ["Produto", "Tipo", "Código de Negociação", "Quantidade"],
      ["Fundo imobiliário exemplo", "Fundo", "HGLG11", 2],
    ]),
  );
  expect(position).toMatchObject({
    instrumentKind: "FII",
    sourceType: "Fundo",
  });
});

it("uses explicit product and B3 source evidence for instrument kinds", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Produto", "Tipo", "Código de Negociação", "Quantidade"],
      [
        "XP Malls Fundo de Investimento Imobiliário - FII",
        "Cotas",
        "XPML11",
        2,
      ],
      [
        "Pátria Log - FDO INV IMOB - Responsabilidade Ltda.",
        "Cotas",
        "HGLG11",
        2,
      ],
      ["ITAU UNIBANCO HOLDING S.A.", "PN", "ITUB4", 7],
      ["BB SEGURIDADE PARTICIPACOES S.A.", "ON", "BBSE3", 8],
      ["CDB - Banco Exemplo", "CDB", "CDB123", 1],
      ["Vanguard S&P 500 ETF", "Cotas", "VOO", 1],
      ["Fundo de investimento em infraestrutura", "Cotas", "FUNDX", 1],
    ]),
    "Fundos de Investimento",
  );
  const file = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  const positions = b3PositionXlsxParser.parse(file);

  expect(
    positions.map(({ assetCode, instrumentKind, sourceType }) => [
      assetCode,
      instrumentKind,
      sourceType,
    ]),
  ).toEqual([
    ["XPML11", "FII", "Cotas"],
    ["HGLG11", "FII", "Cotas"],
    ["ITUB4", "EQUITY", "PN"],
    ["BBSE3", "EQUITY", "ON"],
    ["CDB123", "FIXED_INCOME", "CDB"],
    ["VOO", "ETF", "Cotas"],
    ["FUNDX", "INVESTMENT_FUND", "Cotas"],
  ]);
});

it("selects an available total without combining it with another valuation source", () => {
  const [position] = b3PositionXlsxParser.parse(
    workbookBuffer([
      [
        "Produto",
        "Quantidade",
        "Preco Atualizado FECHAMENTO",
        "Valor Atualizado FECHAMENTO",
        "Valor Atual",
      ],
      ["XP Malls FII", "2", "105,99", "", "211,98"],
    ]),
  );

  expect(position).toMatchObject({
    unitPrice: null,
    totalValue: "211.98",
    valuationSource: "INFORMADO",
    closingUnitPrice: "105.99",
    closingTotalValue: null,
  });
});

it("reads the ISIN column label used by the B3 position workbook", () => {
  const [position] = b3PositionXlsxParser.parse(
    workbookBuffer([
      ["Produto", "Quantidade", "Código ISIN / Distribuição"],
      ["Ação exemplo", 10, "BR0000000000"],
    ]),
  );

  expect(position.isin).toBe("BR0000000000");
});
