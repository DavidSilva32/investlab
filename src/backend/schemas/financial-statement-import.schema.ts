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
    source: z.literal("ACCOUNT").default("ACCOUNT"),
    accountAlias: z.string().trim().min(1).max(80).nullable().optional(),
    coverageStart: date.nullable().default(null),
    coverageEnd: date.nullable().default(null),
    rememberCategories: z.boolean().default(true),
    rows: z
      .array(
        z
          .object({
            sourceRow: z.number().int().min(2).max(100_000),
            kind: z.enum(["INCOME", "EXPENSE"]),
            description: z.string().trim().min(1).max(120),
            categoryId: z.string().uuid().nullable(),
            manualDuplicateEntryId: z.string().uuid().nullable().optional(),
            accountDuplicateEntryId: z.string().uuid().nullable().optional(),
            confirmedDistinct: z.boolean().optional(),
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
      (input.coverageStart === null) !== (input.coverageEnd === null) ||
      (input.coverageStart !== null &&
        input.coverageEnd !== null &&
        input.coverageStart > input.coverageEnd)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confira o período coberto pelo extrato.",
      });
    }
    if (
      new Set(input.rows.map((row) => row.sourceRow)).size !== input.rows.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Há linhas repetidas na confirmação.",
      });
    }
    const selectedManualIds = input.rows
      .map((row) => row.manualDuplicateEntryId)
      .filter((id): id is string => Boolean(id));
    if (new Set(selectedManualIds).size !== selectedManualIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cada lançamento manual só pode corresponder a uma linha do extrato.",
      });
    }
    const selectedAccountIds = input.rows
      .map((row) => row.accountDuplicateEntryId)
      .filter((id): id is string => Boolean(id));
    if (new Set(selectedAccountIds).size !== selectedAccountIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cada movimentação existente só pode corresponder a uma linha do extrato.",
      });
    }
  });

export type StatementConfirmInput = z.input<typeof statementConfirmSchema>;
export type ParsedStatementConfirmInput = z.output<
  typeof statementConfirmSchema
>;
