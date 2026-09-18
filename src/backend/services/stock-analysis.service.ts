import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";
import type { FundamentalsProvider } from "@/backend/providers/fundamentals.provider";
import type { MarketDataProvider } from "@/backend/providers/market-data.provider";
import {
  stockFundamentalsRepository,
  type StockFundamentalsRepository,
} from "@/backend/repositories/stock-fundamentals.repository";
import { logger } from "@/infrastructure/logging/logger";

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}[0-9]{1,2}$/, "Informe um ticker B3 válido.");

export class StockAnalysisService {
  constructor(
    private readonly marketProvider: MarketDataProvider = new BrapiMarketDataProvider(),
    private readonly fundamentalsProvider: FundamentalsProvider = new CvmFundamentalsProvider(),
    private readonly repository: Pick<
      StockFundamentalsRepository,
      "listByTicker" | "save"
    > = stockFundamentalsRepository,
  ) {}

  async getByTicker(rawTicker: unknown, requestId?: string) {
    const parsed = tickerSchema.safeParse(rawTicker);
    if (!parsed.success)
      throw new ApplicationError(
        parsed.error.issues[0]?.message ?? "Informe um ticker B3 válido.",
        400,
      );

    const market = await this.marketProvider.getByTicker(parsed.data);
    const cached = await this.repository.listByTicker(market.ticker);
    const cacheValid =
      cached.length > 0 &&
      Date.now() - cached[0].fetchedAt.getTime() < 1000 * 60 * 60 * 24;
    const fundamentals = cacheValid
      ? cached.map(
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
        )
      : await this.loadFundamentals(market.ticker, market.cnpj, requestId);

    return { ...market, fundamentals };
  }

  private async loadFundamentals(
    ticker: string,
    cnpj: string | null,
    requestId?: string,
  ) {
    try {
      const periods = await this.fundamentalsProvider.getByTicker({
        ticker,
        cnpj,
      });
      if (cnpj)
        await this.repository.save(
          ticker,
          cnpj,
          String(new Date().getUTCFullYear() - 1),
          periods,
        );
      return periods;
    } catch (error) {
      logger.warn("stock_fundamentals_unavailable", {
        requestId,
        ticker,
        error,
      });
      return [];
    }
  }
}

export const stockAnalysisService = new StockAnalysisService();
