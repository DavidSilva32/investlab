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
import { parseB3TradingXlsx } from "@/backend/services/b3-trading-xlsx-parser";

const headers = [
  "Data do Negócio",
  "Tipo de Movimentação",
  "Mercado",
  "Prazo/Vencimento",
  "Instituição",
  "Código de Negociação",
  "Quantidade",
  "Preço",
  "Valor",
];

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Negociação",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const actualXlsxRead = (
  XLSX as typeof XLSX & { __actualRead: typeof XLSX.read }
).__actualRead;
afterEach(() => {
  vi.mocked(XLSX.read).mockReset().mockImplementation(actualXlsxRead);
});

describe("parseB3TradingXlsx", () => {
  it("finds the negotiation table after an auxiliary worksheet", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Data do Negócio"], ["Sem negócios"]]),
      "Resumo",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        headers,
        ["14/10/2026", "Compra", "Vista", "-", "Corretora", "ABCD3", 2, 10, 20],
      ]),
      "Negociação",
    );
    const file = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    expect(parseB3TradingXlsx(file)).toHaveLength(1);
  });

  it("skips worksheet names missing from the workbook sheet map", () => {
    const validSheet = XLSX.utils.aoa_to_sheet([
      headers,
      ["14/10/2026", "Compra", "Vista", "-", "Corretora", "ABCD3", 2, 10, 20],
    ]);
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ["Missing", "Negociação"],
      Sheets: { Negociação: validSheet },
    } as XLSX.WorkBook);

    expect(parseB3TradingXlsx(Buffer.from("xlsx"))).toHaveLength(1);
  });

  it("parses buy and sell rows while retaining source ticker and missing settlement data", () => {
    expect(
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [
            "14/10/2026",
            "Compra",
            "Mercado Fracionário",
            "-",
            "Corretora",
            "BBSE3F",
            10,
            "R$ 20,50",
            "R$ 205,00",
          ],
          [
            "14/10/2026",
            "Venda",
            "Mercado à Vista",
            "-",
            "Corretora",
            "HGLG11",
            "2",
            "100,00",
            "200,00",
          ],
          ["", "", "", "", "", "", "", "", ""],
        ]),
      ),
    ).toEqual([
      expect.objectContaining({
        side: "BUY",
        tradingDate: "2026-10-14",
        settlementDate: null,
        market: "Mercado Fracionário",
        assetCode: "BBSE3",
        originalAssetCode: "BBSE3F",
        quantity: "10",
        unitPrice: "20.50",
        grossValue: "205.00",
        fees: null,
        sourceRow: 2,
      }),
      expect.objectContaining({ side: "SELL", assetCode: "HGLG11" }),
    ]);
  });

  it("accepts numeric spreadsheet dates and numeric prices", () => {
    const [trade] = parseB3TradingXlsx(
      workbookBuffer([
        headers,
        [46174, "Compra", "Vista", "-", "Corretora", "ABCD3", 2, 10, 20],
      ]),
    );
    expect(trade).toMatchObject({
      tradingDate: "2026-06-01",
      quantity: "2",
      unitPrice: "10",
      grossValue: "20",
    });
  });

  it("preserves omitted optional market and institution as null", () => {
    const [trade] = parseB3TradingXlsx(
      workbookBuffer([
        headers,
        ["14/10/2026", "Compra", "", "-", "", "ABCD3", 2, 10, 20],
      ]),
    );

    expect(trade).toMatchObject({
      market: null,
      institution: null,
      assetCode: "ABCD3",
      originalAssetCode: "ABCD3",
    });
  });

  it("accepts negotiation exports that omit optional market and institution columns", () => {
    const [trade] = parseB3TradingXlsx(
      workbookBuffer([
        [
          "Data do Negócio",
          "Tipo de Movimentação",
          "Código de Negociação",
          "Quantidade",
          "Preço",
          "Valor",
        ],
        ["14/10/2026", "Compra", "ABCD3", 2, 10, 20],
      ]),
    );

    expect(trade).toMatchObject({ market: null, institution: null });
  });

  it("rejects workbooks without negotiation headers", () => {
    expect(() =>
      parseB3TradingXlsx(workbookBuffer([["Produto"], ["Ativo"]])),
    ).toThrow(ApplicationError);
  });

  it("rejects missing required columns and unsupported trade sides", () => {
    expect(() =>
      parseB3TradingXlsx(workbookBuffer([["Data do Negócio"], ["14/10/2026"]])),
    ).toThrow(ApplicationError);
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [
            "14/10/2026",
            "Ajuste",
            "Vista",
            "-",
            "Corretora",
            "ABCD3",
            2,
            10,
            20,
          ],
        ]),
      ),
    ).toThrow(ApplicationError);
  });

  it("rejects invalid dates and financial values, and empty trade sheets", () => {
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          ["inválida", "Compra", "Vista", "-", "Corretora", "ABCD3", 2, 10, 20],
        ]),
      ),
    ).toThrow(ApplicationError);
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [
            "14/10/2026",
            "Compra",
            "Vista",
            "-",
            "Corretora",
            "ABCD3",
            2,
            "inválido",
            20,
          ],
        ]),
      ),
    ).toThrow(ApplicationError);
    expect(() => parseB3TradingXlsx(workbookBuffer([headers]))).toThrow(
      ApplicationError,
    );
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [999999999, "Compra", "Vista", "-", "Corretora", "ABCD3", 2, 10, 20],
        ]),
      ),
    ).toThrow(ApplicationError);
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          ["14/10/2026", "Compra", "Vista", "-", "Corretora", "", 2, 10, 20],
        ]),
      ),
    ).toThrow(ApplicationError);
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [
            "14/10/2026",
            "Compra",
            "Vista",
            "-",
            "Corretora",
            "ABCD3",
            2,
            "",
            20,
          ],
        ]),
      ),
    ).toThrow(ApplicationError);
  });

  it("rejects calendar-invalid trading dates", () => {
    expect(() =>
      parseB3TradingXlsx(
        workbookBuffer([
          headers,
          [
            "31/02/2026",
            "Compra",
            "Vista",
            "-",
            "Corretora",
            "ABCD3",
            2,
            10,
            20,
          ],
        ]),
      ),
    ).toThrow(ApplicationError);
  });
});
