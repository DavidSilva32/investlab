import { z } from "zod";

export const financialKinds = ["INCOME", "EXPENSE"] as const;
export type FinancialKind = (typeof financialKinds)[number];

const maximumAmount = 999_999_999_999.99;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountSchema = z
  .number()
  .finite()
  .positive()
  .max(maximumAmount)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "Use no máximo duas casas decimais.",
  );

const financialEntryFields = z.object({
  kind: z.enum(financialKinds),
  description: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid(),
  expectedAmount: amountSchema.nullable().optional(),
  expectedDate: dateSchema.nullable().optional(),
  actualAmount: amountSchema.nullable().optional(),
  actualDate: dateSchema.nullable().optional(),
});

function validateAmountDatePairs(
  value: z.infer<typeof financialEntryFields>,
  context: z.RefinementCtx,
) {
  const expectedAmount = value.expectedAmount ?? null;
  const expectedDate = value.expectedDate ?? null;
  const actualAmount = value.actualAmount ?? null;
  const actualDate = value.actualDate ?? null;

  if ((expectedAmount === null) !== (expectedDate === null)) {
    context.addIssue({
      code: "custom",
      message: "Informe juntos o valor e a data previstos.",
      path: [expectedAmount === null ? "expectedAmount" : "expectedDate"],
    });
  }
  if ((actualAmount === null) !== (actualDate === null)) {
    context.addIssue({
      code: "custom",
      message: "Informe juntos o valor e a data realizados.",
      path: [actualAmount === null ? "actualAmount" : "actualDate"],
    });
  }
  if (expectedAmount === null && actualAmount === null) {
    context.addIssue({
      code: "custom",
      message: "Informe um valor previsto ou realizado.",
      path: ["expectedAmount"],
    });
  }
}

export const financialEntryCreateSchema = financialEntryFields.superRefine(
  validateAmountDatePairs,
);

export const financialEntryUpdateSchema = financialEntryFields
  .extend({ id: z.string().uuid() })
  .superRefine(validateAmountDatePairs);

export const financialCategoryCreateSchema = z.object({
  kind: z.enum(financialKinds),
  name: z.string().trim().min(1).max(80),
});

export const financialCategoryUpdateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.active !== undefined);

export type FinancialEntryInput = z.infer<typeof financialEntryCreateSchema>;
export type FinancialEntryUpdateInput = z.infer<
  typeof financialEntryUpdateSchema
>;
