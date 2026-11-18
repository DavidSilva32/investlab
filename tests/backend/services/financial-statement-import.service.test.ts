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
        active: true,
      },
    ]);
    confirmRows.mockResolvedValue({
      importedCount: 1,
      alreadyImportedCount: 0,
    });
  });

  it("returns raw rows when no safe column mapping can be suggested", async () => {
    parseStatementFile.mockReturnValue({
      hash: "a".repeat(64),
      headers: ["A", "B", "C"],
      rows: [{ sourceRow: 2, values: ["14/11/2026", "Compra", "10,00"] }],
    });
    const result = await financialStatementImportService.preview({
      name: "extrato.csv",
      buffer: Buffer.from("x"),
    });
    expect(result.mapping).toBeNull();
    expect(result.rows[0]).toMatchObject({ sourceRow: 2 });
    expect(parseStatementRows).not.toHaveBeenCalled();
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
