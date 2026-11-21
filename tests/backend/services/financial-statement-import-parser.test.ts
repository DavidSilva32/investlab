import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    SSF: actual.SSF,
    utils: {
      ...actual.utils,
      decode_range: vi.fn(actual.utils.decode_range),
    },
    read: vi.fn(actual.read),
    __actualRead: actual.read,
  };
});
import {
  parseStatementFile,
  parseStatementRows,
} from "@/backend/services/financial-statement-import-parser";

describe("financial statement import parser", () => {
  it("detects a semicolon CSV header after preamble and preserves quoted descriptions", () => {
    const file = Buffer.from(
      [
        "Extrato da conta",
        "Período;01/11/2026 a 30/11/2026",
        "Conta;Conta de teste",
        "Moeda;BRL",
        "Gerado;30/11/2026",
        "Data Lançamento;Descrição;Valor;Saldo",
        '14/11/2026;"Mercado; unidade centro";-1.234,56;8.765,44',
        "15/11/2026;Salário;12.000,00;20.765,44",
      ].join("\r\n"),
      "utf8",
    );

    const parsed = parseStatementFile("extrato.csv", file);
    expect(parsed.headers).toEqual([
      "Data Lançamento",
      "Descrição",
      "Valor",
      "Saldo",
    ]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      sourceRow: 7,
      values: [
        "14/11/2026",
        "Mercado; unidade centro",
        "-1.234,56",
        "8.765,44",
      ],
    });
  });

  it("parses signed Brazilian currency into actual income and expense entries", () => {
    const parsed = parseStatementFile(
      "extrato.csv",
      Buffer.from(
        "Data;Descrição;Valor\n14/11/2026;Mercado;-1.234,56\n15/11/2026;Salário;12.000,00",
        "utf8",
      ),
    );
    const rows = parseStatementRows(parsed.rows, {
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
    expect(rows).toEqual([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "Mercado",
        actualDate: "2026-11-14",
        amount: 1234.56,
        errors: [],
      },
      {
        sourceRow: 3,
        kind: "INCOME",
        description: "Salário",
        actualDate: "2026-11-15",
        amount: 12000,
        errors: [],
      },
    ]);
  });

  it("rejects Inter card statements instead of importing card purchases", () => {
    expect(() =>
      parseStatementFile(
        "cartao-inter.csv",
        Buffer.from(
          'Data,Lançamento,Categoria,Tipo,Valor\n14/11/2026,UBER,TRANSPORTE,Compra à vista,"R$ 14,96"',
          "utf8",
        ),
      ),
    ).toThrow("A importação de extratos de cartão não está disponível.");
  });

  it("still accepts account statements with debit and credit columns", () => {
    const parsed = parseStatementFile(
      "statement.csv",
      Buffer.from(
        '"Data","Descrição","Débito","Crédito"\n"14/11/2026","Compra","10.00",""',
        "utf8",
      ),
    );

    expect(parsed).not.toHaveProperty("source");
    expect(parsed.rows).toHaveLength(1);
  });

  it("requires valid dates and amounts and supports debit and credit columns", () => {
    const parsed = parseStatementFile(
      "extrato.csv",
      Buffer.from(
        "Data;Descrição;Débito;Crédito\n31/02/2026;Compra;10,00;\n01/03/2026;Reembolso;;5,00\n02/03/2026;Ambíguo;1,00;2,00",
        "utf8",
      ),
    );
    const rows = parseStatementRows(parsed.rows, {
      dateColumn: 0,
      descriptionColumn: 1,
      debitColumn: 2,
      creditColumn: 3,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
    expect(rows[0]?.errors).toContain(
      "Confira a data e o formato selecionado.",
    );
    expect(rows[1]).toMatchObject({
      kind: "INCOME",
      amount: 5,
      actualDate: "2026-03-01",
      errors: [],
    });
    expect(rows[2]?.errors).toContain(
      "A linha tem débito e crédito; revise antes de importar.",
    );
  });

  it("rejects unsupported or oversized files", () => {
    expect(() =>
      parseStatementFile("extrato.pdf", Buffer.from("data")),
    ).toThrow("Use um arquivo CSV, XLS ou XLSX.");
    expect(() =>
      parseStatementFile("extrato.csv", Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).toThrow("O arquivo deve ter até 5 MB.");
  });

  it("rejects an oversized dense CSV while parsing instead of retaining all rows", () => {
    const data = Array.from(
      { length: 501 },
      (_, index) => `14/11/2026;Compra ${index};10,00`,
    );
    const csv = Buffer.from(
      ["Data;Descrição;Valor", ...data].join("\n"),
      "utf8",
    );

    expect(() => parseStatementFile("extrato.csv", csv)).toThrow(
      "O arquivo pode ter no máximo 500 lançamentos.",
    );
  });

  it("keeps the full CSV when delimiter detection samples more than 20 rows", () => {
    const rows = Array.from(
      { length: 30 },
      (_, index) =>
        `${String(index + 1).padStart(2, "0")}/11/2026;Compra ${index + 1};10,00`,
    );
    const csv = Buffer.from(
      ["Data;Descrição;Valor", ...rows].join("\n"),
      "utf8",
    );

    const parsed = parseStatementFile("extrato.csv", csv);
    expect(parsed.rows).toHaveLength(30);
    expect(parsed.rows[0]).toEqual({
      sourceRow: 2,
      values: ["01/11/2026", "Compra 1", "10,00"],
    });
    expect(parsed.rows.at(-1)?.sourceRow).toBe(31);
  });

  it("rejects a sparse XLSX range before converting it to a row matrix", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Data", "Descrição", "Valor"],
      ["14/11/2026", "Compra", "10,00"],
    ]);
    sheet["!ref"] = "A1:C522";
    XLSX.utils.book_append_sheet(workbook, sheet, "Extrato");
    const file = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    expect(() => parseStatementFile("extrato.xlsx", file)).toThrow(
      "O arquivo pode ter no máximo 500 lançamentos.",
    );
  });

  it("rejects a CSV row with too many columns during parsing", () => {
    const csv = Buffer.from(
      `${["Data", "Descrição", "Valor", ...Array(198).fill("Extra")].join(",")}\n${Array(201).fill("x").join(",")}`,
      "utf8",
    );

    expect(() => parseStatementFile("extrato.csv", csv)).toThrow(
      "A planilha pode ter no máximo 200 colunas.",
    );
  });

  it("parses quoted CSV fields and rejects an unclosed quoted field", () => {
    const file = parseStatementFile(
      "extrato.CSV",
      Buffer.from(
        'Data,Descrição,Valor\n14/11/2026,"Compra ""especial"", café",-10.00\n',
        "utf8",
      ),
    );

    expect(file.rows[0]?.values).toEqual([
      "14/11/2026",
      'Compra "especial", café',
      "-10.00",
    ]);
    expect(() =>
      parseStatementFile(
        "extrato.csv",
        Buffer.from('Data;Descrição;Valor\n14/11/2026;"Compra;10,00', "utf8"),
      ),
    ).toThrow("Não foi possível identificar as colunas do CSV.");
  });

  it("accepts pipe and tab delimiters and falls back to a header on row one", () => {
    const pipe = parseStatementFile(
      "pipe.csv",
      Buffer.from("Data|Descrição|Valor\n14/11/2026|Compra|10.00", "utf8"),
    );
    const tab = parseStatementFile(
      "tab.csv",
      Buffer.from("Data\tDescrição\tValor\n14/11/2026\tCompra\t10.00", "utf8"),
    );

    expect(pipe.headers).toEqual(["Data", "Descrição", "Valor"]);
    expect(tab.rows).toHaveLength(1);
    expect(
      parseStatementFile("plain.csv", Buffer.from("A\nB", "utf8")),
    ).toMatchObject({
      headers: ["A"],
      rows: [{ values: ["B"] }],
    });
  });

  it("validates workbook sheet, range and width before materializing rows", () => {
    const read = vi.mocked(XLSX.read);
    const decodeRange = vi.mocked(XLSX.utils.decode_range);
    const actualDecodeRange = decodeRange.getMockImplementation();
    read.mockReturnValue({ SheetNames: [], Sheets: {} } as XLSX.WorkBook);
    expect(() => parseStatementFile("empty.xlsx", Buffer.from("xlsx"))).toThrow(
      "O arquivo não contém uma tabela.",
    );

    read.mockReturnValue({
      SheetNames: ["Extrato"],
      Sheets: { Extrato: {} },
    } as unknown as XLSX.WorkBook);
    expect(() =>
      parseStatementFile("no-range.xlsx", Buffer.from("xlsx")),
    ).toThrow("O arquivo não contém uma tabela.");

    vi.mocked(XLSX.utils.decode_range).mockImplementation(() => {
      throw new Error("invalid range");
    });
    read.mockReturnValue({
      SheetNames: ["Extrato"],
      Sheets: { Extrato: { "!ref": "A1" } },
    } as unknown as XLSX.WorkBook);
    expect(() =>
      parseStatementFile("bad-range.xlsx", Buffer.from("xlsx")),
    ).toThrow("Não foi possível ler este arquivo.");

    decodeRange.mockImplementation(actualDecodeRange!);
    read.mockImplementation((...args) =>
      (XLSX as unknown as { __actualRead: typeof XLSX.read }).__actualRead(
        ...args,
      ),
    );

    const validWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      validWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["Data", "Descrição", "Valor"],
        ["14/11/2026", "Compra", 10],
      ]),
      "Extrato",
    );
    expect(
      parseStatementFile(
        "valid.xlsx",
        XLSX.write(validWorkbook, {
          type: "buffer",
          bookType: "xlsx",
        }) as Buffer,
      ).rows,
    ).toHaveLength(1);

    const headerOnly = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      headerOnly,
      XLSX.utils.aoa_to_sheet([["Data", "Descrição", "Valor"]]),
      "Extrato",
    );
    expect(() =>
      parseStatementFile(
        "header-only.xlsx",
        XLSX.write(headerOnly, { type: "buffer", bookType: "xlsx" }) as Buffer,
      ),
    ).toThrow("A planilha precisa ter cabeçalho e lançamentos.");

    const overRowLimit = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      overRowLimit,
      XLSX.utils.aoa_to_sheet([
        ["Data", "Descrição", "Valor"],
        ...Array.from({ length: 501 }, (_, index) => [
          "14/11/2026",
          `Compra ${index}`,
          10,
        ]),
      ]),
      "Extrato",
    );
    expect(() =>
      parseStatementFile(
        "over-limit.xlsx",
        XLSX.write(overRowLimit, {
          type: "buffer",
          bookType: "xlsx",
        }) as Buffer,
      ),
    ).toThrow("O arquivo pode ter no máximo 500 lançamentos.");

    const wide = XLSX.utils.book_new();
    const wideSheet = XLSX.utils.aoa_to_sheet([["Data", "Descrição", "Valor"]]);
    wideSheet["!ref"] = "A1:GS1";
    XLSX.utils.book_append_sheet(wide, wideSheet, "Extrato");
    expect(() =>
      parseStatementFile(
        "wide.xlsx",
        XLSX.write(wide, { type: "buffer", bookType: "xlsx" }) as Buffer,
      ),
    ).toThrow("A planilha pode ter no máximo 200 colunas.");

    read.mockImplementation(() => {
      throw new Error("corrupted workbook");
    });
    expect(() =>
      parseStatementFile("corrupted.xlsx", Buffer.from("invalid")),
    ).toThrow("Não foi possível ler este arquivo.");
    read.mockImplementation(
      (XLSX as unknown as { __actualRead: typeof XLSX.read }).__actualRead,
    );
  });

  it("normalizes sparse workbook headers and unsupported cell values", () => {
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ["Extrato"],
      Sheets: { Extrato: { "!ref": "A1:C4" } },
    } as unknown as XLSX.WorkBook);
    vi.spyOn(XLSX.utils, "sheet_to_json").mockReturnValueOnce([
      [undefined, "", "Valor"],
      ["2026-11-14", null, undefined],
      ["2026-11-15", new Date("2026-11-15T00:00:00.000Z"), true],
      ["", "", ""],
    ] as never);

    const parsed = parseStatementFile("sparse.xlsx", Buffer.from("xlsx"));
    expect(parsed.headers).toEqual(["Coluna 1", "Coluna 2", "Valor"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.values).toEqual(["2026-11-14", "", ""]);
    expect(typeof parsed.rows[1]?.values[1]).toBe("string");
    expect(parsed.rows[1]?.values[2]).toBe(true);

    expect(
      parseStatementRows([{ sourceRow: 2, values: ["2026-11-14"] }], {
        dateColumn: 0,
        descriptionColumn: 2,
        amountColumn: 3,
        dateFormat: "ISO",
        decimalSeparator: "DOT",
      })[0],
    ).toMatchObject({
      description: "",
      errors: ["Informe a descrição.", "O valor precisa ser maior que zero."],
    });
  });

  it("handles spreadsheet date serials, ISO and US date formats", () => {
    const serial =
      Date.UTC(2026, 10, 14) / 86_400_000 - Date.UTC(1899, 11, 30) / 86_400_000;
    expect(
      parseStatementRows(
        [
          { sourceRow: 2, values: [serial, "Compra", 10] },
          { sourceRow: 3, values: ["2026-11-15", "Compra", 11] },
          { sourceRow: 4, values: ["11/16/2026", "Compra", 12] },
        ],
        {
          dateColumn: 0,
          descriptionColumn: 1,
          amountColumn: 2,
          dateFormat: "ISO",
          decimalSeparator: "DOT",
        },
      ).map((row) => row.actualDate),
    ).toEqual(["2026-11-14", "2026-11-15", null]);
    expect(
      parseStatementRows([{ sourceRow: 5, values: [-1, "Compra", 10] }], {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "ISO",
        decimalSeparator: "DOT",
      })[0]?.actualDate,
    ).toBeNull();
    expect(
      parseStatementRows(
        [{ sourceRow: 2, values: ["11/16/2026", "Compra", 12] }],
        {
          dateColumn: 0,
          descriptionColumn: 1,
          amountColumn: 2,
          dateFormat: "MDY",
          decimalSeparator: "DOT",
        },
      )[0]?.actualDate,
    ).toBe("2026-11-16");
  });

  it("rejects unsafe numeric dates, malformed amounts and incomplete row values", () => {
    const rows = parseStatementRows(
      [
        { sourceRow: 2, values: [NaN, "", ""] },
        { sourceRow: 3, values: ["2026-02-29", "x".repeat(121), "1,234"] },
        { sourceRow: 4, values: ["2026-11-14", "Compra", 0] },
        { sourceRow: 5, values: ["2026-11-14", "Compra", "1.234,567"] },
        { sourceRow: 6, values: ["2026-11-14", "Compra", "-12,50R$"] },
        { sourceRow: 7, values: ["2026-11-14", "Compra", "1,2,3"] },
        { sourceRow: 8, values: ["2026-11-14", "Compra", "0"] },
        { sourceRow: 9, values: ["2026-11-14", "Compra", "1.234,56"] },
        { sourceRow: 10, values: ["2026-11-14", "Compra", NaN] },
      ],
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "ISO",
        decimalSeparator: "COMMA",
      },
    );

    expect(rows[0]?.errors).toContain("Informe a descrição.");
    expect(rows[0]?.errors).toContain(
      "Confira a data e o formato selecionado.",
    );
    expect(rows[1]?.errors).toContain(
      "A descrição deve ter até 120 caracteres.",
    );
    expect(rows[1]?.errors).toContain("Confira o valor e o separador decimal.");
    expect(rows[2]?.errors).toContain("O valor precisa ser maior que zero.");
    expect(rows[3]?.errors).toContain("Confira o valor e o separador decimal.");
    expect(rows[4]).toMatchObject({
      kind: "EXPENSE",
      amount: 12.5,
      errors: [],
    });
    expect(rows[5]?.errors).toContain("Confira o valor e o separador decimal.");
    expect(rows[6]?.errors).toContain("Confira o valor e o separador decimal.");
    expect(rows[7]).toMatchObject({
      kind: "INCOME",
      amount: 1234.56,
      errors: [],
    });
    expect(rows[8]?.errors).toContain("Confira o valor e o separador decimal.");

    const outOfRangeDate = parseStatementRows(
      [{ sourceRow: 10, values: ["31/12/1899", "Compra", 10] }],
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(outOfRangeDate[0]?.errors).toContain(
      "Confira a data e o formato selecionado.",
    );

    const dotDecimal = parseStatementRows(
      [{ sourceRow: 11, values: ["2026-11-14", "Compra", "1,234.56"] }],
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "ISO",
        decimalSeparator: "DOT",
      },
    );
    expect(dotDecimal[0]).toMatchObject({
      kind: "INCOME",
      amount: 1234.56,
      errors: [],
    });
  });

  it("validates debit-credit rows when both cells are empty or contain invalid values", () => {
    const rows = parseStatementRows(
      [
        { sourceRow: 2, values: ["2026-11-14", "Compra", "", ""] },
        { sourceRow: 3, values: ["2026-11-14", "Compra", "n/a", "2,00"] },
        { sourceRow: 4, values: ["2026-11-14", "Compra", 0, ""] },
      ],
      {
        dateColumn: 0,
        descriptionColumn: 1,
        debitColumn: 2,
        creditColumn: 3,
        dateFormat: "ISO",
        decimalSeparator: "COMMA",
      },
    );

    expect(rows[0]?.errors).toContain(
      "A linha precisa ter um débito ou crédito maior que zero.",
    );
    expect(rows[1]?.errors).toContain(
      "Confira os valores de débito e crédito.",
    );
    expect(rows[2]?.errors).toContain(
      "A linha precisa ter um débito ou crédito maior que zero.",
    );
  });
});
