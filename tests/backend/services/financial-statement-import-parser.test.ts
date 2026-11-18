import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
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
});
