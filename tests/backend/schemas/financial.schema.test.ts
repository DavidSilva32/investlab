import { describe, expect, it } from "vitest";
import {
  financialCategoryCreateSchema,
  financialCategoryUpdateSchema,
  financialEntryCreateSchema,
  financialEntryUpdateSchema,
} from "@/backend/schemas/financial.schema";

const categoryId = "24e0fa40-0563-4e4e-a52e-64fab0e6f79f";
const entryId = "9d8a6635-8f15-4b1b-a25c-e49817d7292a";

describe("financial schemas", () => {
  it("accepts planned and realized values only when their dates are paired", () => {
    const planned = financialEntryCreateSchema.safeParse({
      kind: "EXPENSE",
      description: " Aluguel ",
      categoryId,
      expectedAmount: 550,
      expectedDate: "2026-10-05",
    });
    expect(planned.success).toBe(true);
    if (planned.success) expect(planned.data.description).toBe("Aluguel");

    expect(
      financialEntryCreateSchema.safeParse({
        kind: "INCOME",
        description: "Salário",
        categoryId,
        actualAmount: 5000,
        actualDate: "2026-10-01",
      }).success,
    ).toBe(true);

    expect(
      financialEntryCreateSchema.safeParse({
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
        expectedAmount: 100,
      }).success,
    ).toBe(false);
    expect(
      financialEntryCreateSchema.safeParse({
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
        actualDate: "2026-10-10",
      }).success,
    ).toBe(false);
    expect(
      financialEntryCreateSchema.safeParse({
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
      }).success,
    ).toBe(false);
  });

  it("validates amount precision, date shape, and entry update identity", () => {
    const invalidAmount = financialEntryCreateSchema.safeParse({
      kind: "EXPENSE",
      description: "Conta",
      categoryId,
      expectedAmount: 10.005,
      expectedDate: "2026-10-01",
    });
    expect(invalidAmount.success).toBe(false);
    expect(
      financialEntryCreateSchema.safeParse({
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
        expectedAmount: 10,
        expectedDate: "01/10/2026",
      }).success,
    ).toBe(false);
    expect(
      financialEntryUpdateSchema.safeParse({
        id: entryId,
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
        actualAmount: 12.5,
        actualDate: "2026-10-02",
      }).success,
    ).toBe(true);
    expect(
      financialEntryUpdateSchema.safeParse({
        id: "invalid-id",
        kind: "EXPENSE",
        description: "Conta",
        categoryId,
        actualAmount: 12,
        actualDate: "2026-10-02",
      }).success,
    ).toBe(false);
  });

  it("normalizes category creation and requires a change for category updates", () => {
    expect(
      financialCategoryCreateSchema.parse({
        kind: "INCOME",
        name: " Salário ",
      }),
    ).toEqual({ kind: "INCOME", name: "Salário" });
    expect(
      financialCategoryCreateSchema.safeParse({ kind: "OTHER", name: "X" })
        .success,
    ).toBe(false);
    expect(
      financialCategoryUpdateSchema.safeParse({ id: categoryId }).success,
    ).toBe(false);
    expect(
      financialCategoryUpdateSchema.safeParse({
        id: categoryId,
        active: false,
      }).success,
    ).toBe(true);
  });
});
