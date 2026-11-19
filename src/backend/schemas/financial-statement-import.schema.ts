import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

export const statementConfirmSchema = z
  .object({
    fileHash: hash,
    rememberCategories: z.boolean().default(true),
    rows: z
      .array(
        z
          .object({
            sourceRow: z.number().int().min(2).max(100_000),
            kind: z.enum(["INCOME", "EXPENSE"]),
            description: z.string().trim().min(1).max(120),
            categoryId: z.string().uuid().nullable(),
            possibleDuplicate: z.boolean().optional(),
            actualDate: date,
            actualAmount: z
              .number()
              .finite()
              .positive()
              .max(999_999_999_999.99),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.rows.map((row) => row.sourceRow)).size !== input.rows.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Há linhas repetidas na confirmação.",
      });
    }
  });

export type StatementConfirmInput = z.infer<typeof statementConfirmSchema>;
