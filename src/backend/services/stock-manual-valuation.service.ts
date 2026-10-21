import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  stockOpportunityManualInputRepository,
  type StockOpportunityInputKey,
  type StockOpportunityManualInputRepository,
} from "@/backend/repositories/stock-opportunity-manual-input.repository";

const tickerPattern = /^[A-Z]{4}[0-9]{1,2}$/;
const manualKeys = ["analysis_ltm_eps", "analysis_bvps"] as const;
type ManualKey = (typeof manualKeys)[number];

const todayUtc = () => new Date().toISOString().slice(0, 10);
const inputSchema = z.object({
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  source: z.string().trim().min(2).max(160),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        value <= todayUtc()
      );
    }),
});

export class StockManualValuationService {
  constructor(
    private readonly manualInputs: Pick<
      StockOpportunityManualInputRepository,
      "listByTicker" | "upsert"
    > = stockOpportunityManualInputRepository,
  ) {}

  async list(ticker: string) {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!tickerPattern.test(normalizedTicker))
      throw new ApplicationError("O código da ação não é válido.", 400);
    const inputs = await this.manualInputs.listByTicker(normalizedTicker);
    return {
      ticker: normalizedTicker,
      inputs: inputs
        .filter((input) => manualKeys.includes(input.inputKey as ManualKey))
        .map((input) => ({
          inputKey: input.inputKey as ManualKey,
          value: Number(input.value),
          source: input.source,
          asOf: input.asOf,
        })),
    };
  }

  async save(ticker: string, inputKey: string, raw: unknown) {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (
      !tickerPattern.test(normalizedTicker) ||
      !manualKeys.includes(inputKey as ManualKey)
    )
      throw new ApplicationError("A entrada informada não é válida.", 400);
    const parsed = inputSchema.safeParse(raw);
    if (
      !parsed.success ||
      (inputKey === "analysis_bvps" && parsed.data.value <= 0)
    )
      throw new ApplicationError(
        "Informe um LPA válido ou um VPA positivo, a origem e uma data de referência válida.",
        400,
      );
    const saved = await this.manualInputs.upsert({
      ticker: normalizedTicker,
      inputKey: inputKey as StockOpportunityInputKey,
      ...parsed.data,
    });
    return {
      inputKey: saved.inputKey as ManualKey,
      value: Number(saved.value),
      source: saved.source,
      asOf: saved.asOf,
    };
  }
}

export const stockManualValuationService = new StockManualValuationService();
