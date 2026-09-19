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
const cacheDurationMs = 1000 * 60 * 60 * 24;

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
      Date.now() - cached[0].fetchedAt.getTime() < cacheDurationMs;
    logger.info("stock_fundamentals_cache_checked", {
      requestId,
      ticker: market.ticker,
      cachedPeriods: cached.length,
      cacheValid,
      cnpjAvailable: Boolean(market.cnpj),
    });
    const periods = cacheValid
      ? cached.map(({ sourceDocument, fetchedAt, ...period }) => ({
          ...period,
          periodType: period.periodType as "annual" | "quarterly",
          sourceDocument: sourceDocument as "DFP" | "ITR",
        }))
      : await this.refreshFundamentals(market.ticker, market.cnpj, requestId);

    return { ...market, fundamentals: periods };
  }

  private async refreshFundamentals(
    ticker: string,
    cnpj: string | null,
    requestId?: string,
  ) {
    logger.info("stock_fundamentals_refresh_started", {
      requestId,
      ticker,
      cnpjAvailable: Boolean(cnpj),
    });
    try {
      const periods = await this.fundamentalsProvider.getByTicker({
        ticker,
        cnpj,
      });
      if (!cnpj)
        throw new ApplicationError(
          "Não foi possível associar o ativo à CVM.",
          422,
        );
      await this.repository.save(
        ticker,
        cnpj,
        String(new Date().getUTCFullYear()),
        periods,
      );
      logger.info("stock_fundamentals_persisted", {
        requestId,
        ticker,
        periods: periods.length,
      });
      return periods;
    } catch (error) {
      logger.error("stock_fundamentals_refresh_failed", {
        requestId,
        ticker,
        stage: "cvm_refresh",
        error,
      });
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "Não foi possível consultar os demonstrativos oficiais da CVM agora.",
        502,
      );
    }
  }
}

export const stockAnalysisService = new StockAnalysisService();
