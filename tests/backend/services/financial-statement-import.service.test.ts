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

  it("accepts a confirmed duplicate only after explicit acknowledgement", async () => {
    findPossibleDuplicateRows.mockResolvedValue([2]);
    const input = {
      fileHash: "a".repeat(64),
      allowPossibleDuplicates: false,
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
    };
    await expect(
      financialStatementImportService.confirm(input),
    ).rejects.toThrow("Há possíveis duplicidades.");
    expect(confirmRows).not.toHaveBeenCalled();
    const result = await financialStatementImportService.confirm({
      ...input,
      allowPossibleDuplicates: true,
    });
    expect(result).toEqual({
      importedCount: 1,
      alreadyImportedCount: 0,
      possibleDuplicateCount: 1,
    });
    expect(confirmRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ rememberCategories: true }),
    );
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
});
