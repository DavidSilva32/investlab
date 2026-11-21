import { z } from "zod";

export const financialCardSettlementResolutionSchema = z
  .object({
    settlementEntryId: z.string().uuid(),
    resolution: z.enum(["LINKED", "NOT_RELATED"]),
    cardEntryIds: z.array(z.string().uuid()).max(500),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.cardEntryIds).size !== input.cardEntryIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Há compras repetidas na seleção.",
      });
    }
    if (
      (input.resolution === "LINKED" && input.cardEntryIds.length === 0) ||
      (input.resolution === "NOT_RELATED" && input.cardEntryIds.length > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Revise as compras selecionadas para esta decisão.",
      });
    }
  });

export type FinancialCardSettlementResolution = z.infer<
  typeof financialCardSettlementResolutionSchema
>;
