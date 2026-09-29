import { z } from "zod";

export const valuationInputTypes = [
  "observed",
  "external_estimate",
  "derived",
  "premise",
] as const;

export const valuationComponentSchema = z
  .object({
    value: z.number().finite(),
    type: z.enum(valuationInputTypes).nullable(),
    source: z.string(),
    asOf: z.string(),
    currency: z.string(),
    basis: z.string(),
    unit: z.enum(["currency", "percentage", "ratio"]),
    horizon: z.string(),
    method: z.string(),
    version: z.string(),
  })
  .nullable();

export const stockValuationRequestSchema = z.object({
  forecastYears: z.number().int().min(1).max(10).nullable(),
  continuityConfirmed: z.boolean(),
  countryRiskOverlapReviewed: z.boolean(),
  inputs: z.object({
    baseFcff: valuationComponentSchema,
    downsideGrowth: valuationComponentSchema,
    baseGrowth: valuationComponentSchema,
    upsideGrowth: valuationComponentSchema,
    riskFreeRate: valuationComponentSchema,
    equityRiskPremium: valuationComponentSchema,
    beta: valuationComponentSchema,
    preTaxCostOfDebt: valuationComponentSchema,
    taxRate: valuationComponentSchema,
    equityWeight: valuationComponentSchema,
    debtWeight: valuationComponentSchema,
    terminalGrowth: valuationComponentSchema,
    terminalWacc: valuationComponentSchema,
  }),
});

export type StockValuationRequest = z.infer<typeof stockValuationRequestSchema>;
