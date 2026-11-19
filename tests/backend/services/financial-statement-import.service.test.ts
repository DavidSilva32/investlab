import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseStatementFile,
  parseStatementRows,
  findPossibleDuplicateRows,
  listAlreadyImportedRows,
  listSavedCategoryRules,
  confirmRows,
  listCategories,
} = vi.hoisted(() => ({
  parseStatementFile: vi.fn(),
  parseStatementRows: vi.fn(),
  findPossibleDuplicateRows: vi.fn(),
  listAlreadyImportedRows: vi.fn(),
  listSavedCategoryRules: vi.fn(),
  confirmRows: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock("@/backend/services/financial-statement-import-parser", () => ({
  parseStatementFile,
  parseStatementRows,
}));
vi.mock("@/backend/repositories/financial-statement-import.repository", () => ({
  normalizeStatementDescription: (value: string) =>
    value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " "),
  financialStatementImportRepository: {
    findPossibleDuplicateRows,
    listAlreadyImportedRows,
    listSavedCategoryRules,
    confirm: confirmRows,
  },
}));
vi.mock("@/backend/repositories/financial.repository", () => ({
  financialRepository: { listCategories },
}));

import { financialStatementImportService } from "@/backend/services/financial-statement-import.service";

describe("FinancialStatementImportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [{ sourceRow: 2, values: ["14/11/2026", "Compra", "10,00"] }],
    });
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "Compra",
        actualDate: "2026-11-14",
        amount: 10,
        errors: [],
      },
    ]);
    findPossibleDuplicateRows.mockResolvedValue([]);
    listAlreadyImportedRows.mockResolvedValue([]);
    listSavedCategoryRules.mockResolvedValue([]);
    listCategories.mockResolvedValue([
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        kind: "EXPENSE",
        name: "Alimentação",
        isDefault: true,
        active: true,
      },
      {
        id: "323e4567-e89b-42d3-a456-426614174000",
        kind: "EXPENSE",
        name: "Investimentos",
        isDefault: true,
        active: true,
      },
      {
        id: "423e4567-e89b-42d3-a456-426614174000",
        kind: "INCOME",
        name: "Resgates de investimentos",
        isDefault: true,
        active: true,
      },
      {
        id: "623e4567-e89b-42d3-a456-426614174000",
        kind: "INCOME",
        name: "Proventos de investimentos",
        isDefault: true,
        active: true,
      },
      {
        id: "723e4567-e89b-42d3-a456-426614174000",
        kind: "EXPENSE",
        name: "Transferências enviadas",
        isDefault: true,
        active: true,
      },
      {
        id: "823e4567-e89b-42d3-a456-426614174000",
        kind: "INCOME",
        name: "Transferências recebidas",
        isDefault: true,
        active: true,
      },
      {
        id: "923e4567-e89b-42d3-a456-426614174000",
        kind: "EXPENSE",
        name: "Fatura do cartão",
        isDefault: true,
        active: true,
      },
      ...[
        ["EXPENSE", "Transporte"],
        ["EXPENSE", "Saúde"],
        ["EXPENSE", "Moradia"],
        ["EXPENSE", "Contas e serviços"],
        ["EXPENSE", "Educação"],
        ["EXPENSE", "Impostos e taxas"],
        ["EXPENSE", "Seguros"],
        ["EXPENSE", "Lazer"],
        ["INCOME", "Salário"],
        ["INCOME", "Renda de aluguel"],
        ["INCOME", "Benefícios"],
      ].map(([kind, name], index) => ({
        id: `523e4567-e89b-42d3-a456-${String(index + 1).padStart(12, "0")}`,
        kind,
        name,
        isDefault: true,
        active: true,
      })),
    ]);
    confirmRows.mockResolvedValue({
      importedCount: 1,
      alreadyImportedCount: 0,
      duplicateCount: 0,
    });
  });

  it("detects columns from the row data when header names are unknown", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C"],
      rows: [{ sourceRow: 2, values: ["14/11/2026", "Compra", "10,00"] }],
    });
    const result = await financialStatementImportService.preview({
      name: "extrato.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
    expect(parseStatementRows).toHaveBeenCalledWith(
      [{ sourceRow: 2, values: ["14/11/2026", "Compra", "10,00"] }],
      result.mapping,
    );
  });

  it.each([
    [46_000, "1,234", "DMY", "DOT"],
    [undefined, "1.234", "DMY", "COMMA"],
    ["14/11/2026", "1.234,56", "DMY", "COMMA"],
    ["", "1234.", "DMY", "COMMA"],
  ])(
    "uses safe default mapping for date/value sample %s / %s",
    async (date, amount, dateFormat, decimalSeparator) => {
      parseStatementFile.mockReturnValue({
        hash: "a".repeat(64),
        headers: ["Date", "Description", "Amount"],
        rows: [{ sourceRow: 2, values: [date, "Purchase", amount] }],
      });
      const result = await financialStatementImportService.preview({
        name: "statement.csv",
        buffer: Buffer.from("x"),
      });
      expect(result.mapping).toMatchObject({ dateFormat, decimalSeparator });
    },
  );

  it("previews mapped rows and marks possible duplicates", async () => {
    findPossibleDuplicateRows.mockResolvedValue([2]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.mapping).toEqual({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
    expect(result.rows[0]).toMatchObject({ possibleDuplicate: true });
  });

  it("infers ISO dates and dot decimal values from the file content", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Transaction date", "Description", "Amount", "Balance"],
      rows: [
        {
          sourceRow: 2,
          values: ["2026-11-14", "Purchase", "1,234.56", "10,000.00"],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toEqual({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "ISO",
      decimalSeparator: "DOT",
    });
  });

  it("infers dates and decimal formatting for debit-credit statements", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Posting Date", "Memo", "Debit", "Credit"],
      rows: [
        {
          sourceRow: 2,
          values: ["2026-11-14", "Compra", "10.50", ""],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toEqual({
      dateColumn: 0,
      descriptionColumn: 1,
      debitColumn: 2,
      creditColumn: 3,
      dateFormat: "ISO",
      decimalSeparator: "DOT",
    });
  });

  it("uses MDY only when the sample makes the month-first order clear", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Date", "Description", "Amount"],
      rows: [
        {
          sourceRow: 2,
          values: ["11/14/2026", "Purchase", "10.50"],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toMatchObject({
      dateFormat: "MDY",
      decimalSeparator: "DOT",
    });
  });

  it("uses Brazilian defaults when dates and values are workbook serials", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Date", "Description", "Amount"],
      rows: [
        {
          sourceRow: 2,
          values: [46_000, "Purchase", 10.5],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.xlsx",
      buffer: Buffer.from("x"),
    });

    expect(result.mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
  });

  it("keeps a recognizable mapping and marks blank dates as row errors", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [{ sourceRow: 2, values: ["", "Compra", 10] }],
    });
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: null,
        description: "Compra",
        actualDate: null,
        amount: 10,
        errors: ["Confira a data e o formato selecionado."],
      },
    ]);
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });

    expect(result.mapping).toMatchObject({
      dateFormat: "DMY",
      decimalSeparator: "COMMA",
    });
    expect(result.rows[0]).toMatchObject({
      actualDate: null,
      categoryId: null,
      categorySource: null,
    });
  });

  it("uses the safe date fallback when a date header contains unrecognized values", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [{ sourceRow: 2, values: ["unrecognized", "Compra", 10] }],
    });
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: null,
        description: "Compra",
        actualDate: null,
        amount: 10,
        errors: ["Confira a data e o formato selecionado."],
      },
    ]);
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping.dateFormat).toBe("DMY");
  });

  it("keeps valid columns when the sample amount cells are missing", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [{ sourceRow: 2, values: ["14/11/2026", "Compra", undefined] }],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      decimalSeparator: "COMMA",
    });
  });

  it("keeps ambiguous dates neutral when another row clearly shows MDY", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Date", "Description", "Amount"],
      rows: [
        { sourceRow: 2, values: ["11/14/2026", "Purchase A", "10.50"] },
        { sourceRow: 3, values: ["11/12/2026", "Purchase B", "5.25"] },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping.dateFormat).toBe("MDY");
  });

  it("rejects multiple date columns inferred from content without headers", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C", "D"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "15/11/2026", "Compra", "10,00"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar com segurança a data deste arquivo.",
    );
  });

  it("rejects equally plausible date columns instead of choosing the first", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Date", "Descrição", "Valor"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "14/11/2026", "Compra", "10,00"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar com segurança a data deste arquivo.",
    );
  });

  it("rejects equally plausible description columns instead of choosing the first", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Histórico", "Valor"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra", "Compra", "10,00"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar com segurança a descrição deste arquivo.",
    );
  });

  it("rejects multiple unlabelled description candidates", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C", "D"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra A", "Compra B", "10,00"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "statement.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar automaticamente as colunas deste arquivo.",
    );
  });

  it("rejects equally plausible amount columns instead of choosing the first", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor", "Amount"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra", "10,00", "10,00"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar com segurança a coluna de valores deste arquivo.",
    );
  });

  it("rejects equally plausible debit columns instead of treating one as authoritative", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Débito", "Debit", "Crédito"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra", "10,00", "10,00", ""],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "statement.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar com segurança as colunas de entrada e saída deste arquivo.",
    );
  });

  it("does not infer a plain integer identifier as an amount", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra", "123456789"],
        },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar automaticamente a coluna de valores deste arquivo.",
    );
  });

  it("uses signed currency evidence when an amount header is missing", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Referência", "Movimento", "Extra"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra", "ABC123", "-R$ 10,50", ""],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 3,
      decimalSeparator: "COMMA",
    });
  });

  it("rejects data when it cannot identify a date column", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Referência", "Descrição", "Outro"],
      rows: [{ sourceRow: 2, values: ["ABC123", "Compra", "10"] }],
    });
    await expect(
      financialStatementImportService.preview({
        name: "statement.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível identificar automaticamente as colunas deste arquivo.",
    );
  });

  it("uses explicit money formatting to distinguish an amount from integer identifiers", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C", "D"],
      rows: [
        {
          sourceRow: 2,
          values: ["14/11/2026", "Compra A", "123456789", "10,50"],
        },
        {
          sourceRow: 3,
          values: ["15/11/2026", "Compra B", "123456790", "100"],
        },
      ],
    });
    const result = await financialStatementImportService.preview({
      name: "extrato.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 3,
      decimalSeparator: "COMMA",
    });
  });

  it("rejects mixed amount conventions instead of asking the user to choose one", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [
        { sourceRow: 2, values: ["14/11/2026", "Compra A", "10,50"] },
        { sourceRow: 3, values: ["15/11/2026", "Compra B", "10.50"] },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "extrato.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível reconhecer com segurança os valores deste arquivo.",
    );
  });

  it("rejects mixed date formats instead of silently changing their meaning", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["Data", "Descrição", "Valor"],
      rows: [
        { sourceRow: 2, values: ["14/11/2026", "Compra A", "10,50"] },
        { sourceRow: 3, values: ["2026-11-15", "Compra B", "10,50"] },
      ],
    });
    await expect(
      financialStatementImportService.preview({
        name: "statement.csv",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(
      "Não foi possível reconhecer com segurança as datas deste arquivo.",
    );
  });

  it("prefills an exact description and same-kind saved category", async () => {
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "  Mercado   do Bairro ",
        actualDate: "2026-11-14",
        amount: 10,
        errors: [],
      },
    ]);
    listSavedCategoryRules.mockResolvedValue([
      {
        kind: "EXPENSE",
        descriptionKey: "mercado do bairro",
        categoryId: "123e4567-e89b-42d3-a456-426614174000",
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.rows[0]).toMatchObject({
      categoryId: "123e4567-e89b-42d3-a456-426614174000",
      categorySource: "saved",
    });
  });

  it("ignores saved category rules that no longer match an active category", async () => {
    listSavedCategoryRules.mockResolvedValue([
      {
        kind: "EXPENSE",
        descriptionKey: "compra",
        categoryId: "missing-category-id",
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "statement.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );

    expect(result.rows[0]).toMatchObject({
      categoryId: null,
      categorySource: null,
    });
  });

  it("marks an already imported source row without proposing it again", async () => {
    listAlreadyImportedRows.mockResolvedValue([{ sourceRow: 2 }]);
    const result = await financialStatementImportService.preview({
      name: "statement.csv",
      buffer: Buffer.from("x"),
    });

    expect(listSavedCategoryRules).toHaveBeenCalledWith([]);
    expect(findPossibleDuplicateRows).toHaveBeenCalledWith([]);
    expect(result.rows[0]).toMatchObject({
      alreadyImported: true,
      possibleDuplicate: false,
    });
  });

  it("suggests the investment expense category without changing statement direction", async () => {
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "Aplicação: CDB Porq Obj BANCO",
        actualDate: "2026-11-14",
        amount: 2000,
        errors: [],
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.rows[0]).toMatchObject({
      kind: "EXPENSE",
      amount: 2000,
      categoryId: "323e4567-e89b-42d3-a456-426614174000",
      categorySource: "suggested",
    });
  });

  it("suggests the investment redemption category only for matching incoming rows", async () => {
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "INCOME",
        description: "Resgate CDB Banco",
        actualDate: "2026-11-14",
        amount: 2000,
        errors: [],
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.rows[0]).toMatchObject({
      kind: "INCOME",
      categoryId: "423e4567-e89b-42d3-a456-426614174000",
      categorySource: "suggested",
    });
  });

  it("leaves ambiguous investment descriptions without a category suggestion", async () => {
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "Investimento",
        actualDate: "2026-11-14",
        amount: 2000,
        errors: [],
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.rows[0]).toMatchObject({
      kind: "EXPENSE",
      categoryId: null,
      categorySource: null,
    });
  });

  it.each([
    ["EXPENSE", "UBER *TRIP", "Transporte"],
    ["EXPENSE", "PIX ENVIADO UBER *TRIP", "Transporte"],
    ["EXPENSE", "99APP *RIDE", "Transporte"],
    ["EXPENSE", "UBER EATS *ORDER", "Alimentação"],
    ["EXPENSE", "SUPERMERCADO CENTRAL", "Alimentação"],
    ["EXPENSE", "MERCADO CENTRAL", "Alimentação"],
    ["EXPENSE", "RESTAURANTE DA PRAÇA", "Alimentação"],
    ["EXPENSE", "FARMÁCIA POPULAR", "Saúde"],
    ["EXPENSE", "CONDOMÍNIO EDIFÍCIO AZUL", "Moradia"],
    ["EXPENSE", "FATURA DE INTERNET", "Contas e serviços"],
    ["EXPENSE", "CONTA DE LUZ", "Contas e serviços"],
    ["EXPENSE", "MENSALIDADE FACULDADE", "Educação"],
    ["EXPENSE", "IPVA 2026", "Impostos e taxas"],
    ["EXPENSE", "SEGURADORA PORTO", "Seguros"],
    ["EXPENSE", "Compra no debito: PATY LANCHES", "Alimentação"],
    ["EXPENSE", "Debito Iof Conta Global De Inv", "Impostos e taxas"],
    ["EXPENSE", "Debito B3: NOTA BOV 12/11/2026", "Investimentos"],
    ["EXPENSE", "Pagamento fatura cartao Inter", "Fatura do cartão"],
    ["EXPENSE", "Debito da fatura do cartão", "Fatura do cartão"],
    ["INCOME", "SALÁRIO FOLHA DE PAGAMENTO", "Salário"],
    ["INCOME", "ALUGUEL RECEBIDO", "Renda de aluguel"],
    ["INCOME", "BENEFÍCIO INSS", "Benefícios"],
    ["EXPENSE", "Pix enviado: Cp: Pessoa", "Transferências enviadas"],
    ["INCOME", "Pix recebido: Cp: Pessoa", "Transferências recebidas"],
    [
      "INCOME",
      "Credito Evento B3: * PROV * RENDIMENTO 2 XPML11",
      "Proventos de investimentos",
    ],
  ])(
    "suggests the expected category for %s description %s",
    async (kind, description, name) => {
      const selectedKind = kind as "INCOME" | "EXPENSE";
      parseStatementRows.mockReturnValue([
        {
          sourceRow: 2,
          kind: selectedKind,
          description,
          actualDate: "2026-11-14",
          amount: 25,
          errors: [],
        },
      ]);
      const result = await financialStatementImportService.preview(
        { name: "extrato.csv", buffer: Buffer.from("x") },
        {
          dateColumn: 0,
          descriptionColumn: 1,
          amountColumn: 2,
          dateFormat: "DMY",
          decimalSeparator: "COMMA",
        },
      );
      const availableCategories = await listCategories.mock.results[0]?.value;
      const match = availableCategories.find(
        (candidate: { name: string }) => candidate.name === name,
      );
      expect(result.rows[0]).toMatchObject({
        kind: selectedKind,
        amount: 25,
        categoryId: match.id,
        categorySource: "suggested",
      });
    },
  );

  it.each([
    ["EXPENSE", "MERCADO LIVRE COMPRA ONLINE"],
    ["EXPENSE", "Fatura do Inter"],
    ["EXPENSE", "MERCADO PAGO COMPRA ONLINE"],
    ["INCOME", "UBER *TRIP AJUSTE"],
    ["INCOME", "Credito Evento B3: VENDA DE ATIVO XPML11"],
  ])(
    "does not guess a category for %s description %s",
    async (kind, description) => {
      parseStatementRows.mockReturnValue([
        {
          sourceRow: 2,
          kind: kind as "INCOME" | "EXPENSE",
          description,
          actualDate: "2026-11-14",
          amount: 25,
          errors: [],
        },
      ]);
      const result = await financialStatementImportService.preview(
        { name: "extrato.csv", buffer: Buffer.from("x") },
        {
          dateColumn: 0,
          descriptionColumn: 1,
          amountColumn: 2,
          dateFormat: "DMY",
          decimalSeparator: "COMMA",
        },
      );
      expect(result.rows[0]).toMatchObject({
        categoryId: null,
        categorySource: null,
      });
    },
  );

  it("does not share private custom categories through global text suggestions", async () => {
    listCategories.mockResolvedValue([
      {
        id: "623e4567-e89b-42d3-a456-426614174000",
        kind: "EXPENSE",
        name: "Transporte",
        isDefault: false,
        active: true,
      },
    ]);
    parseStatementRows.mockReturnValue([
      {
        sourceRow: 2,
        kind: "EXPENSE",
        description: "UBER *TRIP",
        actualDate: "2026-11-14",
        amount: 25,
        errors: [],
      },
    ]);
    const result = await financialStatementImportService.preview(
      { name: "extrato.csv", buffer: Buffer.from("x") },
      {
        dateColumn: 0,
        descriptionColumn: 1,
        amountColumn: 2,
        dateFormat: "DMY",
        decimalSeparator: "COMMA",
      },
    );
    expect(result.rows[0]).toMatchObject({
      categoryId: null,
      categorySource: null,
    });
  });

  it("confirms overlapping rows without requiring duplicate acknowledgement", async () => {
    confirmRows.mockResolvedValue({
      importedCount: 0,
      alreadyImportedCount: 0,
      duplicateCount: 1,
    });
    const input = {
      fileHash: "a".repeat(64),
      rows: [
        {
          sourceRow: 2,
          kind: "EXPENSE",
          description: "Compra",
          categoryId: null,
          actualDate: "2026-11-14",
          actualAmount: 10,
        },
      ],
    };
    const result = await financialStatementImportService.confirm(input);
    expect(result).toEqual({
      importedCount: 0,
      alreadyImportedCount: 0,
      duplicateCount: 1,
      skippedCount: 1,
    });
    expect(findPossibleDuplicateRows).not.toHaveBeenCalled();
    expect(confirmRows).toHaveBeenCalledOnce();
    expect(confirmRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ rememberCategories: true }),
    );
  });

  it("does not compare rows already imported from the same statement", async () => {
    confirmRows.mockResolvedValue({
      importedCount: 0,
      alreadyImportedCount: 1,
      duplicateCount: 0,
    });
    const result = await financialStatementImportService.confirm({
      fileHash: "a".repeat(64),
      rows: [
        {
          sourceRow: 2,
          kind: "EXPENSE",
          description: "Compra",
          categoryId: null,
          actualDate: "2026-11-14",
          actualAmount: 10,
        },
      ],
    });

    expect(findPossibleDuplicateRows).not.toHaveBeenCalled();
    expect(confirmRows).toHaveBeenCalledOnce();
    expect(result.skippedCount).toBe(1);
  });

  it("passes the user's category-memory opt-out to persistence", async () => {
    await financialStatementImportService.confirm({
      fileHash: "a".repeat(64),
      rememberCategories: false,
      rows: [
        {
          sourceRow: 2,
          kind: "EXPENSE",
          description: "Compra",
          categoryId: "123e4567-e89b-42d3-a456-426614174000",
          actualDate: "2026-11-14",
          actualAmount: 10,
        },
      ],
    });
    expect(confirmRows).toHaveBeenCalledWith(
      expect.objectContaining({ rememberCategories: false }),
    );
  });

  it("rejects categories with the wrong kind or inactive categories", async () => {
    const input = {
      fileHash: "a".repeat(64),
      rows: [
        {
          sourceRow: 2,
          kind: "INCOME",
          description: "Compra",
          categoryId: "123e4567-e89b-42d3-a456-426614174000",
          actualDate: "2026-11-14",
          actualAmount: 10,
        },
      ],
    };
    await expect(
      financialStatementImportService.confirm(input),
    ).rejects.toThrow("categoria ativa compatível");
    expect(confirmRows).not.toHaveBeenCalled();
  });

  it("rejects malformed confirmation data before reading categories", async () => {
    await expect(
      financialStatementImportService.confirm({ rows: [] }),
    ).rejects.toThrow("Revise os lançamentos antes de confirmar.");
    expect(listCategories).not.toHaveBeenCalled();
    expect(confirmRows).not.toHaveBeenCalled();
  });
});
