import { z } from "zod";

const columnIndex = z.number().int().min(0).max(199);
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

export const statementMappingSchema = z
  .object({
    dateColumn: columnIndex,
    descriptionColumn: columnIndex,
    amountColumn: columnIndex.optional(),
    debitColumn: columnIndex.optional(),
    creditColumn: columnIndex.optional(),
    dateFormat: z.enum(["DMY", "MDY", "ISO"]),
    decimalSeparator: z.enum(["COMMA", "DOT"]),
  })
  .strict()
  .superRefine((mapping, context) => {
    const signed = mapping.amountColumn !== undefined;
    const separate =
      mapping.debitColumn !== undefined && mapping.creditColumn !== undefined;
    if (signed === separate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Selecione uma coluna de valor ou as colunas de débito e crédito.",
      });
    }
    const columns = [
      mapping.dateColumn,
      mapping.descriptionColumn,
      mapping.amountColumn,
      mapping.debitColumn,
      mapping.creditColumn,
    ].filter((value): value is number => value !== undefined);
    if (new Set(columns).size !== columns.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada informação deve usar uma coluna diferente.",
      });
    }
  });

export const statementConfirmSchema = z
  .object({
    fileHash: hash,
    allowPossibleDuplicates: z.boolean().default(false),
    rememberCategories: z.boolean().default(true),
    rows: z
      .array(
        z
          .object({
            sourceRow: z.number().int().min(2).max(100_000),
            kind: z.enum(["INCOME", "EXPENSE"]),
            description: z.string().trim().min(1).max(120),
            categoryId: z.string().uuid(),
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

export type StatementMapping = z.infer<typeof statementMappingSchema>;
export type StatementConfirmInput = z.infer<typeof statementConfirmSchema>;
