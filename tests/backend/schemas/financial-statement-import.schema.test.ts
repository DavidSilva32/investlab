import { describe, expect, it } from "vitest";
import { statementConfirmSchema } from "@/backend/schemas/financial-statement-import.schema";

const validInput = {
  fileHash: "a".repeat(64),
  rows: [
    {
      sourceRow: 2,
      kind: "EXPENSE",
      description: " Mercado ",
      categoryId: "123e4567-e89b-42d3-a456-426614174000",
      actualDate: "2026-11-14",
      actualAmount: 12.5,
    },
  ],
};

describe("statementConfirmSchema", () => {
  it("applies default options and trims valid row descriptions", () => {
    expect(statementConfirmSchema.parse(validInput)).toMatchObject({
      allowPossibleDuplicates: false,
      rememberCategories: true,
      rows: [{ description: "Mercado" }],
    });
  });

  it("accepts explicit flags and valid ISO calendar dates", () => {
    expect(
      statementConfirmSchema.parse({
        ...validInput,
        allowPossibleDuplicates: true,
        rememberCategories: false,
        rows: [{ ...validInput.rows[0], actualDate: "2024-02-29" }],
      }),
    ).toMatchObject({
      allowPossibleDuplicates: true,
      rememberCategories: false,
    });
  });

  it.each(["2026-02-29", "2026-13-01", "14/11/2026", "2026-2-01"])(
    "rejects invalid calendar date %s",
    (actualDate) => {
      expect(
        statementConfirmSchema.safeParse({
          ...validInput,
          rows: [{ ...validInput.rows[0], actualDate }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects repeated source rows", () => {
    const result = statementConfirmSchema.safeParse({
      ...validInput,
      rows: [validInput.rows[0], { ...validInput.rows[0] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          code: "custom",
          message: "Há linhas repetidas na confirmação.",
        }),
      );
    }
  });

  it.each([
    { fileHash: "bad" },
    { rows: [] },
    { rows: Array.from({ length: 501 }, () => validInput.rows[0]) },
    { rows: [{ ...validInput.rows[0], sourceRow: 1 }] },
    { rows: [{ ...validInput.rows[0], sourceRow: 100_001 }] },
    { rows: [{ ...validInput.rows[0], kind: "TRANSFER" }] },
    { rows: [{ ...validInput.rows[0], description: "   " }] },
    { rows: [{ ...validInput.rows[0], categoryId: "not-a-uuid" }] },
    { rows: [{ ...validInput.rows[0], actualAmount: Number.NaN }] },
    { rows: [{ ...validInput.rows[0], actualAmount: Infinity }] },
    { rows: [{ ...validInput.rows[0], actualAmount: 0 }] },
    { rows: [{ ...validInput.rows[0], actualAmount: 1_000_000_000_000 }] },
    { unexpected: true },
  ])("rejects invalid confirmation data %#", (override) => {
    expect(
      statementConfirmSchema.safeParse({ ...validInput, ...override }).success,
    ).toBe(false);
  });
});
