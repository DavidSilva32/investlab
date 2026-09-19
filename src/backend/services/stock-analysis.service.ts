import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";
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

function numericValue(value: string | null) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateAnalysisIndicators(
  periods: FundamentalPeriod[],
  marketCap: number | null = null,
): AnalysisIndicator[] {
  const unavailableMarketValue =
    "Indisponível: a fonte de mercado não informou o valor de mercado do ativo.";
  const annual = periods
    .filter((period) => period.sourceDocument === "DFP")
    .sort((left, right) =>
      right.referenceDate.localeCompare(left.referenceDate),
    );
  const latest = periods
    .slice()
    .sort((left, right) =>
      right.referenceDate.localeCompare(left.referenceDate),
    )[0];
  const latestAnnual = annual[0];
  const previousAnnual = annual[1];
  const revenue = latest ? numericValue(latest.revenue) : null;
  const netIncome = latest ? numericValue(latest.netIncome) : null;
  const netMargin =
    revenue !== null && netIncome !== null && revenue !== 0
      ? (netIncome / revenue) * 100
      : null;
  const latestEquity = latestAnnual ? numericValue(latestAnnual.equity) : null;
  const previousEquity = previousAnnual
    ? numericValue(previousAnnual.equity)
    : null;
  const annualNetIncome = latestAnnual
    ? numericValue(latestAnnual.netIncome)
    : null;
  const hasMarketCap = marketCap !== null && marketCap > 0;
  const pe =
    hasMarketCap && annualNetIncome !== null && annualNetIncome > 0
      ? marketCap / annualNetIncome
      : null;
  const pb =
    hasMarketCap && latestEquity !== null && latestEquity > 0
      ? marketCap / latestEquity
      : null;
  const consecutiveYears =
    latestAnnual &&
    previousAnnual &&
    Number(latestAnnual.referenceDate.slice(0, 4)) -
      Number(previousAnnual.referenceDate.slice(0, 4)) ===
      1;
  const roe =
    consecutiveYears &&
    latestEquity !== null &&
    previousEquity !== null &&
    annualNetIncome !== null &&
    latestEquity + previousEquity !== 0
      ? (annualNetIncome / ((latestEquity + previousEquity) / 2)) * 100
      : null;
  const annualReferenceDate = latestAnnual?.referenceDate ?? null;

  return [
    {
      key: "pe",
      value: pe,
      unavailableReason:
        pe === null
          ? hasMarketCap
            ? "Indisponível: o último DFP anual não informou lucro líquido positivo compatível."
            : unavailableMarketValue
          : null,
      referenceDate: pe === null ? null : annualReferenceDate,
      sourceDocument: pe === null ? null : "DFP",
    },
    {
      key: "pb",
      value: pb,
      unavailableReason:
        pb === null
          ? hasMarketCap
            ? "Indisponível: o último DFP anual não informou patrimônio líquido positivo compatível."
            : unavailableMarketValue
          : null,
      referenceDate: pb === null ? null : annualReferenceDate,
      sourceDocument: pb === null ? null : "DFP",
    },
    {
      key: "roe",
      value: roe,
      unavailableReason:
        roe === null
          ? "Indisponível: são necessários dois DFPs anuais consecutivos, com lucro líquido e patrimônio líquido informados."
          : null,
      referenceDate: roe === null ? null : latestAnnual.referenceDate,
      sourceDocument: roe === null ? null : "DFP",
    },
    {
      key: "netMargin",
      value: netMargin,
      unavailableReason:
        netMargin === null
          ? "Indisponível: receita e lucro líquido precisam estar informados no mesmo demonstrativo, e a receita não pode ser zero."
          : null,
      referenceDate: latest?.referenceDate ?? null,
      sourceDocument: latest?.sourceDocument ?? null,
    },
  ];
}

export type AnalysisIndicatorKey = "pe" | "pb" | "roe" | "netMargin";

export type AnalysisIndicator = {
  key: AnalysisIndicatorKey;
  value: number | null;
  unavailableReason: string | null;
  referenceDate: string | null;
  sourceDocument: "DFP" | "ITR" | null;
};

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
    const periods: FundamentalPeriod[] = cacheValid
      ? cached.map(({ sourceDocument, fetchedAt, ...period }) => ({
          ...period,
          periodType: period.periodType as "annual" | "interim",
          sourceDocument: sourceDocument as "DFP" | "ITR",
        }))
      : await this.refreshFundamentals(market.ticker, market.cnpj, requestId);

    return {
      ...market,
      fundamentals: periods,
      indicators: calculateAnalysisIndicators(periods, market.marketCap),
    };
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
