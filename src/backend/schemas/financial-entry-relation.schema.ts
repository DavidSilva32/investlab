import { z } from "zod";

export const financialEntryRelationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["TRANSFER", "REVERSAL"]),
      entryId: z.string().uuid(),
      relatedEntryId: z.string().uuid(),
    })
    .strict()
    .refine((value) => value.entryId !== value.relatedEntryId, {
      message: "Escolha dois lançamentos diferentes.",
    }),
  z
    .object({
      kind: z.literal("REVERSAL_DISMISSED"),
      entryId: z.string().uuid(),
    })
    .strict(),
]);

export type FinancialEntryRelationInput = z.infer<
  typeof financialEntryRelationSchema
>;
