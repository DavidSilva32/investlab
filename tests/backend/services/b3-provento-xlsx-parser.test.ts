import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { parseB3ProventoXlsx } from "@/backend/services/b3-provento-xlsx-parser";

const xlsxRead = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  xlsxRead.read.mockImplementation(
    (
      data: Parameters<typeof actual.read>[0],
      options?: Parameters<typeof actual.read>[1],
    ) => actual.read(data, options),
  );
  return {
    ...actual,
    SSF: (Reflect.get(actual, "default") as { SSF: typeof XLSX.SSF }).SSF,
    read: (
      data: Parameters<typeof actual.read>[0],
      options?: Parameters<typeof actual.read>[1],
    ) => xlsxRead.read(data, options),
  };
});

function workbookBuffer(sheets: Array<{ name: string; rows: unknown[][] }>) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name,
    );
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function parseWorkbookRows(rows: unknown[][]) {
  const sheetToJson = vi
    .spyOn(XLSX.utils, "sheet_to_json")
    .mockReturnValue(rows as never);
  try {
    return parseB3ProventoXlsx(
      workbookBuffer([{ name: "Recebidos", rows: [receivedHeaders] }]),
    );
  } finally {
    sheetToJson.mockRestore();
  }
}

const receivedHeaders = [
  "Produto",
  "Tipo de Evento",
  "Instituição",
  "Pagamento",
  "Quantidade",
  "Preço Unitário",
  "Valor Líquido",
];

