import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import type { MarketDataProvider } from "@/backend/providers/market-data.provider";
import {
  stockFundamentalsRepository,
  type StockFundamentalsRepository,
} from "@/backend/repositories/stock-fundamentals.repository";

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}[0-9]{1,2}$/, "Informe um ticker B3 válido.");

export class StockAnalysisService {
  constructor(
    private readonly marketProvider: MarketDataProvider = new BrapiMarketDataProvider(),
    private readonly repository: Pick<
      StockFundamentalsRepository,
      "listByTicker"
    > = stockFundamentalsRepository,
  ) {}

  async getByTicker(rawTicker: unknown, _requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(
        parsed.error.issues[0]?.message ?? "Informe um ticker B3 válido.",
        400,
      );

    const market = await this.marketProvider.getByTicker(parsed.data);
    const cached = await this.repository.listByTicker(market.ticker);
    const fundamentals = cached.map(
      ({
        referenceDate,
        periodType,
        revenue,
        netIncome,
        equity,
        assets,
        liabilities,
        cash,
        debt,
      }) => ({
        referenceDate,
        periodType: periodType as "annual" | "quarterly",
        revenue,
        netIncome,
        equity,
        assets,
        liabilities,
        cash,
        debt,
      }),
    );

    return { ...market, fundamentals };
  }
}

export const stockAnalysisService = new StockAnalysisService();
