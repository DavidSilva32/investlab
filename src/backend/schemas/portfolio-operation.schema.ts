import { z } from "zod";

const decimal = z.string().regex(/^\d{1,16}(?:\.\d{1,8})?$/);

export const portfolioOperationSchema = z
  .object({
    side: z.enum(["BUY", "SELL"]),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }),
    product: z.string().trim().min(1).max(200),
    assetCode: z.string().trim().max(24).nullable(),
    quantity: decimal.refine((value) => Number(value) > 0),
    unitPrice: decimal.refine((value) => Number(value) > 0),
    currency: z.string().regex(/^[A-Z]{3}$/),
    fees: decimal.nullable(),
  })
  .strict();

export const reconciliationRequestSchema = z
  .object({
    movementId: z.string().uuid(),
    action: z.enum(["LINK", "UNLINK"]),
  })
  .strict();