describe("parseB3ProventoXlsx", () => {
  it("parses received events, localized values, blank rows and footer rows", () => {
    const records = parseB3ProventoXlsx(
      workbookBuffer([
        {
          name: "Recebidos",
          rows: [
            ["Relatório de proventos"],
            receivedHeaders,
            [
              "HGLG11",
              "Rendimento",
              "Inter",
              "16/11/2026",
              2,
              "R$ 1,17",
              "R$ 2,34",
            ],
            ["", "", "", "", "", "", ""],
            ["", "TOTAL", "", "", "", "", "2,34"],
          ],
        },
      ]),
    );

    expect(records).toEqual([
      {
        status: "RECEIVED",
        sourceSheet: "Recebidos",
        sourceRow: 3,
        product: "HGLG11",
        eventType: "Rendimento",
        paymentDate: "2026-11-16",
        institution: "Inter",
        quantity: "2",
        unitPrice: "1.17",
        netValue: "2.34",
      },
    ]);
  });

  it("parses upcoming events using a spreadsheet date and returns null institution", () => {
    const records = parseB3ProventoXlsx(
      workbookBuffer([
        {
          name: "A receber",
          rows: [
            [
              "Produto",
              "Tipo de Evento",
              "Instituição",
              "Previsão de Pagamento",
              "Quantidade",
              "Preço Unitário",
              "Valor Líquido",
            ],
            ["XPMI11", "Rendimento", "  ", 46327, 2, 0.92, 0.1],
          ],
        },
      ]),
    );

    expect(records).toEqual([
      {
        status: "UPCOMING",
        sourceSheet: "A receber",
        sourceRow: 2,
        product: "XPMI11",
        eventType: "Rendimento",
        paymentDate: "2026-11-01",
        institution: null,
        quantity: "2",
        unitPrice: "0.92",
        netValue: "0.1",
      },
    ]);
  });

  it("skips worksheets without a recognized table and uses the first supported sheet", () => {
    const records = parseB3ProventoXlsx(
      workbookBuffer([
        { name: "Resumo", rows: [["Total", 0]] },
        {
          name: "Recebidos",
          rows: [
            receivedHeaders,
            ["Ativo", "JCP", "Banco", "01/10/2026", 1, 2, 2],
          ],
        },
        {
          name: "A receber",
          rows: [
            receivedHeaders,
            ["Outro", "Rendimento", "Banco", "02/10/2026", 1, 2, 2],
          ],
        },
      ]),
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceSheet: "Recebidos",
      product: "Ativo",
      status: "RECEIVED",
    });
  });

  it("ignores a missing worksheet entry before parsing the next available sheet", () => {
    const workbook = {
      SheetNames: ["Missing", "Recebidos"],
      Sheets: {
        Recebidos: XLSX.utils.aoa_to_sheet([
          receivedHeaders,
          ["HGLG11", "Rendimento", "Inter", "16/11/2026", 1, 2, 2],
        ]),
      },
    } as XLSX.WorkBook;
    xlsxRead.read.mockImplementationOnce(() => workbook);

    expect(parseB3ProventoXlsx(Buffer.from("workbook"))).toMatchObject([
      { sourceSheet: "Recebidos", product: "HGLG11" },
    ]);
  });

  it("rejects workbooks without a supported header", () => {
    expect(() =>
      parseB3ProventoXlsx(
        workbookBuffer([{ name: "Resumo", rows: [["Produto", "Valor"]] }]),
      ),
    ).toThrowError(
      new ApplicationError(
        "O arquivo não corresponde aos formatos de proventos recebidos ou a receber da B3.",
        422,
      ),
    );
  });

  it("rejects a recognized table with no records", () => {
    expect(() =>
      parseB3ProventoXlsx(
        workbookBuffer([
          {
            name: "Recebidos",
            rows: [receivedHeaders, ["", "", "", "", "", "", ""]],
          },
        ]),
      ),
    ).toThrowError("A planilha de proventos não contém registros.");
  });

  it("rejects a record cut off before the required amount columns", () => {
    expect(() =>
      parseB3ProventoXlsx(
        workbookBuffer([
          {
            name: "Recebidos",
            rows: [
              receivedHeaders,
              ["HGLG11", "Rendimento", "Banco", "16/11/2026"],
            ],
          },
        ]),
      ),
    ).toThrowError(
      new ApplicationError(
        "Há um provento sem evento, data ou valor válido na planilha.",
        422,
      ),
    );
  });

  it("handles sparse worksheet rows without accepting missing cells as values", () => {
    expect(() =>
      parseWorkbookRows([
        receivedHeaders,
        [undefined, "Rendimento", "Banco", "16/11/2026", 1, 2, 2],
      ]),
    ).toThrowError("A planilha de proventos não contém registros.");

    expect(() =>
      parseWorkbookRows([
        receivedHeaders,
        ["HGLG11", undefined, "Banco", undefined, undefined, 2, 2],
      ]),
    ).toThrowError(
      new ApplicationError(
        "Há um provento sem evento, data ou valor válido na planilha.",
        422,
      ),
    );

    expect(
      parseWorkbookRows([
        receivedHeaders,
        ["HGLG11", "Rendimento", undefined, "16/11/2026", 1, 2, 2],
      ]),
    ).toMatchObject([{ product: "HGLG11", institution: null }]);
  });

  it("rejects non-finite numeric cells decoded from a spreadsheet", () => {
    expect(() =>
      parseWorkbookRows([
        receivedHeaders,
        ["HGLG11", "Rendimento", "Banco", "16/11/2026", Infinity, 2, 2],
      ]),
    ).toThrowError(
      new ApplicationError(
        "Há um provento sem evento, data ou valor válido na planilha.",
        422,
      ),
    );
  });

  it.each([
    ["event", ["HGLG11", "", "Banco", "16/11/2026", 2, 1.17, 2.34]],
    [
      "date format",
      ["HGLG11", "Rendimento", "Banco", "2026-11-16", 2, 1.17, 2.34],
    ],
    [
      "invalid spreadsheet date",
      ["HGLG11", "Rendimento", "Banco", 9999999, 2, 1.17, 2.34],
    ],
    ["date", ["HGLG11", "Rendimento", "Banco", "31/02/2026", 2, 1.17, 2.34]],
    [
      "blank quantity",
      ["HGLG11", "Rendimento", "Banco", "16/11/2026", "", 1.17, 2.34],
    ],
    [
      "quantity",
      ["HGLG11", "Rendimento", "Banco", "16/11/2026", "x", 1.17, 2.34],
    ],
    [
      "unit price",
      ["HGLG11", "Rendimento", "Banco", "16/11/2026", 2, "x", 2.34],
    ],
    [
      "net value",
      ["HGLG11", "Rendimento", "Banco", "16/11/2026", 2, 1.17, "x"],
    ],
  ])("rejects an invalid %s", (_field, row) => {
    expect(() =>
      parseB3ProventoXlsx(
        workbookBuffer([
          { name: "Recebidos", rows: [receivedHeaders, row as unknown[]] },
        ]),
      ),
    ).toThrowError(
      new ApplicationError(
        "Há um provento sem evento, data ou valor válido na planilha.",
        422,
      ),
    );
  });
});
